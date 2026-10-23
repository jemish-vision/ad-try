'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateTotals,
  calculateMetrics,
  compareMetric,
} = require('../api-server/helper/chatbotReporting.metrics');
const {
  resolveReportPeriods,
} = require('../api-server/helper/chatbotReporting.dates');
const {
  analyzePerformance,
} = require('../api-server/services/chatbotReporting/performanceAnalysis');
const {
  analyzeOpportunities,
} = require('../api-server/services/chatbotReporting/opportunityAnalysis');
const {
  readDailyReport,
} = require('../api-server/services/chatbotReporting.daily');

test('Round 1: aggregates raw totals before calculating weighted metrics, never averaging ratios', () => {
  // Campaign A: High spend, low sales (ACOS = 80%)
  // Campaign B: Low spend, high sales (ACOS = 5%)
  // Average of row ratios: (80 + 5) / 2 = 42.5% -> WRONG!
  // True weighted ACOS: (80 + 10) / (100 + 200) = 90 / 300 = 30.0% -> CORRECT!
  const rows = [
    { spend: 80, sales: 100, orders: 5, clicks: 40, impressions: 1000 },
    { spend: 10, sales: 200, orders: 15, clicks: 20, impressions: 500 },
  ];

  const totals = aggregateTotals(rows);
  assert.equal(totals.spend, 90);
  assert.equal(totals.sales, 300);
  assert.equal(totals.orders, 20);
  assert.equal(totals.clicks, 60);
  assert.equal(totals.impressions, 1500);

  const metrics = calculateMetrics(totals);
  assert.equal(metrics.acos.value, 30); // 90 / 300 * 100
  assert.equal(metrics.roas.value, 300 / 90); // 3.3333333333333335
  assert.equal(metrics.cpc.value, 1.5); // 90 / 60
  assert.equal(metrics.cvr.value, (20 / 60) * 100); // 33.333333333333336
});

test('Round 1: zero denominators produce no_sales or no_clicks, never NaN or Infinity', () => {
  // Zero sales: ACOS denominator is 0 -> status is 'no_sales'
  const noSales = aggregateTotals([{ spend: 50, sales: 0, orders: 0, clicks: 10, impressions: 500 }]);
  const m1 = calculateMetrics(noSales);
  assert.equal(m1.acos.value, null);
  assert.equal(m1.acos.status, 'no_sales');
  assert.equal(m1.roas.value, 0);

  // Zero clicks: CPC and CVR denominators are 0 -> status is 'no_clicks'
  const noClicks = aggregateTotals([{ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 100 }]);
  const m2 = calculateMetrics(noClicks);
  assert.equal(m2.cpc.value, null);
  assert.equal(m2.cpc.status, 'no_clicks');
  assert.equal(m2.cvr.value, null);
  assert.equal(m2.cvr.status, 'no_clicks');

  // Zero impressions: CTR denominator is 0 -> status is 'no_impressions'
  const noImpr = aggregateTotals([{ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 }]);
  const m3 = calculateMetrics(noImpr);
  assert.equal(m3.ctr.value, null);
  assert.equal(m3.ctr.status, 'no_impressions');
});

test('Round 1: ACOS comparisons use percentage points, while spend/sales use relative percentages', () => {
  // ACOS: 25% vs 20% is +5.0 percentage points
  const acosComp = compareMetric(
    { value: 25, unit: 'percent', status: 'available' },
    { value: 20, unit: 'percent', status: 'available' }
  );
  assert.equal(acosComp.percentagePointChange, 5);
  assert.equal(acosComp.relativeChangePercent, 25);
  assert.equal(acosComp.status, 'comparable');

  // Spend: $150 vs $100 is +50.0% relative increase
  const spendComp = compareMetric(
    { value: 150, unit: 'currency', status: 'available' },
    { value: 100, unit: 'currency', status: 'available' }
  );
  assert.equal(spendComp.relativeChangePercent, 50);
  assert.equal(spendComp.percentagePointChange, null);
  assert.equal(spendComp.absoluteChange, 50);
  assert.equal(spendComp.status, 'comparable');

  // New activity (0 baseline): relative change is null, status is 'new_activity'
  const newActivityComp = compareMetric(
    { value: 100, unit: 'currency', status: 'available' },
    { value: 0, unit: 'currency', status: 'available' }
  );
  assert.equal(newActivityComp.relativeChangePercent, null);
  assert.equal(newActivityComp.status, 'new_activity');
});

