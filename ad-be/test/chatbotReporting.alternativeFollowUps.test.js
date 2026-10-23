'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAlternativeFollowUps,
} = require('../api-server/services/chatbotReporting/reportResponse');
const {
  validateReportRequest,
} = require('../api-server/contracts/chatbotReporting.contract');

const scope = {
  configId: '507f1f77bcf86cd799439011',
  profiles: [{
    profileId: '1001',
    timezone: 'America/Los_Angeles',
    currencyCode: 'USD',
    accountType: 'seller',
    adTypes: ['SP'],
    attributionWindows: { SP: 7 },
    supportedDimensions: { SP: ['profile', 'campaign', 'product', 'hour', 'weekday', 'search_term', 'keyword', 'placement', 'date'] },
  }],
  currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
};

function req(overrides) {
  return {
    schemaVersion: '1.0', adTypes: ['SP'], profileIds: ['1001'], comparison: { mode: 'none' },
    groupBy: [], filters: [], metrics: ['spend'], limit: 25, offset: 0, presentation: 'auto',
    period: { preset: 'last_7_days' }, ...overrides,
  };
}

// Every alternative we offer must itself be a VALID report request, and every
// profileId must stay inside the resolved scope (the response contract enforces this).
function assertValidAlternatives(alts) {
  for (const alt of alts) {
    assert.ok(alt.label && alt.label.length, 'alternative has a label');
    const parsed = validateReportRequest(alt.request);
    assert.ok(parsed.profileIds.every(id => scope.profiles.some(p => p.profileId === id)),
      'alternative profiles stay within scope');
  }
}

test('product profit/tacos/stock offers a basic ad spend & sales alternative', () => {
  for (const metric of ['profit', 'tacos', 'stock']) {
    const alts = buildAlternativeFollowUps(req({ category: 'products', groupBy: ['product'], metrics: [metric] }), scope);
    assert.equal(alts.length, 1, `one alternative for ${metric}`);
    assert.match(alts[0].label, /spend|sales/i);
    assert.equal(alts[0].request.category, 'products');
    assert.deepEqual(alts[0].request.metrics, ['spend', 'sales', 'orders', 'clicks']);
    assertValidAlternatives(alts);
  }
});

test('hourly conversion offers a verified spend & clicks hourly alternative', () => {
  const alts = buildAlternativeFollowUps(req({ category: 'time', groupBy: ['hour', 'weekday'], metrics: ['cvr', 'orders', 'clicks'] }), scope);
  assert.equal(alts.length, 1);
  assert.equal(alts[0].request.category, 'time');
  assert.equal(alts[0].request.metrics[0], 'clicks');
  assert.ok(!alts[0].request.metrics.some(m => ['orders', 'cvr', 'aov'].includes(m)), 'no unverified hourly conversion metrics');
  assertValidAlternatives(alts);
});

test('budget-exhaustion growth offers a campaign spend & sales alternative', () => {
  const alts = buildAlternativeFollowUps(req({ category: 'growth', groupBy: ['campaign'], metrics: ['spend', 'sales', 'orders', 'clicks', 'cvr'] }), scope);
  assert.equal(alts.length, 1);
  assert.equal(alts[0].request.category, 'waste');
  assert.deepEqual(alts[0].request.groupBy, ['campaign']);
  assertValidAlternatives(alts);
});

test('intraday "today" offers the same report for yesterday', () => {
  const alts = buildAlternativeFollowUps(req({ category: 'unusual', groupBy: ['campaign'], metrics: ['cpc', 'impressions', 'spend', 'clicks'], period: { preset: 'today' } }), scope);
  assert.ok(alts.length >= 1);
  const yesterday = alts.find(a => a.request.period && a.request.period.preset === 'yesterday');
  assert.ok(yesterday, 'offers yesterday');
  assert.equal(yesterday.request.category, 'unusual');
  assertValidAlternatives(alts);
});

test('a plain no-data report (basic metrics, not a withheld metric) offers no misleading alternative', () => {
  // waste by keyword with ordinary metrics that simply returned nothing -> no special alternative
  const alts = buildAlternativeFollowUps(req({ category: 'waste', groupBy: ['keyword'], metrics: ['spend', 'sales', 'clicks', 'orders'] }), scope);
  assert.deepEqual(alts, []);
});

test('a "too much data" report offers a single-day retry', () => {
  const alts = buildAlternativeFollowUps(
    req({ category: 'time', groupBy: ['hour', 'weekday'], metrics: ['clicks', 'spend', 'cpc'], period: { preset: 'last_7_days' } }),
    scope,
    ['1001/SP/current: This time range contains too much hourly data to analyze safely. Try a shorter date range or select one campaign.'],
  );
  const oneDay = alts.find(a => a.request.period && a.request.period.preset === 'yesterday');
  assert.ok(oneDay, 'offers a single-day retry');
  assert.equal(oneDay.request.category, 'time');
  assertValidAlternatives(alts);
});

test('no scope -> no alternatives', () => {
  assert.deepEqual(buildAlternativeFollowUps(req({ category: 'products', metrics: ['profit'] }), null), []);
});
