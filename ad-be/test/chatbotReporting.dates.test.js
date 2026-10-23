'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveReportPeriods: resolve
} = require('../api-server/helper/chatbotReporting.dates');
const fixed = {
  timezone: 'Asia/Kolkata',
  now: '2026-10-20T03:15:00Z'
};

test('yesterday uses the profile timezone and UTC exclusive boundaries', () => {
  const india = resolve({
    preset: 'yesterday'
  }, {
    mode: 'previous_period'
  }, fixed);
  assert.deepEqual(india.current, {
    fromDate: '2026-10-19',
    toDate: '2026-10-19',
    startAt: '2026-10-18T18:30:00.000Z',
    endBefore: '2026-10-19T18:30:00.000Z',
    isPartial: false
  });
  assert.equal(india.comparison.fromDate, '2026-10-18');
  const la = resolve({
    preset: 'yesterday'
  }, undefined, {
    ...fixed,
    timezone: 'America/Los_Angeles'
  });
  assert.equal(la.current.fromDate, '2026-10-18');
  assert.equal(la.current.startAt, '2026-10-18T07:00:00.000Z');
  assert.equal(la.current.endBefore, '2026-10-19T07:00:00.000Z');
});

test('week to date compares Monday through the same previous Tuesday clock', () => {
  const result = resolve({
    preset: 'this_week'
  }, {
    mode: 'previous_period'
  }, fixed);
  assert.equal(result.current.fromDate, '2026-10-19');
  assert.equal(result.current.endBefore, '2026-10-20T03:15:00.000Z');
  assert.equal(result.comparison.fromDate, '2026-10-12');
  assert.equal(result.comparison.toDate, '2026-10-13');
  assert.equal(result.comparison.endBefore, '2026-10-13T03:15:00.000Z');
});

test('last 14 days excludes today and comparison has 14 completed dates', () => {
  const result = resolve({
    preset: 'last_14_days'
  }, {
    mode: 'previous_period'
  }, fixed);
  assert.equal(result.current.fromDate, '2026-10-06');
  assert.equal(result.current.toDate, '2026-10-19');
  assert.equal(result.comparison.fromDate, '2026-09-22');
  assert.equal(result.comparison.toDate, '2026-10-05');
});

test('all completed presets and ISO last week resolve exact dates', () => {
  for (const [preset, from, to] of [['last_7_days', '2026-10-13', '2026-10-19'], ['last_30_days', '2026-09-20', '2026-10-19'], ['last_week', '2026-10-12', '2026-10-18']]) {
    const result = resolve({
      preset
    }, undefined, fixed);
    assert.equal(result.current.fromDate, from);
    assert.equal(result.current.toDate, to);
    assert.equal(result.current.isPartial, false);
  }
});

test('today uses an equal elapsed previous day and week wall clock', () => {
  const day = resolve({
    preset: 'today'
  }, {
    mode: 'previous_period'
  }, fixed);
  assert.equal(day.current.startAt, '2026-10-19T18:30:00.000Z');
  assert.equal(day.comparison.endBefore, '2026-10-19T03:15:00.000Z');
  const week = resolve({
    preset: 'today'
  }, {
    mode: 'previous_week'
  }, fixed);
  assert.equal(week.comparison.endBefore, '2026-10-13T03:15:00.000Z');
});

test('leap day is valid and strict invalid leap days are rejected', () => {
  const result = resolve({
    preset: 'custom',
    fromDate: '2024-02-29',
    toDate: '2024-02-29'
  }, undefined, fixed);
  assert.equal(result.current.endBefore, '2024-02-29T18:30:00.000Z');
  assert.throws(() => resolve({
    preset: 'custom',
    fromDate: '2025-02-29',
    toDate: '2025-03-01'
  }, undefined, fixed));
});

test('completed DST spring and fall days contain 23 and 25 hours', () => {
  for (const [now, startAt, endBefore, hours] of [['2026-03-09T16:00:00Z', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23], ['2026-11-02T16:00:00Z', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25]]) {
    const result = resolve({
      preset: 'yesterday'
    }, undefined, {
      timezone: 'America/New_York',
      now
    });
    assert.equal(result.current.startAt, startAt);
    assert.equal(result.current.endBefore, endBefore);
    assert.equal((Date.parse(endBefore) - Date.parse(startAt)) / 3600000, hours);
  }
});

test('partial previous-week comparison preserves local clock across DST', () => {
  const spring = resolve({
    preset: 'today'
  }, {
    mode: 'previous_week'
  }, {
    timezone: 'America/New_York',
    now: '2026-03-08T16:00:00Z'
  });
  assert.equal(spring.comparison.endBefore, '2026-03-01T17:00:00.000Z');
  const fall = resolve({
    preset: 'today'
  }, {
    mode: 'previous_week'
  }, {
    timezone: 'America/New_York',
    now: '2026-11-01T17:00:00Z'
  });
  assert.equal(fall.comparison.endBefore, '2026-10-25T16:00:00.000Z');
});

