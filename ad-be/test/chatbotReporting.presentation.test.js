'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPresentation } = require('../api-server/services/chatbotReporting/reportPresentation');
const { prepareRequest } = require('../api-server/services/chatbotReporting/reportRequest');

function request(overrides = {}) {
  return {
    schemaVersion: '1.0', category: 'summary', profileIds: ['123'], adTypes: ['SP'],
    period: { preset: 'yesterday' }, comparison: { mode: 'none' },
    groupBy: ['campaign'], metrics: ['spend', 'sales', 'orders'], presentation: 'auto',
    ...overrides,
  };
}

function dataset(id, rows, currencyCode = 'USD') {
  const allRows = rows.map(row => ({ profileId: '123', adType: 'SP', name: 'Long campaign name which must remain entirely readable', campaignId: '1', spend: 20, sales: 100, orders: 3, ...row }));
  const types = { spend: 'currency', sales: 'currency', orders: 'count', acos: 'percent' };
  return {
    id,
    currencyCode,
    rows: allRows,
    columns: Object.keys(allRows[0]).map(key => types[key]
      ? { key, label: key, type: 'number', unit: types[key], nullable: true }
      : { key, label: key, type: key === 'date' ? 'date' : 'string' }),
    page: { offset: 0, limit: 25, total: allRows.length, hasMore: false },
  };
}

function report(datasets = [dataset('report_0', [{}])]) {
  return {
    status: 'partial', category: 'summary', cards: [], datasets,
    warnings: [], blocks: datasets.map((item, index) => ({
      type: 'table', title: `summary · SP · 123 · ${index % 2 ? 'comparison' : 'current'}`,
      datasetId: item.id, sortable: true,
    })),
  };
}

test('all contract-valid presentation modes pass request preparation', () => {
  for (const presentation of ['line', 'bar', 'grouped_bar', 'heatmap', 'donut', 'number_card', 'table']) {
    assert.equal(prepareRequest(request({ presentation })).request.presentation, presentation);
  }
});

test('date trends choose line charts and use a compatible unit axis', () => {
  const input = report([dataset('report_0', [{ date: '2026-10-20' }, { date: '2026-10-19', spend: null }])]);
  const result = applyPresentation(input, request({ groupBy: ['date'] }));
  const chart = result.blocks.find(block => block.type === 'line');
  assert.deepEqual(chart.yKeys, ['spend', 'sales']);
  assert.equal(result.datasets[0].rows[0].date, '2026-10-19');
  assert.equal(result.datasets[0].rows[0].spend, null);
  assert.equal(input.datasets[0].rows[0].date, '2026-10-20');
});

test('bar values remain equal to the table including zero, null and long labels', () => {
  const input = report([dataset('report_0', [{ spend: 0 }, { spend: null, campaignId: '2' }])]);
  const result = applyPresentation(input, request({ presentation: 'bar' }));
  const chart = result.blocks.find(block => block.type === 'bar');
  assert.equal(chart.datasetId, 'report_0');
  assert.deepEqual(result.datasets[0], input.datasets[0]);
  assert.equal(result.datasets[0].rows[0].name.length > 25, true);
  assert.ok(result.blocks.some(block => block.type === 'table'));
});

test('partial-page charts declare their bounded scope', () => {
  const input = report();
  input.datasets[0].page.hasMore = true;
  input.datasets[0].page.total = 100;
  const result = applyPresentation(input, request({ presentation: 'bar' }));
  assert.match(result.warnings[0], /returned table page only/);
});

test('grouped bars pair exact entity identity and retain unknown previous rows', () => {
  const input = report([
    dataset('report_0', [{ spend: 30 }, { campaignId: '2', spend: 15 }]),
    dataset('report_1', [{ spend: 20 }]),
  ]);
  const result = applyPresentation(input, request({ category: 'comparison' }));
  const chart = result.blocks.find(block => block.type === 'grouped_bar');
  const rows = result.datasets.find(item => item.id === chart.datasetId).rows;
  assert.deepEqual(rows.map(row => [row.currentValue, row.previousValue]), [[30, 20], [15, null]]);
  assert.match(result.warnings.join(' '), /observed period values/);
});

