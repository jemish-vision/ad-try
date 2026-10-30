'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const { createChatService, isAnalyticsQuestion, isGeneralOrConversationalQuestion } = require('../api-server/services/chatbotReporting.chat');
const { createChatController } = require('../api-server/controllers/chatbotReporting.controller');
const { createUnansweredQuestionRecorder } = require('../api-server/services/unansweredQuestion.capture');

test('actual JSON and legacy JSON/SSE controller bodies record each unsupported turn once', async () => {
  const writes = [];
  const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, maxTimeMS() { return this; }, async lean() { return value; } });
  const recorder = createUnansweredQuestionRecorder({
    resolveProfiles: async () => [{ profileId: '123', profileName: 'QA', configId: '507f1f77bcf86cd799439011', organizationId: '507f1f77bcf86cd799439012', userId: '507f1f77bcf86cd799439013' }],
    model: { find: () => query([]), async updateOne(filter, update) { writes.push({ filter, update }); } },
    variantModel: { findOne: () => query(null), async updateOne() {} },
    canonicalizeQuestion: async ({ question }) => ({ question: `${question}?`, existingQuestionHash: null }),
  });
  const service = createChatService({ unansweredRecorder: recorder, aiProvider: { async requestTurn() { throw new Error('Unexpected AI call'); } } });
  // Evaluate the verbatim legacy controller body with explicit dependency stubs.
  // Importing its whole module would initialize unrelated integrations.
  const source = fs.readFileSync(require.resolve('../api-server/controllers/customer.controller'), 'utf8');
  const start = source.indexOf('exports.customChatBot = async');
  const end = source.indexOf('exports.createSupportTicket =', start);
  assert.ok(start > 0 && end > start);
  const sandbox = {
    exports: {},
    require(name) { assert.equal(name, '../helper/common'); return { checkPermission: async () => ({ hasPermission: true }) }; },
    isAnalyticsQuestion, isGeneralOrConversationalQuestion,
    mongoose: { connection: { readyState: 0 } },
    defaultReportingChatService: service,
    recordUnansweredQuestion: recorder,
    getMostMatchedFAQ: async () => null,
    getMeaningfulWord: message => message.trim().split(/\s+/),
    write_logs() {},
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { _id: '507f1f77bcf86cd799439013', roleName: 'SUPER_ADMIN' };
    req.config = { configId: '507f1f77bcf86cd799439011' };
    req.organizationId = '507f1f77bcf86cd799439012';
    next();
  });
  app.post('/json', createChatController({ chatService: service }));
  app.post('/legacy', sandbox.exports.customChatBot);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [route, stream] of [['/json', false], ['/legacy', false], ['/legacy', true]]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Predict future sales for next month', profileIds: ['123'], activeProfile: { name: 'QA', profileId: '123' }, stream }),
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.match(body, /Future predictive forecasting is not supported/);
      if (stream) { assert.match(response.headers.get('content-type'), /text\/event-stream/); assert.equal((body.match(/event: done/g) || []).length, 1); }
    }
    assert.equal(writes.length, 3);
    assert.equal(new Set(writes.map(write => write.filter.questionHash)).size, 1);
    assert.ok(writes.every(write => write.update.$inc.count === 1 && write.update.$set.reason === 'unsupported'));
    const faq = await fetch(`http://127.0.0.1:${server.address().port}/legacy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'billing integration synchronization unavailable', profileIds: ['123'], stream: true }) });
    assert.match(await faq.text(), /event: done/);
    assert.equal(writes.length, 4);
    assert.equal(writes[3].update.$set.reason, 'unanswered');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
