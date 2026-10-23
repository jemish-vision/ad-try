'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportService } = require('../api-server/services/chatbotReporting.handlers');

const auth = { userId: 'a'.repeat(24), configId: 'b'.repeat(24), organizationId: 'c'.repeat(24) };

function setup({ now = '2026-10-21T12:00:00.000Z', timezone = 'Asia/Kolkata' } = {}) {
  const reads = [];
  let authorizationChecks = 0;
  const service = createReportService({
    db: {},
    now: () => new Date(now),
    makeReportId: () => 'partial_period_test',
    resolveScope: async () => {
      authorizationChecks += 1;
      return {
        configId: auth.configId,
        profiles: [{ profileId: '123', timezone, currencyCode: 'USD', accountType: 'seller',
          adTypes: ['SP'], attributionWindows: { SP: 7 },
          supportedDimensions: { SP: ['profile', 'campaign', 'date', 'weekday', 'hour'] } }],
        currencyGroups: [{ currencyCode: 'USD', profileIds: ['123'] }],
      };
    },
    readDaily: async input => {
      reads.push(input);
      return { rows: [{ profileId: '123', adType: 'SP', campaignId: '1', name: 'Campaign',
        spend: 10, sales: 100, clicks: 20, orders: 2, impressions: 100,
        date: input.period.fromDate }], verification: 'verified', warnings: [], missingInputs: [],
      sourceRefs: [{ name: 'isolated_test_source' }], dataAsOf: '2026-10-21T10:00:00.000Z' };
    },
    readSpecial: async input => {
      reads.push(input);
      return { rows: [], verification: 'unverified', warnings: [],
        missingInputs: [input.period.isPartial ? 'Completed local calendar dates are required.' : 'No observed hourly rows.'],
        sourceRefs: [], dataAsOf: null };
    },
  });
  const run = overrides => service({ schemaVersion: '1.0', category: 'summary', profileIds: ['123'],
    adTypes: ['SP'], period: { preset: 'this_week' }, comparison: { mode: 'previous_period' },
    metrics: ['spend', 'sales'], ...overrides }, auth);
  return { run, reads, authorizationChecks: () => authorizationChecks };
}

test('Wednesday WTD reads only Monday/Tuesday and matching previous weekdays', async () => {
  const { run, reads } = setup();
  const result = await run();
  assert.deepEqual(reads.map(read => [read.period.fromDate, read.period.toDate, read.period.isPartial]), [
    ['2026-10-19', '2026-10-20', false], ['2026-10-12', '2026-10-13', false],
  ]);
  assert.equal(result.periods[0].current.toDate, '2026-10-20');
  assert.equal(result.periods[0].comparison.toDate, '2026-10-13');
  assert.ok(result.warnings.some(warning => warning.includes('completed days through 2026-10-20; today is still updating')));
});

test('completed WTD without comparison performs a single bounded read', async () => {
  const { run, reads } = setup();
  const result = await run({ comparison: { mode: 'none' } });
  assert.equal(reads.length, 1);
  assert.equal(result.periods[0].comparison, null);
});

test('Monday has no completed WTD dates and returns unavailable instead of zero', async () => {
  const { run, reads, authorizationChecks } = setup({ now: '2026-10-19T12:00:00.000Z' });
  const result = await run();
  assert.equal(authorizationChecks(), 1);
  assert.equal(reads.length, 0);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.periods[0].current.isPartial, true);
  assert.equal(result.cards.length, 0);
  assert.match(result.text, /Intraday results are unavailable/);
});

for (const category of ['summary', 'change', 'unusual']) {
  test(`${category} today remains scoped unavailable and performs no daily reads`, async () => {
    const { run, reads } = setup();
    const result = await run({ category, period: { preset: 'today' } });
    assert.equal(reads.length, 0);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.periods[0].current.isPartial, true);
    assert.equal(result.freshness.status, 'unavailable');
    assert.ok(result.freshness.missingInputs.some(message => message.includes('intraday')));
  });
}

