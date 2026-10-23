const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../../R-AdvertiseIQ/src/helper/chatbot/fixtures/reporting.v1.json');
const oracle = require('./fixtures/chatbotReporting.reference.json');
const {
  validateReportRequest,
  validateResolvedScope,
  validateReportResponse,
  validateReportSelection
} = require('../api-server/contracts/chatbotReporting.contract');
const clone = value => JSON.parse(JSON.stringify(value));
const base = fixtures.scenarios[0];

test('all synthetic frontend scenarios satisfy the strict shared contract', () => {
  assert.equal(fixtures.metadata.synthetic, true);
  assert.equal(fixtures.metadata.dataOrigin, 'synthetic');
  assert.equal(fixtures.scenarios.length, 4);

  for (const scenario of fixtures.scenarios) {
    assert.doesNotThrow(() => validateReportRequest(scenario.request), scenario.name);
    assert.doesNotThrow(() => validateReportResponse(scenario.response), scenario.name);
    assert.equal(scenario.response.dataOrigin, 'synthetic');
    assert.match(scenario.response.fixtureLabel, /SYNTHETIC/);
  }

  assert.deepEqual([...new Set(base.response.blocks.map(block => block.type))].sort(), ['number_card', 'text', 'line', 'bar', 'grouped_bar', 'heatmap', 'donut', 'table'].sort());
});

test('frontend summary constants agree with independent arithmetic oracle', () => {
  for (const card of base.response.cards) {
    assert.equal(card.value, oracle.weightedSummary.expectedValues[card.metric]);
  }

  const campaigns = base.response.datasets.find(dataset => dataset.id === 'campaigns');

  for (const key of ['spend', 'sales', 'orders', 'clicks', 'impressions']) {
    assert.equal(campaigns.rows.reduce((sum, row) => sum + row[key], 0), oracle.weightedSummary.expectedTotals[key]);
  }
});

test('model requests cannot inject authenticated scope or unknown fields', () => {
  for (const patch of [{
    configId: '000000000000000000000002'
  }, {
    scope: base.response.scope
  }, {
    query: {
      $where: 'true'
    }
  }]) {
    assert.throws(() => validateReportRequest({
      ...clone(base.request),
      ...patch
    }));
  }
});

test('unknown filters, unsafe operators and implicit conversion are rejected', () => {
  for (const filter of [{
    field: 'unknown',
    operator: 'eq',
    value: 1
  }, {
    field: 'orders',
    operator: '$gt',
    value: 0
  }, {
    field: 'orders',
    operator: 'gt',
    value: '0'
  }, {
    field: 'spend',
    operator: 'gt',
    value: 30
  }, {
    field: 'orders',
    operator: 'eq',
    value: 0,
    currencyCode: 'INR'
  }]) {
    assert.throws(() => validateReportRequest({
      ...clone(base.request),
      filters: [filter]
    }));
  }

  assert.throws(() => validateReportRequest({
    ...clone(base.request),
    limit: '10'
  }));
  assert.doesNotThrow(() => validateReportRequest({
    ...clone(base.request),
    filters: [{
      field: 'orders',
      operator: 'eq',
      value: 0
    }]
  }));
});

test('resolved scope rejects currency leaks and unsupported SD keyword tools', () => {
  const foreign = clone(base.response.scope);
  foreign.currencyGroups[0].profileIds.push('9999');
  assert.throws(() => validateResolvedScope(foreign));
  const wrongCurrency = clone(base.response.scope);
  wrongCurrency.currencyGroups[0].currencyCode = 'USD';
  assert.throws(() => validateResolvedScope(wrongCurrency));
  const sdKeywords = clone(base.response.scope);
  Object.assign(sdKeywords.profiles[0], {
    adTypes: ['SD'],
    attributionWindows: {
      SD: 14
    },
    supportedDimensions: {
      SD: ['keyword']
    }
  });
  assert.throws(() => validateResolvedScope(sdKeywords));
});

test('zero is valid data but null cannot be presented as available', () => {
  const zero = clone(base.response);
  zero.cards[0].value = 0;
  delete zero.cards[0].comparison;
  assert.doesNotThrow(() => validateReportResponse(zero));
  zero.cards[0].value = null;
  assert.throws(() => validateReportResponse(zero));
  const missing = clone(fixtures.scenarios.find(scenario => scenario.name === 'missing_sales').response);
  missing.status = 'ok';
  assert.throws(() => validateReportResponse(missing));
});

test('unavailable reports cannot quietly contain numeric account results', () => {
  const unavailable = clone(fixtures.scenarios.find(scenario => scenario.name === 'today_unavailable').response);
  unavailable.cards = [clone(base.response.cards[0])];
  assert.throws(() => validateReportResponse(unavailable));
});

function mixedCurrencyReport() {
  const report = clone(base.response);
  const profile = clone(report.scope.profiles[0]);
  profile.profileId = '1002';
  profile.currencyCode = 'USD';
  report.scope.profiles.push(profile);
  report.scope.currencyGroups.push({
    currencyCode: 'USD',
    profileIds: ['1002']
  });
  const period = clone(report.periods[0]);
  period.profileId = '1002';
  report.periods.push(period);

  return report;
}

