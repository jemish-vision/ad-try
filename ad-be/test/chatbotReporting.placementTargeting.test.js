'use strict';

// End-to-end confirmation that placement- and target-grouped reports render
// through the generic daily pipeline with the right dimension column and
// correctly computed metrics.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportService } = require('../api-server/services/chatbotReporting.handlers');
const { validateReportResponse } = require('../api-server/contracts/chatbotReporting.contract');

const HEX24 = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-22T18:00:00Z');

const SCOPE = {
  configId: HEX24,
  profiles: [{
    profileId: '1001', timezone: 'America/Los_Angeles', currencyCode: 'USD', accountType: 'seller',
    adTypes: ['SP'], attributionWindows: { SP: 7 },
    supportedDimensions: { SP: ['profile', 'campaign', 'ad_group', 'keyword', 'target', 'search_term', 'placement', 'date'] },
  }],
  currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
};

const AUTH = { userId: HEX24, configId: HEX24, organizationId: HEX24, currencyCode: 'USD', profileIds: ['1001'] };

function source(rows) {
  return { rows, verification: 'unverified', warnings: ['IMPORT_COVERAGE_UNVERIFIED'], missingInputs: [], sourceRefs: [{ name: 'test' }], dataAsOf: '2026-10-21T00:00:00.000Z' };
}

function service(rows) {
  return createReportService({
    db: {},
    resolveScope: async () => SCOPE,
    checkReportPermission: async () => true,
    readKeywords: async () => ({ rows: [], verified: false, bestEffort: false, dataAsOf: null }),
    readDaily: async () => source(rows),
    now: () => NOW,
    makeReportId: () => 'rep_test',
  });
}

const baseRequest = overrides => ({
  schemaVersion: '1.0', category: 'summary', adTypes: ['SP'], profileIds: ['1001'],
  comparison: { mode: 'none' }, filters: [], metrics: ['spend', 'sales', 'acos'],
  limit: 25, offset: 0, presentation: 'bar', period: { preset: 'last_7_days' },
  sort: { field: 'spend', direction: 'desc' }, ...overrides,
});

test('a placement breakdown renders with per-placement ACOS', async () => {
  const rows = [
    { profileId: '1001', adType: 'SP', placement: 'TOP_OF_SEARCH', name: 'Top of search', spend: 10, sales: 100, clicks: 10, orders: 2, impressions: 100, date: '2026-10-19' },
    { profileId: '1001', adType: 'SP', placement: 'REST_OF_SEARCH', name: 'Rest of search', spend: 20, sales: 50, clicks: 15, orders: 1, impressions: 200, date: '2026-10-19' },
  ];
  const report = await service(rows)(baseRequest({ groupBy: ['placement'] }), AUTH);
  validateReportResponse(report);

  const dataset = report.datasets.find(d => d.rows.length);
  assert.ok(dataset, 'a placement dataset is rendered');
  assert.ok(dataset.columns.some(column => column.key === 'placement'), 'has a placement column');
  const byPlacement = Object.fromEntries(dataset.rows.map(row => [row.placement, row]));
  assert.equal(byPlacement.TOP_OF_SEARCH.acos, 10); // 10/100
  assert.equal(byPlacement.REST_OF_SEARCH.acos, 40); // 20/50
});

test('a target (product-targeting) breakdown renders with per-target metrics', async () => {
  const rows = [
    { profileId: '1001', adType: 'SP', campaignId: '10', adGroupId: '20', targetId: '501', name: 'asin="B01"', spend: 15, sales: 300, clicks: 12, orders: 4, impressions: 180, date: '2026-10-19' },
    { profileId: '1001', adType: 'SP', campaignId: '10', adGroupId: '20', targetId: '502', name: 'category="shoes"', spend: 30, sales: 120, clicks: 20, orders: 2, impressions: 400, date: '2026-10-19' },
  ];
  const report = await service(rows)(baseRequest({ groupBy: ['target'] }), AUTH);
  validateReportResponse(report);

  const dataset = report.datasets.find(d => d.rows.length);
  assert.ok(dataset, 'a target dataset is rendered');
  assert.ok(dataset.columns.some(column => column.key === 'targetId'), 'has a target column');
  const byTarget = Object.fromEntries(dataset.rows.map(row => [row.targetId, row]));
  assert.equal(byTarget['501'].acos, 5); // 15/300
  assert.equal(byTarget['502'].acos, 25); // 30/120
});
