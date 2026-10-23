'use strict';

const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const {
  aggregateTotals,
  calculateMetrics,
  compareMetric
} = require('../api-server/helper/chatbotReporting.metrics');
const row = overrides => ({
  spend: 30,
  sales: 150,
  orders: 3,
  clicks: 20,
  impressions: 1000,
  ...overrides
});
const descriptor = (value, unit = 'currency', status = 'available') => ({
  value,
  unit,
  status
});

test('aggregates raw totals before calculating weighted metrics, retaining precision', () => {
  const totals = aggregateTotals([row({
    spend: 10,
    sales: 20,
    orders: 1,
    clicks: 3,
    impressions: 100
  }), row({
    spend: 90,
    sales: 980,
    orders: 9,
    clicks: 27,
    impressions: 900
  })]);
  assert.deepEqual(totals, {
    spend: 100,
    sales: 1000,
    orders: 10,
    clicks: 30,
    impressions: 1000
  });
  const result = calculateMetrics(totals);
  assert.deepEqual(result.acos, descriptor(10, 'percent'));
  assert.deepEqual(result.roas, descriptor(10, 'multiple'));
  assert.deepEqual(result.cpc, descriptor(10 / 3));
  assert.equal(result.cvr.unit, 'percent');
  assert.equal(result.cvr.status, 'available');
  // Division order can differ by one IEEE-754 ulp; no display rounding allowed.
  assert.ok(Math.abs(result.cvr.value - 100 / 3) < 1e-12);
  assert.notEqual(result.cvr.value, 33.33);
  assert.deepEqual(result.ctr, descriptor(3, 'percent'));
  assert.deepEqual(result.aov, descriptor(100));
  assert.deepEqual(result.orders, descriptor(10, 'count'));
});

test('empty rows are additive zeros but zero denominators remain unavailable', () => {
  const totals = aggregateTotals([]);
  assert.deepEqual(totals, {
    spend: 0,
    sales: 0,
    orders: 0,
    clicks: 0,
    impressions: 0
  });
  const result = calculateMetrics(totals);

  for (const [key, status] of Object.entries({
    acos: 'no_sales',
    roas: 'no_spend',
    cpc: 'no_clicks',
    cvr: 'no_clicks',
    ctr: 'no_impressions',
    aov: 'no_orders'
  })) {
    assert.equal(result[key].value, null);
    assert.equal(result[key].status, status);
  }

  assert.deepEqual(result.spend, descriptor(0));
});

test('missing constituents propagate per metric, never becoming a partial total or zero', () => {
  const result = calculateMetrics(aggregateTotals([row(), row({
    sales: null,
    clicks: undefined
  })]));
  assert.deepEqual(result.spend, descriptor(60));
  assert.deepEqual(result.orders, descriptor(6, 'count'));

  for (const key of ['sales', 'clicks', 'acos', 'roas', 'cpc', 'cvr', 'ctr', 'aov']) {
    assert.equal(result[key].value, null);
    assert.equal(result[key].status, 'missing_data');
  }

  // Missing numerator takes precedence over a known zero denominator.
  assert.equal(calculateMetrics(row({
    spend: null,
    sales: 0
  })).acos.status, 'missing_data');
});

test('zero numerators remain meaningful when denominators exist', () => {
  const result = calculateMetrics(row({
    spend: 0,
    orders: 0
  }));
  assert.deepEqual(result.acos, descriptor(0, 'percent'));
  assert.deepEqual(result.cpc, descriptor(0));
  assert.deepEqual(result.cvr, descriptor(0, 'percent'));
  assert.deepEqual(result.roas, descriptor(null, 'multiple', 'no_spend'));
});

