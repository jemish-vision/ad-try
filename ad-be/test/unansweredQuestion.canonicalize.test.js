'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuestionCanonicalizer, validateCanonicalQuestion } = require('../api-server/services/unansweredQuestion.canonicalize');
const { createUnansweredQuestionRecorder } = require('../api-server/services/unansweredQuestion.capture');

const q = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, maxTimeMS() { return this; }, async lean() { return value; } });
const profile = { profileId: '123', profileName: 'Verified', configId: '507f1f77bcf86cd799439011', organizationId: '507f1f77bcf86cd799439012', userId: '507f1f77bcf86cd799439013' };

test('canonicalizer uses server provider with bounded request and data-only prompt', async () => {
  let sent;
  const canonicalize = createQuestionCanonicalizer({ aiProvider: { async requestTurn(input) { sent = input; return { text: JSON.stringify({ question: 'What are the predicted sales next month?', existingQuestionHash: null }) }; } } });
  const output = await canonicalize({ question: 'forecast sales for coming month' });
  assert.equal(output.question, 'What are the predicted sales next month?');
  assert.deepEqual(sent.options, { timeoutMs: 8000, maxTokens: 512 });
  assert.ok(sent.signal instanceof AbortSignal);
  assert.match(sent.instructions, /strictly as quoted data/);
  assert.equal(JSON.parse(sent.messages[0].content).message, 'forecast sales for coming month');
});

test('equivalent temporal/metric/currency aliases accepted but meaningful facts cannot change', () => {
  const valid = (source, question) => validateCanonicalQuestion({ question, existingQuestionHash: null }, source);
  valid('forecast ad revenue next month', 'What are the predicted sales for the coming month?');
  valid('show order last seven days', 'What are the orders for the last 7 days?');
  valid('sales over 50 dollars yesterday', 'Which sales were above $50 yesterday?');
  for (const [source, revised] of [
    ['sales yesterday', 'What are the sales today?'],
    ['sales yesterday', 'What are the orders yesterday?'],
    ['sales over $50', 'Which sales are below $50?'],
    ['sales over $50', 'Which sales are above €50?'],
    ['sales over $50', 'Which sales are above $60?'],
    ['campaigns without sales', 'Which campaigns have sales?'],
    ['sales for "Campaign Alpha"', 'What are the sales for "Campaign Beta"?'],
    ['sales on 2026-10-27', 'What are the sales on 2026-27-10?'],
    ['sales on Monday', 'What are the sales on Tuesday?'],
    ['sales for B012345678', 'What are the sales for B087654321?'],
  ]) assert.throws(() => valid(source, revised), /FACT_MISMATCH/, `${source} -> ${revised}`);
});

test('malformed, fabricated candidates and non-question outputs rejected', async () => {
  for (const text of ['not json', '{"question":"Sales yesterday"}', '{"question":"What are sales yesterday?","existingQuestionHash":"invented"}', '{"question":"What are sales yesterday?","extra":"bad"}']) {
    const canonicalize = createQuestionCanonicalizer({ aiProvider: { requestTurn: async () => ({ text }) } });
    await assert.rejects(canonicalize({ question: 'sales yesterday', candidates: [] }));
  }
});

test('hard timeout aborts request and rejects without a raw fallback', async () => {
  let signal;
  const canonicalize = createQuestionCanonicalizer({ timeoutMs: 10, aiProvider: { requestTurn: async input => { signal = input.signal; return new Promise(() => {}); } } });
  await assert.rejects(canonicalize({ question: 'sales yesterday' }), /TIMEOUT/);
  assert.equal(signal.aborted, true);
});

test('paraphrases merge canonical count, exact repeats skip AI, raw text never persisted', async () => {
  const rows = new Map();
  const variants = new Map();
  let aiCalls = 0;
  const searches = [];
  const model = {
    find(filter) { searches.push(filter); return q([...rows.values()]); },
    findOne(filter) { return q(rows.get(filter.questionHash) || null); },
    async updateOne(filter, update) { const old = rows.get(filter.questionHash); rows.set(filter.questionHash, { ...(old || update.$setOnInsert), questionHash: filter.questionHash, count: (old?.count || 0) + update.$inc.count }); },
  };
  const variantModel = {
    findOne(filter) { return q(variants.get(filter.originalHash) || null); },
    async updateOne(filter, update) { variants.set(filter.originalHash, update.$set); },
  };
  const canonicalizeQuestion = createQuestionCanonicalizer({ aiProvider: { async requestTurn(input) {
    aiCalls++;
    const { candidates } = JSON.parse(input.messages[0].content);
    const question = 'What are the predicted sales next month?';
    return { text: JSON.stringify({ question, existingQuestionHash: candidates[0]?.questionHash || null }) };
  } } });
  const record = createUnansweredQuestionRecorder({ model, variantModel, canonicalizeQuestion, resolveProfiles: async () => [profile] });
  assert.equal(await record({ message: 'predict next month sales' }), true);
  assert.equal(await record({ message: 'forecast sales for coming month' }), true);
  assert.equal(await record({ message: 'predict next month sales' }), true);
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].count, 3);
  assert.equal([...rows.values()][0].question, 'What are the predicted sales next month?');
  assert.equal(aiCalls, 2);
  assert.ok(searches.some(filter => filter.$text));
  assert.ok([...variants.values()].every(value => Object.keys(value).join() === 'questionHash'));
});

test('concurrent exact repeats coalesce AI and retain every occurrence', async () => {
  let aiCalls = 0;
  let increments = 0;
  const record = createUnansweredQuestionRecorder({
    model: { find: () => q([]), async updateOne() { increments++; } },
    variantModel: { findOne: () => q(null), async updateOne() {} },
    resolveProfiles: async () => [profile],
    canonicalizeQuestion: async () => { aiCalls++; await new Promise(resolve => setTimeout(resolve, 10)); return { question: 'What are the sales yesterday?', existingQuestionHash: null }; },
  });
  await Promise.all(Array.from({ length: 20 }, () => record({ message: 'sales yesterday' })));
  assert.equal(aiCalls, 1);
  assert.equal(increments, 20);
});

test('recorder waits for both model indexes before text lookup or counting', async () => {
  const ready = new Set();
  const record = createUnansweredQuestionRecorder({
    model: {
      async init() { await new Promise(resolve => setTimeout(resolve, 10)); ready.add('questions'); },
      find() { assert.equal(ready.size, 2); return q([]); },
      async updateOne() { assert.equal(ready.size, 2); },
    },
    variantModel: {
      async init() { await new Promise(resolve => setTimeout(resolve, 15)); ready.add('variants'); },
      findOne() { assert.equal(ready.size, 2); return q(null); },
      async updateOne() {},
    },
    resolveProfiles: async () => [profile],
    canonicalizeQuestion: async () => ({ question: 'What are the sales yesterday?', existingQuestionHash: null }),
  });
  assert.equal(await record({ message: 'sales yesterday' }), true);
  assert.equal(ready.size, 2);
});
