const test = require('node:test');
const assert = require('node:assert/strict');
const reference = require('./fixtures/chatbotReporting.reference.json');
const {
  aggregateTotals,
  calculateMetrics,
  compareMetric
} = require('../api-server/helper/chatbotReporting.metrics');
const {
  resolveReportPeriods
} = require('../api-server/helper/chatbotReporting.dates');

function assertNumber(actual, expected, label) {
  if (expected === null) {
    return assert.equal(actual, null, label);
  }

  assert.equal(typeof actual, 'number', label);
  assert.ok(Number.isFinite(actual), `${label} must be finite`);
  assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: expected ${expected}, received ${actual}`);
}

function assertValues(metrics, expected) {
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(metrics[name], `missing descriptor: ${name}`);
    assertNumber(metrics[name].value, value, name);
    assert.equal(typeof metrics[name].unit, 'string', `${name}.unit`);
    assert.equal(typeof metrics[name].status, 'string', `${name}.status`);
  }
}

test('references are explicitly synthetic, independent of account data', () => {
  assert.equal(reference.metadata.synthetic, true);
  assert.equal(reference.metadata.dataOrigin, 'synthetic');
  assert.match(reference.metadata.description, /No live account data/);
});

test('weighted ratios use summed components rather than averages of row ratios', () => {
  const expected = reference.weightedSummary;
  const totals = aggregateTotals(expected.rows);

  for (const [name, value] of Object.entries(expected.expectedTotals)) {
    assertNumber(totals[name], value, name);
  }

  const metrics = calculateMetrics(totals);
  assertValues(metrics, expected.expectedValues);

  for (const name of Object.keys(expected.expectedValues)) {
    assert.equal(metrics[name].status, 'available');
  }

  // Average row ACOS would be 20, while the correct weighted ACOS is 12.
  assert.notEqual(metrics.acos.value, 20);
});

test('percentage-point differences and relative changes are distinct', () => {
  const expected = reference.weightedSummary;
  const current = calculateMetrics(expected.expectedTotals);
  const previous = calculateMetrics(expected.previousTotals);

  for (const [name, changes] of Object.entries(expected.expectedChanges)) {
    const actual = compareMetric(current[name], previous[name]);

    for (const [key, value] of Object.entries(changes)) {
      assertNumber(actual[key], value, `${name}.${key}`);
    }

    assert.equal(actual.status, 'comparable');
  }
});

test('zero sales is undefined ACOS, while zero conversion with clicks is valid', () => {
  const metrics = calculateMetrics(reference.zeroSales.totals);
  assertValues(metrics, reference.zeroSales.expectedValues);
  assert.equal(metrics.acos.status, 'no_sales');
  assert.equal(metrics.aov.status, 'no_orders');
  assert.equal(metrics.roas.status, 'available');
  assert.equal(metrics.cvr.status, 'available');
});

test('zero clicks and zero spend never produce infinite or fabricated ratios', () => {
  const metrics = calculateMetrics(reference.zeroClicks.totals);
  assertValues(metrics, reference.zeroClicks.expectedValues);
  assert.equal(metrics.cpc.status, 'no_clicks');
  assert.equal(metrics.cvr.status, 'no_clicks');
  assert.equal(metrics.roas.status, 'no_spend');
  assert.equal(metrics.ctr.status, 'available');
});

test('a missing sales component propagates instead of becoming a partial total', () => {
  const expected = reference.missingSales;
  const totals = aggregateTotals(expected.rows);

  for (const [name, value] of Object.entries(expected.expectedTotals)) {
    assertNumber(totals[name], value, name);
  }

  const metrics = calculateMetrics(totals);
  assertValues(metrics, expected.expectedValues);

  for (const name of ['sales', 'acos', 'roas', 'aov']) {
    assert.equal(metrics[name].status, 'missing_data');
  }

  assert.equal(metrics.cpc.status, 'available');
});

test('new activity keeps its absolute change without inventing a relative percentage', () => {
  const expected = reference.newActivity;
  const current = calculateMetrics(expected.currentTotals);
  const previous = calculateMetrics(expected.previousTotals);
  const change = compareMetric(current.spend, previous.spend);

  for (const [key, value] of Object.entries(expected.expectedSpendChange)) {
    assertNumber(change[key], value, key);
  }

  assert.equal(change.status, 'new_activity');
  assert.equal(compareMetric(current.acos, previous.acos).status, 'unavailable');
});

function assertWindow(actual, expected, partial) {
  assert.equal(actual.current.fromDate, expected.startDate);
  assert.equal(actual.current.toDate, expected.endDateInclusive);
  assert.equal(actual.current.startAt, expected.startUtc);
  assert.equal(actual.current.endBefore, expected.endUtcExclusive);
  assert.equal(actual.current.isPartial, partial);
  assert.equal(actual.comparison.startAt, expected.previousStartUtc);
  assert.equal(actual.comparison.endBefore, expected.previousEndUtcExclusive);
  assert.equal(actual.comparison.isPartial, partial);
}

for (const [preset, fixture, partial] of [['yesterday', 'yesterday', false], ['last_7_days', 'last7Days', false], ['this_week', 'weekToDate', true]]) {
  test(`${preset}: profile-local boundaries and comparison match independent calendar reference`, () => {
    const result = resolveReportPeriods({
      preset
    }, {
      mode: 'previous_period'
    }, {
      timezone: reference.dates.timezone,
      now: reference.dates.now
    });
    assert.equal(result.timezone, reference.dates.timezone);
    assertWindow(result, reference.dates[fixture], partial);
  });
}
