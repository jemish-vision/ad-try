'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuestion, resolveCaptureProfiles, createUnansweredQuestionRecorder: createRecorder } = require('../api-server/services/unansweredQuestion.capture');
const { createChatService, unansweredReportCapability, directAnswerIsUnanswered } = require('../api-server/services/chatbotReporting.chat');

const profile = { profileId: '123', profileName: 'Verified profile', configId: '507f1f77bcf86cd799439011', organizationId: '507f1f77bcf86cd799439012', userId: '507f1f77bcf86cd799439013' };
const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, maxTimeMS() { return this; }, async lean() { return value; } });
function createUnansweredQuestionRecorder(options = {}) {
  return createRecorder({ ...options,
    model: { find: () => query([]), findOne: () => query(null), ...options.model },
    variantModel: { findOne: () => query(null), updateOne: async () => {} },
    canonicalizeQuestion: async ({ question }) => ({ question: `${question.replace(/[?!.]+$/u, '').trim()}?`, existingQuestionHash: null }),
  });
}

test('capture uses scoped database metadata and rejects partial grants or missing profiles', async () => {
  let grants = [{ profileId: 123 }, { profileId: 456 }];
  let profiles = [{ profileId: 123, name: 'Verified 123' }, { profileId: 456, name: 'Verified 456' }];
  const queries = [];
  const db = { collection(name) { return {
    async findOne(filter, options) { queries.push({ name, filter, options }); return { organizationId: profile.organizationId }; },
    find(filter, options) { queries.push({ name, filter, options }); return { async toArray() { return name === 'profilebasedpermissions' ? grants : profiles; } }; },
  }; } };
  const input = { profileIds: ['123', '456'], activeProfile: { name: 'Forged' } };
  const context = { userId: profile.userId, configId: profile.configId, organizationId: profile.organizationId };
  const resolved = await resolveCaptureProfiles(input, context, { db });
  assert.deepEqual(resolved.map(item => item.profileName), ['Verified 123', 'Verified 456']);
  assert.equal(String(queries[1].filter.userId), profile.userId);
  assert.equal(String(queries[1].filter.configId), profile.configId);
  assert.equal(queries[1].filter.hasAccess, true);
  grants = [{ profileId: 123 }];
  assert.deepEqual(await resolveCaptureProfiles(input, context, { db }), []);
  grants = [{ profileId: 123 }, { profileId: 456 }];
  profiles = [{ profileId: 123, name: 'Verified 123' }];
  assert.deepEqual(await resolveCaptureProfiles(input, context, { db }), []);
  assert.deepEqual(await resolveCaptureProfiles(input, { ...context, organizationId: '507f1f77bcf86cd799439099' }, { db }), []);
  assert.deepEqual(await resolveCaptureProfiles({ profileIds: [] }, context, { db }), []);
});

test('normalization groups case, whitespace, Unicode equivalents and terminal punctuation', () => {
  assert.equal(normalizeQuestion('  WHAT  is ＡCOS???  '), normalizeQuestion('what is ACOS'));
  assert.notEqual(normalizeQuestion('spend 10.5'), normalizeQuestion('spend 105'));
});

test('atomic upsert counts every occurrence once per authorized selected profile', async () => {
  const rows = new Map();
  const writes = [];
  const model = { async updateOne(filter, update, options) {
    writes.push({ filter, update, options });
    const key = `${filter.configId}:${filter.profileId}:${filter.questionHash}`;
    const previous = rows.get(key) || { ...update.$setOnInsert, count: 0 };
    rows.set(key, { ...previous, ...update.$set, count: previous.count + update.$inc.count, firstAskedAt: update.$min.firstAskedAt, lastAskedAt: update.$max.lastAskedAt });
  } };
  const recorder = createUnansweredQuestionRecorder({ model, resolveProfiles: async () => [profile, { ...profile, profileId: '456' }], now: () => new Date('2026-10-27T10:00:00Z') });
  await Promise.all(['Forecast my sales?', ' forecast  MY SALES!!! '].map(message => recorder({ message, activeProfile: { name: 'Forged' } }, {}, 'unsupported')));
  assert.equal(rows.size, 2);
  for (const row of rows.values()) { assert.equal(row.count, 2); assert.equal(row.profileName, 'Verified profile'); assert.equal(row.reason, 'unsupported'); }
  assert.equal(writes[0].options.upsert, true);
  assert.equal(writes[0].options.maxTimeMS, 2000);
  assert.deepEqual(writes[0].update.$min, { firstAskedAt: new Date('2026-10-27T10:00:00Z') });
  assert.deepEqual(writes[0].update.$max, { lastAskedAt: new Date('2026-10-27T10:00:00Z') });
});

test('duplicate-key race retries an increment without upsert', async () => {
  const writes = [];
  const recorder = createUnansweredQuestionRecorder({ resolveProfiles: async () => [profile], model: { async updateOne(filter, update, options) {
    writes.push({ filter, update, options });
    if (writes.length === 1) throw Object.assign(new Error('duplicate'), { code: 11000 });
  } } });
  assert.equal(await recorder({ message: 'Forecast sales' }, {}, 'unsupported'), true);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].options.upsert, undefined);
  assert.deepEqual(writes[1].update.$inc, { count: 1 });
});

