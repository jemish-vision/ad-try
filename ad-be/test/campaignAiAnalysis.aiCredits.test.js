'use strict';

// Campaign AI Analysis (POST /api/amazon/AIAnalysis) uses AI credits.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Anything the controller requires that this test doesn't care about: a harmless chainable stub
// ("then" is undefined so awaiting it resolves immediately).
const anything = new Proxy(function stub() {}, {
  get: (_t, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : anything),
  apply: () => anything,
  construct: () => anything,
});

function loadController({ canReserve }) {
  const calls = [];
  const mocks = {
    '../models/profiles.model': { findOne: () => ({ lean: async () => ({ currencyCode: 'INR' }) }) },
    '../helper/chatgpt': {
      generateSearchTermsAnalysis: async () => { calls.push('ai:search-terms'); return { parsedContent: {} }; },
      generatePlacementAndTargetingAnalysis: async () => { calls.push('ai:placement'); return { parsedContent: {} }; },
    },
    '../services/aiCredits/withAiCredits': {
      reserveAiCredits: async (_req, res) => {
        calls.push('hold');
        if (canReserve) return true;
        res.status(200).json({ isSuccess: false, code: 'AI_CREDITS_EXHAUSTED' });
        return false;
      },
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/controllers/campaign.controller.js'), 'utf8'), {
    module: mod, exports: mod.exports, require: (name) => mocks[name] || anything, process: { env: {} }, console, Buffer, setTimeout, clearTimeout, setInterval,
  });
  const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  const run = (body) => mod.exports.AIAnalysis({ config: { configId: 'c1' }, body: { campaignId: 1, profileId: 2, startDate: '2026-11-01', endDate: '2026-11-20', messages: '[]', ...body } }, res);
  return { run, calls, res };
}

describe('Campaign AI Analysis and AI credits', () => {
  test('route is metered as "CAMPAIGN_ANALYSIS"', () => {
    const route = fs.readFileSync(path.join(__dirname, '../api-server/routes/campaign.route.js'), 'utf8');
    assert.match(route, /router\.post\("\/AIAnalysis",[^\n]*withAiCredits\("CAMPAIGN_ANALYSIS", AIAnalysis\)\)/);
  });

  for (const [label, body, aiCall] of [['negative search terms', { findNegative: true }, 'ai:search-terms'], ['placement & targeting', {}, 'ai:placement']]) {
    test(`${label}: credits are held before the AI call`, async () => {
      const { run, calls, res } = loadController({ canReserve: true });
      await run(body);
      assert.deepEqual(calls, ['hold', aiCall]);
      assert.equal(res.body.isSuccess, true);
    });

    test(`${label}: out of credits — AI is never called`, async () => {
      const { run, calls, res } = loadController({ canReserve: false });
      await run(body);
      assert.deepEqual(calls, ['hold']);
      assert.deepEqual([res.body.isSuccess, res.body.code], [false, 'AI_CREDITS_EXHAUSTED']);
    });
  }

  test('invalid input is rejected before any credits are held', async () => {
    const { run, calls, res } = loadController({ canReserve: true });
    await run({ campaignId: undefined });
    assert.deepEqual(calls, []);
    assert.equal(res.statusCode, 203);
  });
});
