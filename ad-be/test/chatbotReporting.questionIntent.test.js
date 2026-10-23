'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createChatService,
  extractExplicitSingleMetric,
  normalizeQuestionReportArguments,
  sanitizeReportRequest,
} = require('../api-server/services/chatbotReporting.chat');

const SUMMARY_METRICS = ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr'];

test('overall yesterday and weekly summaries include all seven KPIs, comparison and movers', () => {
  for (const [question, category] of [
    ['How did yesterday go?', 'summary'],
    ['How did my ads perform yesterday?', 'summary'],
    ['Summarize this week vs last week', 'comparison'],
    ['Performance overview for last 7 days', 'summary'],
  ]) {
    const original = { category, metrics: ['spend'], comparison: { mode: 'none' }, analysis: { includeMovers: false } };
    const result = normalizeQuestionReportArguments(original, question);
    assert.deepEqual(result.metrics, SUMMARY_METRICS, question);
    assert.deepEqual(result.comparison, { mode: 'previous_period' }, question);
    assert.equal(result.analysis.includeMovers, true, question);
    assert.equal(original.analysis.includeMovers, false, 'Normalization must not mutate the model arguments');
  }
});

test('single-metric account questions remain concise point reports', () => {
  const result = normalizeQuestionReportArguments({ category: 'summary', metrics: SUMMARY_METRICS,
    comparison: { mode: 'previous_period' }, analysis: { includeMovers: true } }, 'Yesterday ACOS');
  assert.deepEqual(result.metrics, ['acos']);
  assert.equal(result.presentation, 'number_card');
  assert.equal(result.comparison.mode, 'none');
  assert.equal(result.analysis.includeMovers, false);
  assert.equal(extractExplicitSingleMetric('Cost per click yesterday'), 'cpc');
  assert.equal(extractExplicitSingleMetric('Click-through rate yesterday'), 'ctr');
});

test('rankings and entity lists cannot collapse into account-level number cards', () => {
  for (const [question, category, dimensions, metrics] of [
    ['Which placements have the worst ACOS?', 'waste', ['placement'], ['acos', 'spend', 'sales']],
    ['Campaigns spending a lot but getting few sales', 'waste', ['campaign'], ['spend', 'sales', 'orders', 'clicks', 'acos']],
    ['Keywords with great ACOS but low impressions', 'growth', ['keyword'], ['spend', 'sales', 'orders', 'clicks', 'impressions', 'acos']],
    ['Top 10 campaigns by spend', 'summary', ['campaign'], ['spend']],
    ['Which hours of the day have the best conversion?', 'time', ['hour', 'weekday'], ['cvr', 'orders', 'clicks']],
  ]) {
    const result = normalizeQuestionReportArguments({ category, groupBy: dimensions, metrics, presentation: 'table' }, question);
    assert.deepEqual(result.metrics, metrics, question);
    assert.deepEqual(result.groupBy, dimensions, question);
    assert.notEqual(result.presentation, 'number_card', question);
  }
});

test('explicit custom comparisons stay intact unless a new clear reporting period replaces them', () => {
  const comparison = { mode: 'custom', fromDate: '2026-09-01', toDate: '2026-09-07' };
  assert.deepEqual(normalizeQuestionReportArguments({ category: 'comparison', comparison }, 'Compare September 8–14 with September 1–7').comparison, comparison);
  const next = normalizeQuestionReportArguments({ category: 'change', comparison }, 'Why did sales drop this week?');
  assert.deepEqual(next.period, { preset: 'this_week' });
  assert.deepEqual(next.comparison, { mode: 'previous_period' });
});

test('five-profile comparison asks for selections before AI or reporting when only one is selected', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => assert.fail('Clarify profile selection before calling AI') },
    reportService: async () => assert.fail('Do not return one profile as a five-profile comparison'),
  });
  const result = await service({ message: 'How are my 5 profiles doing compared to each other?', profileIds: ['123'],
    reportContext: { category: 'comparison', period: { preset: 'this_week' } } });
  assert.equal(result.isReport, false);
  assert.match(result.replyMessage, /compare 5 profiles/);
  assert.match(result.replyMessage, /only one profile/);
  assert.match(result.replyMessage, /share their names/);
  assert.doesNotMatch(result.replyMessage, /profile IDs/);
});

