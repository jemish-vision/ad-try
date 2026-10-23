'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSpecial } = require('../api-server/services/chatbotReporting/specialAnalysis');

function baseContext(category = 'time', extra = {}) {
  return {
    request: {
      category,
      metrics: ['spend', 'clicks', 'orders', 'sales', 'cvr'],
      groupBy: ['weekday', 'hour'],
      filters: [],
      comparison: { mode: 'none' },
      sort: { field: 'cvr', direction: 'desc' },
      limit: 25,
      offset: 0,
    },
    profile: {
      profileId: '1001',
      currencyCode: 'USD',
      attributionWindows: { SP: 7 },
    },
    adType: 'SP',
    idPrefix: 'test_special',
    periods: {
      current: {
        fromDate: '2026-10-13',
        toDate: '2026-10-19',
        startAt: '2026-10-13T00:00:00.000Z',
        endBefore: '2026-10-20T00:00:00.000Z',
        isPartial: false,
      },
    },
    options: { minClicks: 10 },
    current: {
      verification: 'verified',
      rows: [],
      warnings: [],
      missingInputs: [],
      dataAsOf: '2026-10-20T01:00:00.000Z',
    },
    ...extra,
  };
}

test('time analysis builds 24x7 heatmap grid and ranks qualifying hours', () => {
  const rows = [
    { date: '2026-10-13', weekday: '2', hour: '14', clicks: 25, orders: 5, spend: 50, sales: 250 },
    { date: '2026-10-14', weekday: '3', hour: '10', clicks: 15, orders: 1, spend: 30, sales: 50 },
  ];
  const input = baseContext('time', {
    current: { verification: 'verified', rows, warnings: [], missingInputs: [] },
  });

  const result = analyzeSpecial(input);
  assert.equal(result.blocks.some(b => b.type === 'heatmap'), true);
  const gridDataset = result.datasets.find(d => d.id === 'test_special_time_grid');
  assert.ok(gridDataset);
  assert.equal(gridDataset.rows.length, 168); // 7 days * 24 hours

  // Cell with enough clicks and observed data
  const observedCell = gridDataset.rows.find(c => c.weekday === 'Tuesday' && c.hour === '14');
  assert.ok(observedCell);
  assert.equal(observedCell.status, 'observed'); // 1 date observed out of expected Tuesday dates

  // Ranking table is present for groups meeting minClicks
  const rankTable = result.datasets.find(d => d.id === 'test_special_time_rank');
  assert.ok(rankTable);
  assert.ok(rankTable.rows.length >= 1);
});

test('time analysis labels hourly conversion as provisional (attributed units)', () => {
  const rows = [
    { date: '2026-10-13', weekday: '2', hour: '14', clicks: 25, orders: 5, spend: 50, sales: 250 },
  ];
  const input = baseContext('time', {
    current: {
      verification: 'verified',
      rows,
      warnings: ['HOURLY_ORDERS_ARE_UNITS'],
      missingInputs: [],
    },
  });

  const result = analyzeSpecial(input);
  // Conversion is now provided from attributed units, flagged provisional rather
  // than withheld as a missing input.
  assert.ok(result.warnings.some(message => /provisional/i.test(message)));
  assert.ok(!result.missingInputs.some(message => /units cannot supply order conversion/i.test(message)));
});

test('product analysis identifies required inputs and warns about profit definitions', () => {
  const input = baseContext('products', {
    request: {
      category: 'products',
      metrics: ['profit', 'tacos', 'stock'],
      groupBy: ['product'],
      filters: [],
      comparison: { mode: 'none' },
    },
    current: {
      verification: 'verified',
      rows: [{ productId: 'B001', spend: 50, sales: 200 }],
    },
  });

  const result = analyzeSpecial(input);
  assert.ok(result.missingInputs.some(m => m.includes('Profit requires reconciled total product sales')));
  assert.ok(result.missingInputs.some(m => m.includes('TACOS requires reconciled total product sales')));
  assert.ok(result.missingInputs.some(m => m.includes('Stock requires fresh sellable inventory')));
  assert.ok(result.warnings.some(w => w.includes('cannot establish profitability, TACOS, low stock')));
  assert.ok(result.text.some(t => t.includes('Ad sales minus ad spend is not net product profit')));
});

test('single product questions explain their own missing data without unrelated profit wording', () => {
  for (const [metric, expected] of [['stock', 'sellable inventory'], ['tacos', 'including organic sales']]) {
    const input = baseContext('products');
    input.request.metrics = [metric];
    const result = analyzeSpecial(input);
    assert.match(result.text.join(' '), new RegExp(expected));
    assert.doesNotMatch(result.text.join(' '), /net product profit/);
  }
});

test('rule analysis classifies execution evidence and warns against causal assumptions', () => {
  const rows = [
    { ruleId: 'R1', entityId: 'E1', date: '2026-10-19', changeType: 'BID', oldValue: '1.00', newValue: '1.20', status: 'applied', executionVerified: true },
    { ruleId: 'R2', entityId: 'E2', date: '2026-10-19', changeType: 'STATUS', oldValue: 'PAUSED', newValue: 'ENABLED', status: 'attempted', executionVerified: false },
  ];
  const input = baseContext('rules', {
    request: {
      category: 'rules',
      metrics: [],
      groupBy: [],
      filters: [],
      comparison: { mode: 'none' },
      offset: 0,
      limit: 25,
    },
    current: {
      verification: 'verified',
      rows,
    },
  });

  const result = analyzeSpecial(input);
  const evidenceDataset = result.datasets.find(d => d.id === 'test_special_rule_evidence');
  assert.ok(evidenceDataset);
  assert.equal(evidenceDataset.rows[0].evidence, 'applied');
  assert.equal(evidenceDataset.rows[1].evidence, 'history_snapshot'); // executionVerified is false
  // A confirmed applied action is present, so effectiveness is no longer declared missing,
  // but the causal-caution warning still stands.
  assert.ok(!result.missingInputs.some(m => m.includes('Rule effectiveness requires a verified applied event')));
  assert.ok(result.text.some(t => /confirmed applied rule actions/i.test(t)));
  assert.ok(result.warnings.some(w => w.includes('cannot prove a rule caused the change')));
});

test('history-only rule records still declare effectiveness as missing', () => {
  const rows = [
    { ruleId: 'R1', entityId: 'E1', date: '2026-10-19', changeType: 'BID', oldValue: '1.00', newValue: '1.20', status: 'history_snapshot' },
  ];
  const input = baseContext('rules', {
    request: { category: 'rules', metrics: [], groupBy: [], filters: [], comparison: { mode: 'none' }, offset: 0, limit: 25 },
    current: { verification: 'verified', rows },
  });
  const result = analyzeSpecial(input);
  assert.ok(result.missingInputs.some(m => m.includes('Rule effectiveness requires a verified applied event')));
});

test('source conflict returns missing inputs and halts further specialized analysis', () => {
  const input = baseContext('time', {
    current: { verification: 'conflict', rows: [] },
  });

  const result = analyzeSpecial(input);
  assert.ok(result.missingInputs.includes('Conflict-free source rows are required for analysis.'));
  assert.equal(result.datasets.length, 0);
  assert.equal(result.blocks.length, 0);
});