test('mixed-currency cards and datasets require explicit grouping', () => {
  assert.throws(() => validateReportResponse(mixedCurrencyReport())); // percent cards are ambiguous too
  const report = mixedCurrencyReport();

  for (const card of report.cards) {
    card.currencyCode = 'INR';
  }

  assert.doesNotThrow(() => validateReportResponse(report));
  delete report.datasets[0].currencyCode;
  assert.throws(() => validateReportResponse(report));
});

test('unknown dataset/card references and undeclared rows are rejected', () => {
  const dataset = clone(base.response);
  dataset.blocks.find(block => block.type === 'line').datasetId = 'not_found';
  assert.throws(() => validateReportResponse(dataset));
  const card = clone(base.response);
  card.blocks.find(block => block.type === 'number_card').metricId = 'not_found';
  assert.throws(() => validateReportResponse(card));
  const row = clone(base.response);
  row.datasets[0].rows[0].unexpected = 123;
  assert.throws(() => validateReportResponse(row));
});

test('charts reject mixed units and donuts above five slices', () => {
  const mixed = clone(base.response);
  mixed.blocks.find(block => block.type === 'bar').yKeys = ['spend', 'orders'];
  assert.throws(() => validateReportResponse(mixed));
  const donut = clone(base.response);
  const dataset = donut.datasets.find(item => item.id === 'placements');
  dataset.rows = Array.from({
    length: 6
  }, (_, index) => ({
    placement: `Synthetic placement ${index}`,
    spend: 20
  }));
  assert.throws(() => validateReportResponse(donut));
});

test('response timestamps and reporting profile scope must be consistent', () => {
  const period = clone(base.response);
  period.periods[0].profileId = '9999';
  assert.throws(() => validateReportResponse(period));
  const timezone = clone(base.response);
  timezone.periods[0].timezone = 'UTC';
  assert.throws(() => validateReportResponse(timezone));
  const coverage = clone(base.response);
  coverage.periods[0].current.toDate = '2026-10-20';
  assert.throws(() => validateReportResponse(coverage));
});

test('selection is checked against supplied server metadata, not model claims', () => {
  assert.doesNotThrow(() => validateReportSelection(base.request, base.response.scope));
  assert.throws(() => validateReportSelection({
    ...clone(base.request),
    profileIds: ['9999']
  }, base.response.scope), /outside resolved report scope/);
  assert.throws(() => validateReportSelection({
    ...clone(base.request),
    adTypes: ['SB']
  }, base.response.scope), /ad type/);
  assert.throws(() => validateReportSelection({
    ...clone(base.request),
    groupBy: ['keyword']
  }, base.response.scope), /dimension/);
  assert.throws(() => validateReportSelection({
    ...clone(base.request),
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 30,
      currencyCode: 'USD'
    }]
  }, base.response.scope), /currency/);
  assert.doesNotThrow(() => validateReportSelection({
    ...clone(base.request),
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 30,
      currencyCode: 'INR'
    }]
  }, base.response.scope));
});

test('fabricated comparison arithmetic and statuses fail validation', () => {
  for (const patch of [{
    absoluteChange: 999
  }, {
    relativeChangePercent: 999
  }, {
    percentagePointChange: 20
  }, {
    status: 'new_activity'
  }]) {
    const report = clone(base.response);
    Object.assign(report.cards[0].comparison, patch);
    assert.throws(() => validateReportResponse(report), JSON.stringify(patch));
  }

  const metricStatus = clone(base.response);
  Object.assign(metricStatus.cards[0], {
    value: null,
    status: 'no_sales'
  });
  delete metricStatus.cards[0].comparison;
  assert.throws(() => validateReportResponse(metricStatus));
});

test('metric units and nonnegative integer count semantics are enforced', () => {
  const wrongUnit = clone(base.response);
  wrongUnit.cards[0].unit = 'percent';
  assert.throws(() => validateReportResponse(wrongUnit));
  const negativeSpend = clone(base.response);
  negativeSpend.cards[0].value = -1;
  delete negativeSpend.cards[0].comparison;
  assert.throws(() => validateReportResponse(negativeSpend));
  const fractionalOrders = clone(base.response);
  const orders = fractionalOrders.cards.find(card => card.metric === 'orders');
  orders.value = 2.5;
  delete orders.comparison;
  assert.throws(() => validateReportResponse(fractionalOrders));
});

test('negative profit remains valid and uses absolute previous profit for relative change', () => {
  const report = clone(base.response);
  report.category = 'products';
  report.cards = [{
    id: 'profit',
    metric: 'profit',
    title: 'Synthetic negative profit',
    value: -50,
    unit: 'currency',
    currencyCode: 'INR',
    status: 'available',
    comparison: {
      previousValue: -100,
      absoluteChange: 50,
      relativeChangePercent: 50,
      percentagePointChange: null,
      status: 'comparable'
    }
  }];
  report.blocks = [{
    type: 'number_card',
    metricId: 'profit'
  }];
  report.datasets = [];
  assert.doesNotThrow(() => validateReportResponse(report));
  report.cards[0].comparison.relativeChangePercent = -50;
  assert.throws(() => validateReportResponse(report));
});