test('grain labels must be consistent and never implicitly merged', () => {
  assert.equal(aggregateTotals([row({
    grain: 'campaign_daily'
  }), row({
    grain: 'campaign_daily'
  })]).spend, 60);

  for (const rows of [[row({
    grain: 'campaign_daily'
  }), row({
    grain: 'keyword_daily'
  })], [row({
    grain: 'campaign_daily'
  }), row()], [row(), row({
    grain: 'campaign_daily'
  })], [row({
    grain: ''
  })], [row({
    grain: null
  })]]) {
    assert.throws(() => aggregateTotals(rows), /grain/);
  }
});

test('rejects coercion, invalid counts, invalid rows and hidden invalid constituents', () => {
  for (const value of ['30', NaN, Infinity, -Infinity, -1, true, {}]) {
    assert.throws(() => aggregateTotals([row({
      spend: value
    })]), TypeError);
    assert.throws(() => calculateMetrics(row({
      sales: value
    })), TypeError);
  }

  for (const value of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => aggregateTotals([row({
      clicks: value
    })]), TypeError);
    assert.throws(() => calculateMetrics(row({
      orders: value
    })), TypeError);
  }

  assert.throws(() => aggregateTotals([row({
    sales: null
  }), row({
    sales: 'wrong'
  })]), TypeError);

  for (const invalid of [null, {}, 'rows']) {
    assert.throws(() => aggregateTotals(invalid), TypeError);
  }

  for (const invalid of [null, [], 5]) {
    assert.throws(() => aggregateTotals([invalid]), TypeError);
  }

  assert.throws(() => aggregateTotals([row({
    spend: Number.MAX_VALUE
  }), row({
    spend: Number.MAX_VALUE
  })]), RangeError);
});

test('comparison distinguishes relative percent from percentage points', () => {
  assert.deepEqual(compareMetric(descriptor(35, 'percent'), descriptor(25, 'percent')), {
    previousValue: 25,
    absoluteChange: 10,
    relativeChangePercent: 40,
    percentagePointChange: 10,
    status: 'comparable'
  });
  assert.deepEqual(compareMetric(descriptor(75), descriptor(100)), {
    previousValue: 100,
    absoluteChange: -25,
    relativeChangePercent: -25,
    percentagePointChange: null,
    status: 'comparable'
  });
  assert.equal(compareMetric(descriptor(0), descriptor(100)).relativeChangePercent, -100);
});

test('zero baselines and unavailable comparisons do not manufacture growth percentages', () => {
  assert.deepEqual(compareMetric(descriptor(25), descriptor(0)), {
    previousValue: 0,
    absoluteChange: 25,
    relativeChangePercent: null,
    percentagePointChange: null,
    status: 'new_activity'
  });
  assert.deepEqual(compareMetric(descriptor(0, 'percent'), descriptor(0, 'percent')), {
    previousValue: 0,
    absoluteChange: 0,
    relativeChangePercent: null,
    percentagePointChange: 0,
    status: 'both_zero'
  });
  assert.deepEqual(compareMetric(descriptor(null, 'currency', 'missing_data'), descriptor(10)), {
    previousValue: 10,
    absoluteChange: null,
    relativeChangePercent: null,
    percentagePointChange: null,
    status: 'unavailable'
  });
  assert.equal(compareMetric(undefined, undefined).status, 'unavailable');
  assert.equal(compareMetric(descriptor(10), null).previousValue, null);
});

test('comparison rejects mismatched units, malformed descriptors and inconsistent statuses', () => {
  assert.throws(() => compareMetric(descriptor(10), descriptor(10, 'percent')), /units/);

  for (const invalid of [{}, [], descriptor(Infinity), descriptor('10'), descriptor(-1), descriptor(10, 'unknown'), descriptor(10, 'currency', 'wrong'), descriptor(null), descriptor(10, 'currency', 'missing_data'), descriptor(1.2, 'count')]) {
    assert.throws(() => compareMetric(invalid, descriptor(10)), TypeError);
  }

  // Missing current values do not bypass validation of a malformed previous value.
  assert.throws(() => compareMetric(null, descriptor(NaN)), TypeError);
});
