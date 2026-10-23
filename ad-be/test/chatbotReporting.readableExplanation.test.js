'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { explainReport, formatValue } = require('../api-server/services/chatbotReporting/readableExplanation');
const { createChatService, sanitizeReportRequest, explicitQuestionPeriod } = require('../api-server/services/chatbotReporting.chat');

function report() {
  return {
    category: 'growth', status: 'partial', cards: [],
    scope: { profiles: [{ profileId: '12345678901234', currencyCode: 'INR' }] },
    freshness: { missingInputs: ['Verified reporting coverage', 'Provide target ACOS'] },
    datasets: [{ id: 'report_0', currencyCode: 'INR',
      columns: [
        { key: 'spend', type: 'number', unit: 'currency' },
        { key: 'sales', type: 'number', unit: 'currency' },
        { key: 'acos', type: 'number', unit: 'percent' },
      ],
      rows: [{ profileId: '12345678901234', adType: 'SP', name: 'shirt for man', spend: 4.10, sales: 887.62, acos: 0.461909375 },
        { name: 'another keyword', spend: 46.2, sales: 100, acos: 46.2 }],
    }],
    blocks: [{ type: 'table', title: 'growth SP current', datasetId: 'report_0' }],
  };
}

test('calculated percentages stay attached to their own entity without multiplying by 100', () => {
  const text = explainReport(report());
  assert.match(text, /shirt for man — Spend: INR 4\.10 · Ad sales: INR 887\.62 · ACOS: 0\.46%/);
  assert.match(text, /another keyword — Spend: INR 46\.20 · Ad sales: INR 100\.00 · ACOS: 46\.2%/);
  assert.doesNotMatch(text, /shirt for man[^\n]*46\.2%/);
  assert.doesNotMatch(text, /12345678901234|verified reporting coverage/i);
  assert.match(text, /Tell me your target ACOS/);
});

test('all seven summary KPIs remain separate by profile, currency and ad type', () => {
  const input = report();
  input.category = 'summary';
  input.scope.profiles.push({ profileId: '22222222222222', currencyCode: 'USD' });
  const units = { spend: 'currency', sales: 'currency', acos: 'percent', roas: 'multiple', orders: 'count', cpc: 'currency', cvr: 'percent' };
  input.cards = [];
  for (const profile of input.scope.profiles) {
    for (const adType of ['SP', 'SB']) {
      for (const [metric, unit] of Object.entries(units)) {
        input.cards.push({ metric, unit, value: 2.5, currencyCode: profile.currencyCode, title: `${profile.profileId} ${adType} ${metric}` });
      }
    }
  }
  const text = explainReport(input);
  for (const label of ['Spend:', 'Ad sales:', 'ACOS:', 'ROAS:', 'Orders:', 'CPC:', 'Conversion rate:']) {
    assert.equal(text.split(label).length - 1, 4, label);
  }
  assert.match(text, /Profile 1 · Sponsored Products · INR/);
  assert.match(text, /Profile 2 · Sponsored Brands · USD/);
  assert.doesNotMatch(text, /22222222222222/);
});

test('partial reports bypass AI explanation even if another row contains the hallucinated percentage', async () => {
  let turns = 0;
  const service = createChatService({
    aiProvider: { requestTurn: async () => {
      turns += 1;
      if (turns > 1) assert.fail('Do not ask AI to rewrite incomplete numeric reports');
      return { toolCalls: [{ name: 'run_report', id: 'call_1', arguments: { category: 'growth', groupBy: ['keyword'] } }] };
    } },
    reportService: async () => report(),
  });
  const result = await service({ message: 'Keywords with great ACOS but low impressions, target ACOS 20%', profileIds: ['12345678901234'], reportContext: { period: { preset: 'last_7_days' } } });
  assert.equal(turns, 1);
  assert.match(result.replyMessage, /shirt for man[^\n]*ACOS: 0\.46%/);
});

test('unavailable results explain prerequisites without exposing internal codes or inventing values', () => {
  const text = explainReport({ status: 'unavailable', freshness: { missingInputs: ['HOURLY_ORDERS_ARE_UNITS Validated hourly orders'] } });
  assert.match(text, /Hourly order counts are not available/);
  assert.doesNotMatch(text, /HOURLY_|0%/);
  assert.equal(formatValue(null, 'percent'), 'Not available');
});

test('zero-sales filter inherits the explicit dollar threshold currency before scope checks', () => {
  const request = sanitizeReportRequest({ category: 'waste', period: { preset: 'last_14_days' }, filters: [
    { field: 'spend', operator: 'gt', value: 30, currencyCode: 'USD' },
    { field: 'sales', operator: 'eq', value: 0 },
  ] }, { profileIds: ['123'], currencyCode: 'INR' });
  assert.deepEqual(request.filters.map(filter => filter.currencyCode), ['USD', 'USD']);
});