test('summary and root-cause comparisons automatically show observed period bars', () => {
  const input = report([
    dataset('report_0', [{ spend: 30 }]),
    dataset('report_1', [{ spend: 20 }]),
  ]);

  for (const category of ['summary', 'change']) {
    const result = applyPresentation(input, request({ category,
      comparison: { mode: 'previous_period' } }));
    const chart = result.blocks.find(block => block.type === 'grouped_bar');
    assert.ok(chart, category);
    const chartDataset = result.datasets.find(item => item.id === chart.datasetId);
    assert.deepEqual(chartDataset.rows.map(row => [row.currentValue, row.previousValue]), [[30, 20]]);
    assert.ok(result.warnings.some(warning => warning.includes('coverage warnings')));
  }
});

test('a one-day aggregate does not invent a summary trend or root-cause comparison', () => {
  for (const category of ['summary', 'change']) {
    const input = report();
    const result = applyPresentation(input, request({ category, groupBy: ['profile'] }));
    assert.deepEqual(result, input);
  }
});

test('product analysis automatically charts available metrics without creating missing profit or TACOS', () => {
  const input = report([dataset('report_0', [{ name: 'B012345678', spend: 20, sales: 100 }])]);
  const result = applyPresentation(input, request({ category: 'products', groupBy: ['product'] }));
  const chart = result.blocks.find(block => block.type === 'bar');
  assert.ok(chart);
  assert.deepEqual(chart.yKeys, ['spend', 'sales']);
  assert.deepEqual(result.datasets, input.datasets);

  const unavailable = applyPresentation(input, request({ category: 'products', metrics: ['tacos', 'profit'] }));
  assert.equal(unavailable.blocks.some(block => block.type === 'bar'), false);
  assert.ok(unavailable.warnings.length);
});

test('rules history remains a table when applied-rule before-and-after evidence is absent', () => {
  const input = report();
  assert.deepEqual(applyPresentation(input, request({ category: 'rules' })), input);
});

test('profiles compare together only inside a matching currency and ad type', () => {
  const input = report([
    dataset('report_0', [{ profileId: '123' }], 'USD'),
    dataset('report_1', [{ profileId: '124' }], 'INR'),
    dataset('report_2', [{ profileId: '125', adType: 'SB' }], 'USD'),
    dataset('report_3', [{ profileId: '126' }], 'USD'),
  ]);
  input.blocks.forEach(block => { block.title = 'summary · current'; });
  const result = applyPresentation(input, request({ presentation: 'grouped_bar' }));
  const charts = result.blocks.filter(block => block.type === 'grouped_bar');
  assert.equal(charts.length, 3);
  const usd = result.datasets.find(item => item.id === charts[0].datasetId);
  assert.equal(usd.currencyCode, 'USD');
  assert.equal(usd.rows.length, 2);
  assert.equal(usd.rows[0].previousValue, null);
});

test('donut top four plus Other sums exactly to the same table total', () => {
  const input = report([dataset('report_0', Array.from({ length: 8 }, (_, index) => ({
    placement: `Placement ${index}`, spend: index + 1,
  })))]);
  const result = applyPresentation(input, request({ presentation: 'donut', metrics: ['spend'] }));
  const chart = result.blocks.find(block => block.type === 'donut');
  const rows = result.datasets.find(item => item.id === chart.datasetId).rows;
  assert.equal(rows.length, 5);
  assert.equal(rows[4].name, 'Other');
  assert.equal(rows.reduce((sum, row) => sum + row.spend, 0), 36);
});