test('timestamps require explicit millisecond UTC instants, not dates or offsets', () => {
  for (const value of ['2026-10-20', '2026-10-20T17:30:00.000+05:30', '2026-10-20T12:00:00Z']) {
    const freshness = clone(base.response);
    freshness.freshness.dataAsOf = value;
    assert.throws(() => validateReportResponse(freshness), value);
    const source = clone(base.response);
    source.freshness.sourceRefs[0].completedAt = value;
    assert.throws(() => validateReportResponse(source), value);
  }

  const period = clone(base.response);
  period.periods[0].current.startAt = '2026-10-13T00:00:00.000+05:30';
  assert.throws(() => validateReportResponse(period));
});

test('empty results cannot carry nonzero cards or populated datasets', () => {
  const empty = clone(fixtures.scenarios.find(scenario => scenario.name === 'verified_empty').response);
  empty.cards = [clone(base.response.cards[0])];
  assert.throws(() => validateReportResponse(empty));
  empty.cards = [];
  empty.datasets = [clone(base.response.datasets.find(dataset => dataset.id === 'campaigns'))];
  assert.throws(() => validateReportResponse(empty));
});

test('attribution windows and dimensions cannot advertise undeclared ad types', () => {
  const windows = clone(base.response.scope);
  windows.profiles[0].attributionWindows.SB = 14;
  assert.throws(() => validateResolvedScope(windows));
  const dimensions = clone(base.response.scope);
  dimensions.profiles[0].supportedDimensions.SB = ['campaign'];
  assert.throws(() => validateResolvedScope(dimensions));
});

test('comparison windows must have matching date counts and partial status', () => {
  const days = clone(base.response);
  days.periods[0].comparison.toDate = '2026-10-11';
  days.periods[0].comparison.endBefore = '2026-10-11T18:30:00.000Z';
  assert.throws(() => validateReportResponse(days));
  const partial = clone(base.response);
  partial.periods[0].comparison.isPartial = true;
  partial.periods[0].comparison.endBefore = '2026-10-12T12:00:00.000Z';
  assert.throws(() => validateReportResponse(partial));
});

test('dataset units describe numeric columns only and heatmaps have one y axis', () => {
  const missingUnit = clone(base.response);
  delete missingUnit.datasets[0].columns.find(column => column.key === 'spend').unit;
  assert.throws(() => validateReportResponse(missingUnit));
  const textUnit = clone(base.response);
  textUnit.datasets[0].columns.find(column => column.key === 'date').unit = 'count';
  assert.throws(() => validateReportResponse(textUnit));
  const heatmap = clone(base.response);
  heatmap.blocks.find(block => block.type === 'heatmap').yKeys = ['hour', 'spend'];
  assert.throws(() => validateReportResponse(heatmap));
});

test('errors cannot contain numeric results and follow-ups stay in report scope', () => {
  const error = clone(base.response);
  error.status = 'error';
  assert.throws(() => validateReportResponse(error));
  const followUp = clone(base.response);
  followUp.followUps[0].request.profileIds = ['9999'];
  assert.throws(() => validateReportResponse(followUp));
});

test('entity selections use supported dimensions and requested profile IDs', () => {
  const unsupported = clone(base.request);
  unsupported.entity = {
    dimension: 'keyword',
    ids: ['synthetic_keyword']
  };
  assert.throws(() => validateReportSelection(unsupported, base.response.scope));
  const outside = clone(base.request);
  outside.entity = {
    dimension: 'profile',
    ids: ['9999']
  };
  assert.throws(() => validateReportSelection(outside, base.response.scope));
  const valid = clone(base.request);
  valid.entity = {
    dimension: 'profile',
    ids: ['1001']
  };
  assert.doesNotThrow(() => validateReportSelection(valid, base.response.scope));
});

test('count comparisons reject fractional previous counts and complete reports reject missing metrics', () => {
  const fractional = clone(base.response);
  const orders = fractional.cards.find(card => card.metric === 'orders');
  orders.comparison = {
    previousValue: 2.5,
    absoluteChange: 17.5,
    relativeChangePercent: 700,
    percentagePointChange: null,
    status: 'comparable'
  };
  assert.throws(() => validateReportResponse(fractional));
  const incomplete = clone(base.response);
  incomplete.cards[0].value = null;
  incomplete.cards[0].status = 'missing_data';
  delete incomplete.cards[0].comparison;
  assert.throws(() => validateReportResponse(incomplete));
});

test('verified empty requires fresh complete evidence instead of absent ingestion', () => {
  const seed = fixtures.scenarios.find(scenario => scenario.name === 'verified_empty').response;

  for (const patch of [{
    status: 'unknown'
  }, {
    dataAsOf: null
  }, {
    sourceRefs: []
  }, {
    missingInputs: ['Missing source coverage']
  }]) {
    const report = clone(seed);
    Object.assign(report.freshness, patch);
    assert.throws(() => validateReportResponse(report), JSON.stringify(patch));
  }
});