test('weekday waste questions use the hourly time source without losing metrics or period', () => {
  const request = sanitizeReportRequest({ category: 'waste', groupBy: ['weekday'], metrics: ['spend', 'sales', 'acos'], period: { preset: 'last_14_days' } }, { profileIds: ['123'] });
  assert.equal(request.category, 'time');
  assert.deepEqual(request.groupBy, ['weekday']);
  assert.deepEqual(request.metrics, ['spend', 'sales', 'acos']);
  assert.deepEqual(request.period, { preset: 'last_14_days' });
});

test('quoted visual names normalize before enum validation, while unknown visuals still fail', () => {
  assert.equal(sanitizeReportRequest({ category: 'unusual', presentation: ' "grouped_bar" ' }, { profileIds: ['123'] }).presentation, 'grouped_bar');
  assert.throws(() => sanitizeReportRequest({ category: 'unusual', presentation: '"fake_chart"' }, { profileIds: ['123'] }));
});

test('a rule effectiveness question without a named rule asks for name and start date', async () => {
  const service = createChatService({ aiProvider: { requestTurn: async () => assert.fail('Clarify the rule before querying AI or reports') } });
  const result = await service({ message: 'Did performance improve after my bid rule started?' });
  assert.match(result.replyMessage, /rule name and start date/);
  assert.equal(result.isReport, false);
});

test('explicit reporting dates override stale AI and session dates', async () => {
  let received;
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [{ name: 'run_report', id: 'id', arguments: {
      category: 'change', period: { preset: 'custom', fromDate: '2026-10-15', toDate: '2026-10-21' },
    } }] }) },
    reportService: async request => { received = request; return { status: 'unavailable', category: 'change' }; },
  });
  await service({ message: 'Why did sales drop this week?', profileIds: ['123'], reportContext: {
    period: { preset: 'custom', fromDate: '2026-10-15', toDate: '2026-10-21' },
  } });
  assert.deepEqual(received.period, { preset: 'this_week' });
  assert.deepEqual(explicitQuestionPeriod('Keywords that spent over $30 with no sales in 14 days'), { preset: 'last_14_days' });
});

test('period recognition preserves ambiguous dates and rule start dates for normal resolution', () => {
  assert.deepEqual(explicitQuestionPeriod('Summarize this week vs last week'), { preset: 'this_week' });
  assert.equal(explicitQuestionPeriod('Compare yesterday with today'), null);
  assert.equal(explicitQuestionPeriod('My rule started yesterday; did it improve performance?'), null);
  assert.equal(explicitQuestionPeriod('Show this week through 2026-10-21'), null);
  assert.equal(explicitQuestionPeriod('Show keywords with 14 days of stock'), null);
});

test('time labels distinguish weekdays, hours and combined groups', () => {
  const input = report();
  input.category = 'time';
  const dataset = input.datasets[0];
  dataset.columns = [{ key: 'weekday', type: 'number' }, { key: 'spend', type: 'number', unit: 'currency' }];
  dataset.rows = [{ name: '2', weekday: 2, spend: 30 }];
  assert.match(explainReport(input), /Tuesday — Spend: INR 30\.00/);
  dataset.columns[0] = { key: 'hour', type: 'number' };
  dataset.rows = [{ name: '2', hour: 2, spend: 30 }];
  assert.match(explainReport(input), /02:00 — Spend: INR 30\.00/);
  assert.doesNotMatch(explainReport(input), /Tuesday/);
  dataset.columns.push({ key: 'weekday', type: 'number' });
  dataset.rows = [{ name: '0 / 1', hour: 0, weekday: 1, spend: 30 }];
  assert.match(explainReport(input), /Monday 00:00 — Spend: INR 30\.00/);
});

test('analysis text and observed rows cannot suppress missing-data explanations', () => {
  const input = report();
  input.text = 'The observed keywords are shown below.';
  input.freshness.missingInputs.push('Current keyword inventory');

  const text = explainReport(input);

  assert.match(text, /Some data is incomplete/);
  assert.match(text, /current keyword list is needed/i);
  assert.match(text, /Tell me your target ACOS/);
});

test('an empty rule-history read is not described as proof that no changes occurred', () => {
  const text = explainReport({
    category: 'rules',
    status: 'unavailable',
    text: 'Rule history lists recorded settings.',
    freshness: { missingInputs: ['No matching rule-history records found for this period.'] },
  });

  assert.match(text, /No matching rule-history records were found/);
  assert.match(text, /does not confirm that no changes occurred/);
});