test('donut refuses unknowns, negative values, partial groups, ratios and zero-only data', () => {
  for (const change of ['null', 'negative', 'partial', 'ratio', 'zero']) {
    const input = report();
    let metrics = ['spend'];
    if (change === 'null') input.datasets[0].rows[0].spend = null;
    if (change === 'negative') input.datasets[0].rows[0].spend = -1;
    if (change === 'partial') input.datasets[0].page.hasMore = true;
    if (change === 'ratio') metrics = ['acos'];
    if (change === 'zero') input.datasets[0].rows[0].spend = 0;
    const result = applyPresentation(input, request({ presentation: 'donut', metrics }));
    assert.equal(result.blocks.some(block => block.type === 'donut'), false, change);
    assert.ok(result.warnings.length, change);
  }
});

test('single metric auto cards use existing computed values and do not duplicate blocks', () => {
  const input = report();
  input.cards = [{ id: 'card_acos', metric: 'acos', value: 20 }];
  const result = applyPresentation(input, request({ metrics: ['acos'] }));
  assert.equal(result.blocks.filter(block => block.type === 'number_card').length, 1);
  assert.equal(result.cards[0].value, 20);
  const repeated = applyPresentation(result, request({ metrics: ['acos'] }));
  assert.equal(repeated.blocks.filter(block => block.type === 'number_card').length, 1);
});

test('number cards are not fabricated when totals were not calculated', () => {
  const result = applyPresentation(report(), request({ presentation: 'number_card' }));
  assert.equal(result.cards.length, 0);
  assert.match(result.warnings[0], /require calculated summary/);
});

test('existing heatmap is retained without inventing missing hourly data', () => {
  const input = report();
  input.blocks.push({ type: 'heatmap', datasetId: 'report_0', xKey: 'hour', yKeys: ['weekday'], valueKey: 'spend', title: 'Observed' });
  const result = applyPresentation(input, request({ category: 'time' }));
  assert.equal(result.blocks.filter(block => block.type === 'heatmap').length, 1);
  assert.deepEqual(result.datasets, input.datasets);
});

test('waste and growth auto stay tables; unavailable reports remain unchanged', () => {
  for (const category of ['waste', 'growth']) {
    const input = report();
    assert.deepEqual(applyPresentation(input, request({ category })), input);
  }
  const input = report();
  input.status = 'unavailable';
  assert.deepEqual(applyPresentation(input, request({ presentation: 'bar' })), input);
});

test('additional chart datasets respect contract bounds', () => {
  const input = report();
  for (let index = 1; index < 20; index += 1) {
    input.datasets.push(dataset(`extra_${index}`, [{}]));
  }
  const result = applyPresentation(input, request({ presentation: 'donut', metrics: ['spend'] }));
  assert.equal(result.datasets.length, 20);
  assert.equal(result.blocks.some(block => block.type === 'donut'), false);
  assert.match(result.warnings[0], /response limit/);
});

test('mapped charts satisfy the actual v1 response contract', () => {
  const { validateReportResponse } = require('../api-server/contracts/chatbotReporting.contract');
  const fixture = require('../../R-AdvertiseIQ/src/helper/chatbot/fixtures/reporting.v1.json');

  for (const presentation of ['line', 'bar', 'grouped_bar', 'donut', 'number_card']) {
    const input = structuredClone(fixture.scenarios[0].response);
    const currencyCode = input.scope.profiles[0].currencyCode;
    const first = dataset('report_0', [{ date: '2026-10-19', placement: 'Top' }], currencyCode);
    const second = dataset('report_1', [{ date: '2026-10-18', placement: 'Top' }], currencyCode);
    if (presentation !== 'line') {
      for (const source of [first, second]) {
        source.rows.forEach(row => { delete row.date; });
        source.columns = source.columns.filter(column => column.key !== 'date');
      }
    }
    input.datasets = [first, second];
    input.blocks = report(input.datasets).blocks;
    const result = applyPresentation(input, request({ presentation }));
    assert.doesNotThrow(() => validateReportResponse(result), presentation);
  }
});