test('custom partial range is not silently shortened or read as a completed range', async () => {
  const { run, reads } = setup();
  const result = await run({ period: { preset: 'custom', fromDate: '2026-10-19', toDate: '2026-10-21' } });
  assert.equal(reads.length, 0);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.periods[0].current.toDate, '2026-10-21');
  assert.equal(result.periods[0].comparison.toDate, '2026-10-18');
});

test('WTD custom comparison remains exactly requested and unavailable', async () => {
  const { run, reads } = setup();
  const result = await run({ comparison: { mode: 'custom', fromDate: '2026-10-12', toDate: '2026-10-14' } });
  assert.equal(reads.length, 0);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.periods[0].current.toDate, '2026-10-21');
  assert.equal(result.periods[0].comparison.toDate, '2026-10-14');
});

test('profile-local timezone determines completed WTD dates near UTC midnight', async () => {
  const { run, reads } = setup({ now: '2026-10-21T00:30:00.000Z', timezone: 'America/Los_Angeles' });
  const result = await run();
  assert.equal(reads[0].period.toDate, '2026-10-19');
  assert.equal(result.periods[0].current.endBefore, '2026-10-20T07:00:00.000Z');
});

test('completed WTD comparison respects daylight-saving boundaries', async () => {
  const { run } = setup({ now: '2026-03-12T12:00:00.000Z', timezone: 'America/New_York' });
  const result = await run();
  assert.equal(result.periods[0].current.startAt, '2026-03-09T04:00:00.000Z');
  assert.equal(result.periods[0].comparison.startAt, '2026-03-02T05:00:00.000Z');
  assert.equal(result.periods[0].current.isPartial, false);
  assert.equal(result.periods[0].comparison.isPartial, false);
});

test('completed custom range still reads exact requested dates', async () => {
  const { run, reads } = setup();
  await run({ period: { preset: 'custom', fromDate: '2026-10-10', toDate: '2026-10-12' }, comparison: { mode: 'none' } });
  assert.equal(reads.length, 1);
  assert.equal(reads[0].period.fromDate, '2026-10-10');
  assert.equal(reads[0].period.toDate, '2026-10-12');
});

test('hourly WTD uses completed weekdays and the same previous weekdays', async () => {
  const { run, reads } = setup({ now: '2026-10-22T12:00:00.000Z' });
  const result = await run({ category: 'time', groupBy: ['weekday', 'hour'], metrics: ['spend'] });
  assert.deepEqual(reads.map(read => [read.period.fromDate, read.period.toDate, read.period.isPartial]), [
    ['2026-10-19', '2026-10-21', false], ['2026-10-12', '2026-10-14', false]
  ]);
  assert.equal(result.periods[0].current.toDate, '2026-10-21');
  assert.ok(result.warnings.some(warning => warning.includes('today is still updating')));
});

test('hourly Monday WTD remains unavailable without inventing completed dates', async () => {
  const { run, reads } = setup({ now: '2026-10-19T12:00:00.000Z' });
  const result = await run({ category: 'time', groupBy: ['weekday', 'hour'], metrics: ['spend'], comparison: { mode: 'none' } });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.periods[0].current.isPartial, true);
  assert.ok(reads.every(read => read.period.isPartial));
  assert.equal(result.cards.length, 0);
});

test('hourly WTD follows the profile timezone near UTC midnight', async () => {
  const { run, reads } = setup({ now: '2026-10-21T00:30:00.000Z', timezone: 'America/Los_Angeles' });
  const result = await run({ category: 'time', groupBy: ['weekday'], metrics: ['spend'], comparison: { mode: 'none' } });
  assert.equal(reads[0].period.toDate, '2026-10-19');
  assert.equal(result.periods[0].current.endBefore, '2026-10-20T07:00:00.000Z');
});