test('DST gap moves cutoff forward and repeated cutoff uses the earlier offset', () => {
  const spring = resolve({
    preset: 'today'
  }, {
    mode: 'previous_week'
  }, {
    timezone: 'America/New_York',
    now: '2026-03-15T06:30:00Z'
  });
  assert.equal(spring.comparison.endBefore, '2026-03-08T07:30:00.000Z');
  const fall = resolve({
    preset: 'today'
  }, {
    mode: 'previous_week'
  }, {
    timezone: 'America/New_York',
    now: '2026-11-08T06:30:00Z'
  });
  assert.equal(fall.comparison.endBefore, '2026-11-01T05:30:00.000Z');
});

test('completed custom windows have matching prior calendar days across DST', () => {
  const result = resolve({
    preset: 'custom',
    fromDate: '2026-03-08',
    toDate: '2026-03-09'
  }, {
    mode: 'previous_period'
  }, {
    timezone: 'America/New_York',
    now: '2026-03-15T16:00:00Z'
  });
  assert.equal(result.current.startAt, '2026-03-08T05:00:00.000Z');
  assert.equal(result.current.endBefore, '2026-03-10T04:00:00.000Z');
  assert.equal(result.comparison.fromDate, '2026-03-06');
  assert.equal(result.comparison.toDate, '2026-03-07');
  assert.equal(result.comparison.endBefore, '2026-03-08T05:00:00.000Z');
});

test('midnight DST skips do not carry 01:00 into comparison start dates', () => {
  const result = resolve({
    preset: 'custom',
    fromDate: '2018-11-04',
    toDate: '2018-11-04'
  }, {
    mode: 'previous_period'
  }, {
    timezone: 'America/Sao_Paulo',
    now: '2018-11-06T15:00:00Z'
  });
  assert.equal(result.current.startAt, '2018-11-04T03:00:00.000Z');
  assert.equal(result.current.endBefore, '2018-11-05T02:00:00.000Z');
  assert.equal(result.comparison.startAt, '2018-11-03T03:00:00.000Z');
  assert.equal(result.comparison.endBefore, '2018-11-04T03:00:00.000Z');
});

test('custom periods ending today and custom comparisons match partial final clock', () => {
  const result = resolve({
    preset: 'custom',
    fromDate: '2026-10-18',
    toDate: '2026-10-20'
  }, {
    mode: 'custom',
    fromDate: '2026-10-11',
    toDate: '2026-10-13'
  }, fixed);
  assert.equal(result.current.isPartial, true);
  assert.equal(result.current.endBefore, '2026-10-20T03:15:00.000Z');
  assert.equal(result.comparison.endBefore, '2026-10-13T03:15:00.000Z');
});

test('maximum 366 dates accepted; oversized, inverted, malformed and future dates rejected', () => {
  resolve({
    preset: 'custom',
    fromDate: '2024-01-01',
    toDate: '2024-12-31'
  }, undefined, fixed);

  for (const period of [{
    preset: 'custom',
    fromDate: '2024-01-01',
    toDate: '2025-01-01'
  }, {
    preset: 'custom',
    fromDate: '2026-10-19',
    toDate: '2026-10-18'
  }, {
    preset: 'custom',
    fromDate: '2026-1-01',
    toDate: '2026-10-18'
  }, {
    preset: 'custom',
    fromDate: '2026-10-01',
    toDate: '2026-10-21'
  }, {
    preset: 'yesterday',
    fromDate: '2026-01-01'
  }, {
    preset: 'invalid'
  }]) {
    assert.throws(() => resolve(period, undefined, fixed));
  }
});

test('reject unequal, overlapping and future comparison periods', () => {
  const period = {
    preset: 'custom',
    fromDate: '2026-10-15',
    toDate: '2026-10-17'
  };

  for (const comparison of [{
    mode: 'custom',
    fromDate: '2026-10-10',
    toDate: '2026-10-11'
  }, {
    mode: 'custom',
    fromDate: '2026-10-14',
    toDate: '2026-10-16'
  }, {
    mode: 'custom',
    fromDate: '2026-10-18',
    toDate: '2026-10-20'
  }, {
    mode: 'custom',
    fromDate: '2026-10-20',
    toDate: '2026-10-22'
  }, {
    mode: 'none',
    fromDate: '2026-10-01'
  }, {
    mode: 'unknown'
  }]) {
    assert.throws(() => resolve(period, comparison, fixed));
  }

  assert.throws(() => resolve({
    preset: 'custom',
    fromDate: '2026-10-15',
    toDate: '2026-10-16'
  }, {
    mode: 'custom',
    fromDate: '2026-10-18',
    toDate: '2026-10-19'
  }, fixed), /precede/);
  assert.throws(() => resolve({
    preset: 'last_14_days'
  }, {
    mode: 'previous_week'
  }, fixed), /overlap/);
});

test('invalid timezone, ambiguous now, invalid instant and zero duration are rejected', () => {
  for (const options of [{
    ...fixed,
    timezone: 'Not/AZone'
  }, {
    ...fixed,
    timezone: undefined
  }, {
    ...fixed,
    now: '2026-10-20'
  }, {
    ...fixed,
    now: '2026-02-30T00:00:00Z'
  }, {
    ...fixed,
    now: new Date(NaN)
  }, {
    ...fixed,
    now: '2026-10-19T18:30:00Z'
  }]) {
    assert.throws(() => resolve({
      preset: 'today'
    }, undefined, options));
  }
});