test('summary request normalization survives a model choosing comparison none', async () => {
  let request;
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [{ id: 'summary', name: 'run_report', arguments: {
      category: 'summary', metrics: ['spend'], comparison: { mode: 'none' },
    } }] }) },
    reportService: async input => { request = input; return { category: 'summary', status: 'unavailable' }; },
  });
  await service({ message: 'How did yesterday go?', profileIds: ['123'] });
  assert.deepEqual(request.metrics, SUMMARY_METRICS);
  assert.deepEqual(request.period, { preset: 'yesterday' });
  assert.equal(request.comparison.mode, 'previous_period');
  assert.equal(request.analysis.includeMovers, true);
});

test('today requests stay today with an active profile instead of substituting yesterday', async () => {
  let request;
  let instructions;
  const service = createChatService({
    aiProvider: { requestTurn: async input => {
      instructions = input.instructions;
      return { toolCalls: [{ id: 'today', name: 'run_report', arguments: { category: 'summary', period: { preset: 'yesterday' } } }] };
    } },
    reportService: async input => { request = input; return { category: 'summary', status: 'unavailable' }; },
  });
  await service({ message: "Today's spend", profileIds: ['123'], activeProfile: { name: 'Tagdo', currencyCode: 'INR' } });
  assert.equal(request.period.preset, 'today');
  assert.match(instructions, /never silently replace today with yesterday/);
  assert.doesNotMatch(instructions, /Query yesterday's verified figures/);
});

test('high-spend few-sales campaigns use relative ranking without invented thresholds or stale filters', () => {
  const original = { category: 'waste', groupBy: ['keyword'], metrics: ['sales'],
    filters: [{ field: 'spend', operator: 'gt', value: 100 }], analysis: { includeMovers: true } };
  const args = normalizeQuestionReportArguments(original, 'Campaigns spending a lot but getting few sales');
  const request = sanitizeReportRequest(args, { profileIds: ['123'], reportContext: {
    filters: [{ field: 'spend', operator: 'gt', value: 30, currencyCode: 'USD' }],
    entity: { dimension: 'keyword', ids: ['456'] },
    offset: 25,
  } });
  assert.equal(request.category, 'waste');
  assert.deepEqual(request.groupBy, ['campaign']);
  assert.deepEqual(request.filters, []);
  assert.equal(request.entity, undefined);
  assert.equal(request.analysis.includeMovers, false);
  assert.equal(request.offset, 0);
  assert.deepEqual(request.sort, { field: 'acos', direction: 'desc' });
  assert.equal(request.presentation, 'table');
  assert.equal(original.filters[0].value, 100, 'Model arguments must not be mutated');
});

test('search terms with clicks but no orders retain both exact filters and pass request preparation', () => {
  const { prepareRequest } = require('../api-server/services/chatbotReporting/reportRequest');
  const args = normalizeQuestionReportArguments({ category: 'summary', groupBy: ['campaign'],
    filters: [{ field: 'acos', operator: 'gt', value: 50 }], adTypes: ['SP', 'SD'] },
  'Search terms with clicks but no orders');
  const request = sanitizeReportRequest(args, { profileIds: ['123'] });
  assert.equal(request.category, 'waste');
  assert.deepEqual(request.groupBy, ['search_term']);
  assert.deepEqual(request.adTypes, ['SP']);
  assert.deepEqual(request.filters, [{ field: 'clicks', operator: 'gt', value: 0 }, { field: 'orders', operator: 'eq', value: 0 }]);
  assert.doesNotThrow(() => prepareRequest(request));
});

test('known waste normalization does not replace explicit numbered thresholds', () => {
  const original = { category: 'waste', filters: [{ field: 'clicks', operator: 'gt', value: 50 }] };
  const request = normalizeQuestionReportArguments(original, 'Search terms with over 50 clicks but no orders');
  assert.deepEqual(request.filters, original.filters);
});

test('exact campaign waste request reaches reports even when AI supplies malformed money thresholds', async () => {
  let received;
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [{ id: 'waste', name: 'run_report', arguments: {
      category: 'waste', filters: [{ field: 'spend', operator: 'gt', value: 'a lot' }],
    } }] }) },
    reportService: async request => { received = request; return { category: 'waste', status: 'unavailable' }; },
  });
  const result = await service({ message: 'Campaigns spending a lot but getting few sales', profileIds: ['123'],
    reportContext: { period: { preset: 'last_14_days' } } });
  assert.equal(result.isReport, true);
  assert.deepEqual(received.groupBy, ['campaign']);
  assert.deepEqual(received.filters, []);
});

