'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const moment = require('moment-timezone');
const { getRollingReportDates } = require('../api-server/helper/rollingReportDates');
const { getTargetingRuleDate } = require('../api-server/helper/targetingRuleDate');

// Exercise the actual common resolver without loading Redis, models or API clients.
const source = fs.readFileSync(path.join(__dirname, '../api-server/helper/common.js'), 'utf8');
const ruleDateSource = source.slice(source.indexOf('const getRuleDate ='), source.indexOf('const safeJSON ='));
const context = { moment, getRollingReportDates };
vm.runInNewContext(`${ruleDateSource}\nthis.getRuleDate = getRuleDate;`, context);

const presets = [
  ['LAST_7_DAYS', 7], ['LAST_14_DAYS', 14], ['LAST_30_DAYS', 30],
  ['LAST_65_DAYS', 65], ['LAST_6_MONTHS', 180], ['LAST_7_DAYS_1', 7],
];

function check(now, preset, days) {
  const before = now.toISOString();
  const result = getRollingReportDates(now, preset);
  assert.equal(result.toDate, now.clone().subtract(1, 'day').format('YYYY-MM-DD'));
  assert.equal(now.clone().startOf('day').diff(moment.tz(result.fromDate, now.tz()), 'days'), days);
  assert.equal(now.toISOString(), before, 'resolver must not mutate caller clock');
  assert.deepEqual(getTargetingRuleDate(now, preset, {}), result);
  return result;
}

test('all rolling presets use inclusive completed dates for the user example', () => {
  const now = moment.tz('2026-10-26T12:00:00', 'Asia/Kolkata');
  for (const [preset, days] of presets) check(now, preset, days);
  assert.deepEqual(getRollingReportDates(now, 'LAST_7_DAYS'), { fromDate: '2026-10-19', toDate: '2026-10-25' });
  assert.deepEqual(getRollingReportDates(now, 'LAST_6_MONTHS'), { fromDate: '2026-04-29', toDate: '2026-10-25' });
});

test('rolling presets preserve calendar counts at midnight, leap/year boundaries and DST', () => {
  for (const [date, timezone] of [
    ['2026-10-26T00:00:00', 'Asia/Kolkata'],
    ['2026-01-01T00:01:00', 'Pacific/Auckland'],
    ['2024-03-01T12:00:00', 'UTC'],
    ['2026-03-09T12:00:00', 'America/New_York'],
    ['2026-11-02T12:00:00', 'America/New_York'],
  ]) {
    for (const [preset, days] of presets) check(moment.tz(date, timezone), preset, days);
  }
});

test('common resolver and targeting agree for all requested presets in profile timezones', () => {
  const previousClock = moment.now;
  moment.now = () => Date.parse('2026-10-26T00:15:00Z');
  try {
    for (const timezone of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']) {
      for (const [preset, days] of presets) {
        const expected = check(moment().tz(timezone), preset, days);
        assert.deepEqual(JSON.parse(JSON.stringify(context.getRuleDate(timezone, preset))), expected);
      }
    }
    assert.equal(context.getRuleDate('Asia/Kolkata', 'THIS_MONTH').fromDate, '2026-10-01');
    assert.equal(context.getRuleDate('Asia/Kolkata', 'THIS_MONTH').toDate, '2026-10-31');
    assert.equal(context.getRuleDate('Asia/Kolkata', 'LAST_MONTH').toDate, '2026-09-30');
    assert.equal(context.getRuleDate('Asia/Kolkata', 'YEAR_TO_DATE', '2026-08-15').toDate, '2026-08-15');
    assert.equal(context.getRuleDate('Asia/Kolkata', 'LAST_60_DAYS').toDate, '2026-10-26');
  } finally {
    moment.now = previousClock;
  }
});

test('non-rolling filters preserve caller fallback', () => {
  const now = moment.tz('2026-10-26', 'Asia/Kolkata');
  const fallback = { fromDate: '2026-01-01', toDate: '2026-02-01' };
  for (const preset of ['THIS_MONTH', 'CUSTOM', undefined, 'toString']) {
    assert.equal(getRollingReportDates(now, preset), undefined);
    assert.equal(getTargetingRuleDate(now, preset, fallback), fallback);
  }
});
