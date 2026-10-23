'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportService } = require('../api-server/services/chatbotReporting.handlers');
const { isBudgetRequest, buildBudgetReport } = require('../api-server/services/chatbotReporting/budgetInsights');
const { validateReportResponse } = require('../api-server/contracts/chatbotReporting.contract');

const HEX24 = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-22T18:00:00Z');

const SCOPE = {
  configId: HEX24,
  profiles: [{
    profileId: '1001', timezone: 'America/Los_Angeles', currencyCode: 'USD', accountType: 'seller',
    adTypes: ['SP'], attributionWindows: { SP: 7 },
    supportedDimensions: { SP: ['profile', 'campaign', 'date', 'keyword', 'search_term', 'target'] },
  }],
  currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
};

function fakeDb(data) {
  return { collection(name) {
    const all = data[name] || [];
    return {
      find(filter = {}) {
        const range = filter.reportDate;
        const rows = all.filter(row => {
          if (filter.campaignId && filter.campaignId.$in && !filter.campaignId.$in.map(String).includes(String(row.campaignId))) return false;
          const d = row.reportDate;
          if (range && range.$gte && d < range.$gte) return false;
          if (range && range.$lte && d > range.$lte) return false;
          return true;
        });
        return { limit() { return { toArray: async () => rows }; }, sort() { return this; }, toArray: async () => rows };
      },
      findOne: async () => null,
      countDocuments: async () => all.length,
    };
  } };
}

function service(data) {
  return createReportService({
    db: fakeDb(data),
    resolveScope: async () => SCOPE,
    checkReportPermission: async () => true,
    readKeywords: async () => ({ rows: [], verified: false, bestEffort: false, dataAsOf: null }),
    now: () => NOW,
    makeReportId: () => 'rep_test',
  });
}

const AUTH = { userId: HEX24, configId: HEX24, organizationId: HEX24, currencyCode: 'USD', profileIds: ['1001'] };

const budgetRequest = overrides => ({
  schemaVersion: '1.0', category: 'growth', adTypes: ['SP'], profileIds: ['1001'],
  comparison: { mode: 'none' }, groupBy: ['campaign'], filters: [], metrics: ['spend', 'sales'],
  limit: 25, offset: 0, presentation: 'table', period: { preset: 'last_7_days' },
  sort: { field: 'spend', direction: 'desc' }, ...overrides,
});

// Two days each: campaign 777 is maxed out, campaign 888 has plenty of headroom.
const CAMPAIGNS = [
  { configId: HEX24, profileId: 1001, campaignId: 777, name: 'A-Maxed-Out', reportDate: '2026-10-20', budget: 100, spend: 100, currencyCode: 'USD' },
  { configId: HEX24, profileId: 1001, campaignId: 777, name: 'A-Maxed-Out', reportDate: '2026-10-21', budget: 100, spend: 98, currencyCode: 'USD' },
  { configId: HEX24, profileId: 1001, campaignId: 888, name: 'B-Has-Headroom', reportDate: '2026-10-20', budget: 200, spend: 40, currencyCode: 'USD' },
  { configId: HEX24, profileId: 1001, campaignId: 888, name: 'B-Has-Headroom', reportDate: '2026-10-21', budget: 200, spend: 60, currencyCode: 'USD' },
];

test('isBudgetRequest recognizes a growth-by-campaign request and nothing else', () => {
  assert.equal(isBudgetRequest({ category: 'growth', groupBy: ['campaign'] }), true);
  assert.equal(isBudgetRequest({ category: 'growth', groupBy: ['search_term'] }), false);
  assert.equal(isBudgetRequest({ category: 'change', groupBy: ['campaign'] }), false);
});

test('a budget question returns per-campaign budget, spend, utilization and capped days', async () => {
  const report = await service({ campaigns: CAMPAIGNS })(budgetRequest(), AUTH);
  validateReportResponse(report);

  const dataset = report.datasets.find(d => d.rows.length);
  assert.ok(dataset, 'a budget table is rendered');
  const byName = Object.fromEntries(dataset.rows.map(row => [row.name, row]));

  // Most-constrained campaign is listed first.
  assert.equal(dataset.rows[0].name, 'A-Maxed-Out');
  assert.equal(byName['A-Maxed-Out'].utilization, 99); // (100+98)/(100+100)*100
  assert.equal(byName['A-Maxed-Out'].cappedDays, 2);
  assert.equal(byName['A-Maxed-Out'].budget, 100);

  assert.equal(byName['B-Has-Headroom'].utilization, 25); // (40+60)/(200+200)*100
  assert.equal(byName['B-Has-Headroom'].cappedDays, 0);

  assert.match(report.text, /1 of 2 campaigns reached about 95%/);
});

test('budgetTracking.lastUsagePercentage is used when present', async () => {
  const campaigns = [
    { configId: HEX24, profileId: 1001, campaignId: 777, name: 'Reported', reportDate: '2026-10-21', budget: 100, spend: 10, currencyCode: 'USD', budgetTracking: { lastUsagePercentage: 97 } },
  ];
  const report = await service({ campaigns })(budgetRequest(), AUTH);
  validateReportResponse(report);
  const row = report.datasets.find(d => d.rows.length).rows[0];
  // Reported usage (97%) marks the day capped even though spend/budget is only 10%.
  assert.equal(row.cappedDays, 1);
});

test('no budget records yields a clear unavailable report, not a crash', async () => {
  const report = await service({ campaigns: [] })(budgetRequest(), AUTH);
  validateReportResponse(report);
  assert.equal(report.status, 'unavailable');
});