test('weekday waste keeps outcome metrics and never substitutes spend-only ranking', () => {
  const args = normalizeQuestionReportArguments({ category: 'time', metrics: ['spend'],
    groupBy: ['hour', 'weekday'], sort: { field: 'spend', direction: 'desc' } },
  'Which days of the week waste the most money?');
  const request = sanitizeReportRequest(args, { profileIds: ['123'] });
  assert.equal(request.category, 'time');
  assert.deepEqual(request.groupBy, ['weekday']);
  assert.deepEqual(request.metrics, ['orders', 'spend', 'sales', 'acos']);
  assert.deepEqual(request.sort, { field: 'acos', direction: 'desc' });
  assert.equal(request.presentation, 'heatmap');
});

test('weekday waste stays unavailable without a matching attribution window, before any data read', async () => {
  const { readSpecialReport } = require('../api-server/services/chatbotReporting.special');
  const request = sanitizeReportRequest(normalizeQuestionReportArguments({ category: 'time' },
    'Which days of the week waste the most money?'), { profileIds: ['123'] });
  // No attributionWindows -> hourly 7-day attributed figures can't be aligned, so the
  // request fails preflight (no expensive read) rather than inventing conversion.
  const source = await readSpecialReport({
    db: { collection: () => assert.fail('A mismatched attribution window must fail preflight before data reads') },
    category: 'time', dimension: 'weekday', metrics: request.metrics,
    configId: '507f1f77bcf86cd799439011', profile: { profileId: '123', adTypes: ['SP'], currencyCode: 'INR', timezone: 'Asia/Kolkata' },
    adType: 'SP', period: { fromDate: '2026-10-01', toDate: '2026-10-07', isPartial: false },
  });
  assert.deepEqual(source.rows, []);
  assert.ok(source.missingInputs.some(message => /attribution window/i.test(message)));
});

test('efficient low-impression keyword question asks for a target before AI can invent one', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => assert.fail('Do not let AI invent a target ACOS') },
    reportService: async () => assert.fail('Clarify target before recommending growth'),
  });
  const result = await service({ message: 'Keywords with great ACOS but low impressions', profileIds: ['123'] });
  assert.equal(result.isReport, false);
  assert.match(result.replyMessage, /What target ACOS would you like me to use/);
  assert.match(result.replyMessage, /For example/);
});

test('product profit, TACOS and stock questions cannot be replaced by advertising revenue', () => {
  for (const [question, metric] of [
    ['Which products are profitable after ad spend?', 'profit'],
    ["What's my TACOS by product?", 'tacos'],
    ['Which advertised products are low on stock?', 'stock'],
  ]) {
    const args = normalizeQuestionReportArguments({ category: 'summary', metrics: ['spend', 'sales'],
      groupBy: ['campaign'], sort: { field: 'sales', direction: 'desc' } }, question);
    const request = sanitizeReportRequest(args, { profileIds: ['123'], reportContext: { sort: { field: 'acos', direction: 'desc' } } });
    assert.equal(request.category, 'products', question);
    assert.deepEqual(request.metrics, [metric], question);
    assert.deepEqual(request.groupBy, ['product'], question);
    assert.equal(request.presentation, 'bar', question);
    assert.equal(request.sort, undefined, question);
    assert.doesNotThrow(() => require('../api-server/services/chatbotReporting/reportRequest').prepareRequest(request), question);
  }
});

test('keyword growth uses the supplied target instead of a threshold guessed by AI', () => {
  const args = normalizeQuestionReportArguments({ category: 'growth', groupBy: ['search_term'],
    analysis: { targetAcos: 50 }, filters: [{ field: 'acos', operator: 'lt', value: 50 }] },
  'Keywords with great ACOS but low impressions, target ACOS 20%');
  assert.equal(args.analysis.targetAcos, 20);
  assert.deepEqual(args.groupBy, ['keyword']);
  assert.deepEqual(args.filters, []);
  const noTarget = normalizeQuestionReportArguments({ category: 'growth', analysis: { targetAcos: 50 } },
    'Keywords with great ACOS but low impressions');
  assert.equal(noTarget.analysis.targetAcos, undefined);
});

test('large or timed-out reports offer a shorter range or one campaign without technical errors', async () => {
  for (const code of ['REPORT_QUERY_TIMEOUT', 'REPORT_ROW_LIMIT']) {
    const service = createChatService({ reportService: async () => {
      throw Object.assign(new Error('MongoDB internal timeout detail'), { code, statusCode: 422 });
    } });
    const result = await service({ profileIds: ['123'], followUpRequest: { category: 'waste', groupBy: ['search_term'] } });
    assert.match(result.replyMessage, /shorter date range or select one campaign/);
    assert.doesNotMatch(result.replyMessage, /MongoDB|unsupported|incomplete/);
    assert.equal(result.error.code, code);
  }
});