test('empty, unauthorized and failed captures do not write or break chat', async () => {
  let writes = 0;
  const recorder = createUnansweredQuestionRecorder({ resolveProfiles: async () => [], model: { async updateOne() { writes++; } } });
  assert.equal(await recorder({ message: '' }), false);
  assert.equal(await recorder({ message: 'test' }), false);
  assert.equal(writes, 0);
  const broken = createUnansweredQuestionRecorder({ resolveProfiles: async () => { throw new Error('db'); }, logger: { warn() {} } });
  assert.equal(await broken({ message: 'test' }), false);
});

test('canonicalizer failures never store raw questions', async () => {
  const writes = [];
  const recorder = createRecorder({ resolveProfiles: async () => [profile], model: { find: () => query([]), async updateOne(filter, update) { writes.push({ filter, update }); } }, variantModel: { findOne: () => query(null) }, canonicalizeQuestion: async () => { throw new Error('unavailable'); }, logger: { warn() {} } });
  assert.equal(await recorder({ message: 'raw question that must not persist' }), false);
  assert.equal(writes.length, 0);
});

function chatHarness(turn, reportService) {
  const captured = [];
  const service = createChatService({ aiProvider: { requestTurn: async () => typeof turn === 'function' ? turn() : turn }, reportService: reportService || (async () => { throw new Error('unexpected report'); }), unansweredRecorder: async (...args) => { captured.push(args); } });
  return { service, captured };
}

test('unsupported deterministic questions recorded with original question and auth once', async () => {
  const { service, captured } = chatHarness({});
  const input = { message: 'Predict future sales for next month', profileIds: ['123'] };
  const response = await service(input, { userId: profile.userId });
  assert.equal(captured.length, 1);
  assert.equal(captured[0][0], input);
  assert.equal(captured[0][2], 'unsupported');
  assert.equal(response.unansweredReason, undefined);
});

test('known answers, greetings, missing-date clarification and empty-data reports are excluded', async () => {
  for (const [message, turn, report] of [
    ['hello', { text: 'Hello! How can I help?' }],
    ['how do I optimize my ads?', { text: 'Review your advertising goals and bids.' }],
    ['show my spend', { text: 'Which date range should I report on?' }],
    ['show my spend yesterday', { toolCalls: [{ id: 'r', name: 'run_report', arguments: { category: 'summary', period: { preset: 'yesterday' }, metrics: ['spend'] } }] }, { category: 'summary', status: 'empty', text: 'No records for this period.', scope: { profiles: [] }, cards: [], datasets: [], warnings: [] }],
  ]) {
    const { service, captured } = chatHarness(turn, async () => report);
    await service({ message, profileIds: ['123'] });
    assert.equal(captured.length, 0, message);
  }
});

test('unverified analytics and genuine direct-text inability are captured', async () => {
  for (const [message, turn] of [
    ['show my spend yesterday', { text: 'Here is some generic advice.' }],
    ['help with frobnication', { text: "I don't know the answer to that question." }],
  ]) {
    const { service, captured } = chatHarness(turn);
    await service({ message, profileIds: ['123'] });
    assert.equal(captured.length, 1, message);
    assert.equal(captured[0][2], 'unanswered');
  }
});

test('provider failures recorded as errors, successful report fallback excluded', async () => {
  const { service, captured } = chatHarness(() => { throw new Error('provider down'); });
  await service({ message: 'help with frobnication', profileIds: ['123'] });
  assert.equal(captured.length, 1);
  assert.equal(captured[0][2], 'error');
});

test('explicit report capability gaps captured while routine missing data excluded', () => {
  for (const gap of ['123: Product profit requires product costs, selling fees, product revenue and advertising spend for the same dates.', 'Amazon Seller account (SP-API) connection for product, stock and total-sales reports']) {
    assert.equal(unansweredReportCapability({ status: 'unavailable', freshness: { missingInputs: [gap] } }), true);
    assert.equal(unansweredReportCapability({ status: 'partial', freshness: { missingInputs: [gap] } }), false);
  }
  for (const gap of ['No scoped source rows for the requested dates.', '123: readable inventory snapshot', 'SOURCE_COMPLETENESS_UNVERIFIED', '123: current inventory records']) {
    assert.equal(unansweredReportCapability({ status: 'unavailable', freshness: { missingInputs: [gap] } }), false);
  }
});

test('bounded direct inability detection excludes clarifications and capability explanations', () => {
  for (const text of ["I cannot access that data.", "I don’t have information about that.", "I don't have enough data to answer.", 'I cannot provide the requested answer.', "I'm unable to answer that", 'I don’t have access to that information', 'This feature is not supported', 'I’m sorry, but I cannot retrieve that data']) assert.equal(directAnswerIsUnanswered(text), true, text);
  for (const text of ['I cannot answer without a date range. Which period would you like?', 'I can summarize data. I cannot access private competitor accounts.', 'Please provide the campaign name so I can help.', 'No records were found in that date range.']) assert.equal(directAnswerIsUnanswered(text), false, text);
});
