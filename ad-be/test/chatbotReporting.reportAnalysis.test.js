'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analysisOptions,
  analyzeReport,
  appendAnalysis,
} = require('../api-server/services/chatbotReporting/reportAnalysis');

test('analysisOptions parses valid options and rejects invalid inputs', () => {
  const options = analysisOptions({ minClicks: 30, targetAcos: 25 });
  assert.equal(options.minClicks, 30);
  assert.equal(options.targetAcos, 25);
  assert.equal(options.minOrders, 3); // default

  assert.throws(() => analysisOptions('invalid'), TypeError);
  assert.throws(() => analysisOptions({ unknownOption: 10 }), TypeError);
  assert.throws(() => analysisOptions({ minClicks: -5 }), TypeError);
  assert.throws(() => analysisOptions({ minClicks: 1.5 }), TypeError);
});

test('analyzeReport dispatches to performance, opportunity, and special categories', () => {
  const baseContext = {
    profile: { profileId: '1001', currencyCode: 'USD', attributionWindows: { SP: 7 } },
    adType: 'SP',
    periods: {
      current: { fromDate: '2026-10-19', toDate: '2026-10-19', startAt: '2026-10-19T00:00:00.000Z', endBefore: '2026-10-20T00:00:00.000Z', isPartial: false },
      comparison: { fromDate: '2026-10-18', toDate: '2026-10-18', startAt: '2026-10-18T00:00:00.000Z', endBefore: '2026-10-19T00:00:00.000Z', isPartial: false },
    },
    current: { verification: 'verified', rows: [], warnings: [], missingInputs: [] },
    comparison: { verification: 'verified', rows: [], warnings: [], missingInputs: [] },
    options: {},
    now: new Date('2026-10-21T00:00:00.000Z'),
    idPrefix: 'p1',
  };

  // Performance category
  const perf = analyzeReport({
    ...baseContext,
    request: { category: 'summary', metrics: ['spend', 'sales'], groupBy: [], comparison: { mode: 'previous_period' } },
  });
  assert.ok(perf.cards);

  // Opportunity category
  const opp = analyzeReport({
    ...baseContext,
    request: { category: 'waste', metrics: ['spend', 'sales', 'clicks', 'orders'], groupBy: ['campaign'], filters: [{ field: 'orders', operator: 'eq', value: 0 }] },
  });
  assert.ok(opp.datasets);

  // Special category
  const spec = analyzeReport({
    ...baseContext,
    request: { category: 'products', metrics: ['tacos'], groupBy: ['product'], filters: [], comparison: { mode: 'none' } },
  });
  assert.ok(spec.missingInputs.length > 0);
});

test('appendAnalysis safely merges results into report state with bounds', () => {
  const state = {
    cards: [],
    datasets: [],
    blocks: [],
    analysisText: [],
    warnings: new Set(),
    missingInputs: new Set(),
    followUps: [],
  };

  const result = {
    warnings: ['Warning 1'],
    missingInputs: ['Input 1'],
    cards: [{ id: 'card_1', metric: 'spend' }],
    datasets: [{ id: 'ds_1', rows: [] }],
    blocks: [
      { type: 'number_card', metricId: 'card_1' },
      { type: 'table', datasetId: 'ds_1' },
      { type: 'number_card', metricId: 'invalid_card' }, // should be excluded
    ],
    text: ['Analysis summary line'],
    followUps: [{ label: 'Next report', request: { category: 'summary' } }],
  };

  appendAnalysis(state, result, '1001/SP');

  assert.equal(state.cards.length, 1);
  assert.equal(state.datasets.length, 1);
  assert.equal(state.blocks.length, 2); // invalid_card excluded
  assert.equal(state.analysisText.length, 1);
  assert.equal(state.analysisText[0], '1001/SP: Analysis summary line');
  assert.equal(state.followUps.length, 1);
  assert.ok([...state.warnings].some(w => w.includes('Warning 1')));
  assert.ok([...state.missingInputs].some(m => m.includes('Input 1')));
});