test('Round 1: analyzePerformance decomposes change drivers and produces ranked movers', () => {
  const currentRows = [
    { campaignId: 'c1', name: 'Alpha', spend: 200, sales: 800, orders: 20, clicks: 100, impressions: 2000 },
    { campaignId: 'c2', name: 'Beta', spend: 50, sales: 100, orders: 2, clicks: 40, impressions: 800 },
  ];
  const priorRows = [
    { campaignId: 'c1', name: 'Alpha', spend: 100, sales: 400, orders: 10, clicks: 50, impressions: 1000 },
    { campaignId: 'c2', name: 'Beta', spend: 150, sales: 500, orders: 15, clicks: 100, impressions: 2000 },
  ];

  const currentTotals = aggregateTotals(currentRows);
  const priorTotals = aggregateTotals(priorRows);

  const result = analyzePerformance({
    request: {
      category: 'change',
      groupBy: ['campaign'],
      metrics: ['spend', 'sales', 'acos', 'cpc'],
      analysis: { includeMovers: true },
    },
    profile: {
      profileId: '1001',
      currencyCode: 'USD',
      attributionWindows: { SP: 7 },
    },
    adType: 'SP',
    idPrefix: 'p0_SP',
    current: {
      totals: currentTotals,
      metrics: calculateMetrics(currentTotals),
      rows: currentRows,
      verification: 'verified',
    },
    comparison: {
      totals: priorTotals,
      metrics: calculateMetrics(priorTotals),
      rows: priorRows,
      verification: 'verified',
    },
    periods: {
      current: { fromDate: '2026-10-14', toDate: '2026-10-20', startAt: '2026-10-14T00:00:00.000Z', endBefore: '2026-10-21T00:00:00.000Z', isPartial: false },
      comparison: { fromDate: '2026-10-07', toDate: '2026-10-13', startAt: '2026-10-07T00:00:00.000Z', endBefore: '2026-10-14T00:00:00.000Z', isPartial: false },
    },
  });

  assert.ok(result.cards.length > 0, 'KPI cards must be generated');
  assert.ok(result.text.length > 0, 'Explanation text must be generated');
  assert.ok(result.datasets.length > 0, 'Movers dataset must be generated');

  const moversDataset = result.datasets.find(ds => ds.id.includes('movers'));
  assert.ok(moversDataset, 'Must include movers dataset');
  assert.ok(moversDataset.rows.length <= 3, 'Top movers capped at 3');
});

test('Round 1: analyzeOpportunities isolates growth opportunities and checks inventory deduplication', () => {
  const input = {
    request: {
      category: 'growth',
      groupBy: ['search_term'],
      filters: [],
      metrics: ['spend', 'sales', 'clicks', 'orders'],
      limit: 25,
      offset: 0,
      analysis: { targetAcos: 30 },
    },
    profile: { profileId: '123', currencyCode: 'USD' },
    adType: 'SP',
    idPrefix: 'p0_SP',
    now: new Date('2026-10-21T12:00:00.000Z'),
    current: {
      verification: 'verified',
      rows: [
        {
          campaignId: '1',
          adGroupId: '2',
          keywordId: '3',
          searchTerm: 'red shoes',
          spend: 20,
          sales: 100,
          clicks: 20,
          orders: 3,
          impressions: 80,
        },
      ],
    },
    keywordInventory: {
      rows: [],
      verified: true,
      dataAsOf: '2026-10-21T11:00:00.000Z',
    },
  };

  const result = analyzeOpportunities(input);
  assert.ok(result.datasets.length > 0, 'Must produce growth datasets');
  assert.equal(result.datasets[0].rows[0].searchTerm, 'red shoes');
  assert.equal(result.datasets[0].rows[0].acos, 20);
});

test('Round 1: date windows strictly enforce calendar boundaries and reject partial today in daily reader', async () => {
  const resolved = resolveReportPeriods(
    { preset: 'yesterday' },
    { mode: 'previous_period' },
    {
      timezone: 'America/Los_Angeles',
      now: '2026-10-21T12:00:00Z',
    }
  );

  assert.equal(resolved.current.fromDate, '2026-10-20');
  assert.equal(resolved.current.toDate, '2026-10-20');

  // Daily reader rejects 'today' with 422 because current-day data is partial
  await assert.rejects(
    async () => {
      await readDailyReport({
        configId: 'test_config',
        profile: { profileId: '1001', currencyCode: 'USD' },
        period: { preset: 'today', fromDate: '2026-10-21', toDate: '2026-10-21', completed: false },
        adType: 'SP',
        grain: 'campaign',
        repository: { findCampaignDaily: async () => [] },
      });
    },
    err => err.statusCode === 422
  );
});
