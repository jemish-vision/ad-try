'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createChatService,
  sanitizeReportRequest,
  extractBoundedEvidence,
  isAnalyticsQuestion,
  RUN_REPORT_TOOL,
  supportedExplanationNumbers,
  isReadableGroundedExplanation,
  SYSTEM_PROMPT,
} = require('../api-server/services/chatbotReporting.chat');
const { prepareRequest } = require('../api-server/services/chatbotReporting/reportRequest');

test('all original reporting questions route to analytics rather than support tickets', () => {
  const questions = [
    'How did yesterday go?', 'Summarize this week vs last week',
    'How are my 5 profiles doing compared to each other?', 'Why did my ACOS go up yesterday?',
    'Why did sales drop this week?', 'Keywords that spent over $30 with no sales in 14 days',
    'Search terms with clicks but no orders', 'Which placements have the worst ACOS?',
    'Campaigns spending a lot but getting few sales', 'Search terms that convert well but aren’t keywords yet',
    'Campaigns that run out of budget before the day ends', 'Keywords with great ACOS but low impressions',
    'Which hours of the day have the best conversion?', 'Which days of the week waste the most money?',
    'Which products are profitable after ad spend?', 'What’s my TACOS by product?',
    'Which advertised products are low on stock?', 'What did my rules change this week?',
    'Did performance improve after my bid rule started?', 'Anything unusual in my account today?',
    'What does TACOS mean?', 'Is 35% ACOS good for my category?',
  ];

  for (const question of questions) {
    assert.equal(isAnalyticsQuestion(question), true, question);
  }

  assert.equal(isAnalyticsQuestion('How can I change my password?'), false);
});

test('TACOS glossary ignores active account filters and retains requested definition', () => {
  const request = sanitizeReportRequest({ category: 'definition', metrics: ['tacos'] }, {
    profileIds: ['123'], reportContext: { period: { preset: 'yesterday' }, filters: [] },
  });
  assert.deepEqual(request.metrics, ['tacos']);
  assert.deepEqual(request.profileIds, []);
  assert.doesNotThrow(() => prepareRequest(request));
});

test('tool and request preserve entity drill-down, sort and pagination', () => {
  const entity = { dimension: 'campaign', ids: ['campaign_a'] };
  const sort = { field: 'spend', direction: 'desc' };
  const request = sanitizeReportRequest({ category: 'change', entity, sort, offset: 25 }, { profileIds: ['123'] });
  assert.deepEqual(request.entity, entity);
  assert.deepEqual(request.sort, sort);
  assert.equal(request.offset, 25);

  for (const field of ['entity', 'sort', 'offset']) {
    assert.ok(RUN_REPORT_TOOL.parameters.properties[field]);
  }
});

test('session presets discard resolved date bounds and retain custom bounds', () => {
  const request = sanitizeReportRequest({ category: 'summary' }, { profileIds: ['123'], reportContext: {
    period: { preset: 'last_7_days', fromDate: '2026-10-01', toDate: '2026-10-07' },
    comparison: { mode: 'previous_period', fromDate: '2026-09-24', toDate: '2026-09-30' },
  } });
  assert.deepEqual(request.period, { preset: 'last_7_days' });
  assert.deepEqual(request.comparison, { mode: 'previous_period' });
});

test('unknown money filter currencies and malformed tool arguments fail closed', () => {
  assert.throws(() => sanitizeReportRequest({ category: 'waste', filters: [
    { field: 'spend', operator: 'gt', value: 30 },
  ] }, { profileIds: ['123'] }), error => error.code === 'INVALID_REPORT_REQUEST');
  assert.throws(() => sanitizeReportRequest(null), error => error.code === 'INVALID_REPORT_REQUEST');
  assert.throws(() => sanitizeReportRequest({ category: 'invented' }), error => error.code === 'INVALID_REPORT_REQUEST');
});

test('waste and growth retain the requested reporting period without reading unresolved dimensions', () => {
  for (const category of ['waste', 'growth']) {
    for (const preset of ['last_14_days', 'last_30_days']) {
      for (const dimension of ['keyword', 'search_term']) {
        const request = sanitizeReportRequest({
          category,
          period: { preset },
          groupBy: [dimension],
          adTypes: ['SP', 'SB'],
        }, { profileIds: ['123'] });

        assert.deepEqual(request.period, { preset });
        assert.deepEqual(request.groupBy, [dimension]);
        assert.deepEqual(request.adTypes, ['SP', 'SB']);
      }
    }
  }
});

test('time requests retain explicit periods and conversion metrics', () => {
  const request = sanitizeReportRequest({
    category: 'time',
    period: { preset: 'last_14_days' },
    metrics: ['cvr', 'orders', 'clicks'],
    groupBy: ['hour', 'weekday'],
    sort: { field: 'cvr', direction: 'desc' },
  }, { profileIds: ['123'] });

  assert.deepEqual(request.period, { preset: 'last_14_days' });
  assert.deepEqual(request.metrics, ['cvr', 'orders', 'clicks']);
  assert.deepEqual(request.sort, { field: 'cvr', direction: 'desc' });
});

test('category instructions preserve explicit question intent instead of forcing canned reports', () => {
  assert.match(SYSTEM_PROMPT, /explicit dates, entity, metrics, filters and currency take precedence/);
  assert.match(SYSTEM_PROMPT, /ask for profile names or ask the user to select profiles in the portal/);
  assert.match(SYSTEM_PROMPT, /Never ask users for technical profile IDs/);
  assert.match(SYSTEM_PROMPT, /do not name a main driver, leading cause or reason for the change/);
  assert.match(SYSTEM_PROMPT, /best conversion questions, request metrics=\["cvr", "orders", "clicks"\]/);
  assert.match(SYSTEM_PROMPT, /Budget exhaustion questions use groupBy=\["campaign"\]/);
  assert.match(SYSTEM_PROMPT, /placements use \["placement"\]/);
  assert.match(SYSTEM_PROMPT, /currencyCode="USD"/);
  assert.match(SYSTEM_PROMPT, /Put the metric being explained FIRST/);
  assert.match(SYSTEM_PROMPT, /For unusual-change questions[^\n]*comparison=\{"mode":"previous_period"\}/);
  assert.match(SYSTEM_PROMPT, /profit for profitability, tacos for TACOS including organic sales, and stock for low inventory/);
  assert.doesNotMatch(SYSTEM_PROMPT, /For time analysis[^\n]*metrics=\["spend", "clicks", "impressions", "sales"\]/);
});

test('evidence preserves actual v1 percentage changes, currency, scope and grouping', () => {
  const evidence = extractBoundedEvidence({ status: 'partial',
    scope: { profiles: [{ profileId: '123', currencyCode: 'INR' }] },
    freshness: { status: 'partial', missingInputs: ['coverage'] },
    cards: [{ title: '123 SP spend', metric: 'spend', currencyCode: 'INR', value: 10, comparison: {
      previousValue: 5, absoluteChange: 5, relativeChangePercent: 100, percentagePointChange: null, status: 'comparable',
    } }],
    datasets: [{ id: 'ds', currencyCode: 'INR', columns: [{ key: 'profileId', type: 'string' }],
      rows: [{ profileId: '123', spend: 10 }], page: { total: 1 } }],
    blocks: [{ datasetId: 'ds', title: 'Profile totals' }],
  });
  assert.equal(evidence.kpiCards[0].comparison.relativeChangePercent, 100);
  assert.equal(evidence.kpiCards[0].currencyCode, 'INR');
  assert.equal(evidence.kpiCards[0].title, '123 SP spend');
  assert.equal(evidence.datasets[0].title, 'Profile totals');
  assert.equal(evidence.datasets[0].groupedRowCount, 1);
  assert.match(evidence.interpretation, /not entity counts/);
});

test('analytics without a reporting tool cannot return invented advertising figures', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ text: 'Spend was 99999.', toolCalls: [] }) },
    reportService: async () => assert.fail('There was no report tool call'),
  });
  const result = await service({ message: 'How much did I spend yesterday?', profileIds: ['123'] });
  assert.equal(result.isReport, false);
  assert.doesNotMatch(result.replyMessage, /99999/);
  assert.match(result.replyMessage, /could not verify/);
});

test('AI outage uses deterministic known summary and authenticated scope', async () => {
  let request;
  let receivedAuth;
  const auth = { userId: 'user', configId: 'config' };
  const service = createChatService({
    aiProvider: { requestTurn: async () => { throw Error('SENSITIVE_SENTINEL'); } },
    reportService: async (input, context) => {
      request = input;
      receivedAuth = context;
      return { text: 'Verified report result', status: 'partial' };
    },
  });
  const result = await service({ message: 'How did yesterday go?', profileIds: ['123'] }, auth);
  assert.equal(result.isReport, true);
  assert.equal(request.period.preset, 'yesterday');
  assert.deepEqual(request.profileIds, ['123']);
  assert.equal(receivedAuth, auth);
  assert.doesNotMatch(result.replyMessage, /SENSITIVE_SENTINEL/);
});

test('AI outage on ambiguous questions gives safe availability message', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => { throw Error('SENSITIVE_SENTINEL'); } },
    reportService: async () => assert.fail('Ambiguous intent must not be guessed'),
  });
  const result = await service({ message: 'Tell me which campaign needs help', profileIds: ['123'] });
  assert.equal(result.isReport, false);
  assert.doesNotMatch(result.replyMessage, /SENSITIVE_SENTINEL/);
});

test('client options cannot override server credentials, model or resource limits', async () => {
  let options;
  const service = createChatService({
    aiProvider: { requestTurn: async input => { options = input.options; return { text: 'Hello', toolCalls: [] }; } },
  });
  await service({ message: 'Hello', options: { provider: 'openai', apiKey: 'CLIENT_KEY', model: 'expensive', maxTokens: 999999, timeoutMs: 999999 } });
  assert.deepEqual(options, { provider: 'openai' });
});

test('malformed report tool calls return controlled validation errors', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [{ name: 'run_report', id: 'id', arguments: null }] }) },
    reportService: async () => assert.fail('Malformed tool arguments must be rejected before reading'),
  });
  const result = await service({ message: 'Show spend', profileIds: ['123'] });
  assert.equal(result.error.statusCode, 400);
  assert.equal(result.error.code, 'INVALID_REPORT_REQUEST');
});

test('currency mismatch asks for an account-currency threshold without converting dollars', async () => {
  const service = createChatService({
    reportService: async () => {
      throw Object.assign(new Error('internal detail'), {
        code: 'REPORT_CURRENCY_MISMATCH', statusCode: 400, currencyCode: 'INR',
      });
    },
  });
  const result = await service({
    profileIds: ['123'],
    followUpRequest: { category: 'waste', groupBy: ['keyword'] },
  });

  assert.match(result.replyMessage, /profile reports in INR/);
  assert.match(result.replyMessage, /What spending threshold would you like to use in INR/);
  assert.match(result.replyMessage, /cannot convert a dollar amount/);
  assert.doesNotMatch(result.replyMessage, /internal detail/);
  assert.equal(result.error.code, 'REPORT_CURRENCY_MISMATCH');
});

test('grounding accepts supported rounded currency, percentages, dates and counts', () => {
  const report = {
    cards: [
      { unit: 'currency', value: 1234.567, comparison: { previousValue: 1000, relativeChangePercent: 23.4567 } },
      { unit: 'percent', value: 12.3456 },
    ],
    periods: [{ current: { fromDate: '2026-10-19' } }],
    scope: { profiles: [{ profileId: '123456789', currencyCode: 'INR' }] },
    datasets: [{ columns: [{ key: 'orders', unit: 'count' }], rows: [{ orders: 7 }], page: { total: 1 } }],
  };
  assert.equal(supportedExplanationNumbers('On 2026-10-19 spend was ₹1,234.57 and ACOS was 12.35%; 7 orders were recorded.', report), true);
  assert.equal(supportedExplanationNumbers('Spend was ₹3.00.', report), false);
  assert.equal(supportedExplanationNumbers('ACOS was 0.20%.', report), false);
  assert.equal(supportedExplanationNumbers('Spend was ₹999999.', report), false);
  assert.equal(isReadableGroundedExplanation('Profile 123456789 spent ₹1,234.57.', report), false);
  assert.equal(isReadableGroundedExplanation('There is one campaign.', report), false);
});

test('invented final AI numbers fall back to readable deterministic report text', async () => {
  let turns = 0;
  const report = { text: '123456789/SP: Reporting is incomplete.',
    scope: { profiles: [{ profileId: '123456789' }] },
    cards: [{ metric: 'spend', unit: 'currency', value: 100 }], datasets: [],
  };
  const service = createChatService({
    aiProvider: { requestTurn: async () => ++turns === 1
      ? { toolCalls: [{ id: 'call_1', name: 'run_report', arguments: { category: 'summary' } }] }
      : { text: 'Spend was $999999.', toolCalls: [] } },
    reportService: async () => report,
  });
  const result = await service({ message: 'How did yesterday go?', profileIds: ['123456789'] });
  assert.equal(result.isReport, true);
  assert.equal(result.replyMessage, 'Selected profile/SP: Reporting is incomplete.');
  assert.equal(result.replyMessage.includes('999999'), false);
});

test('multiple simultaneous AI tool calls request clarification without partial execution', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [
      { id: 'a', name: 'run_report', arguments: { category: 'summary' } },
      { id: 'b', name: 'run_report', arguments: { category: 'waste' } },
    ] }) },
    reportService: async () => assert.fail('Do not partially execute parallel report tool calls'),
  });
  const result = await service({ message: 'Show spend and waste', profileIds: ['123'] });
  assert.equal(result.isReport, false);
  assert.match(result.replyMessage, /one report at a time/);
});

test('obvious glossary questions use exact approved metrics without calling AI', async () => {
  const cases = [
    ['What does TACOS mean?', ['tacos']],
    ['What is TACOS?', ['tacos']],
    ['Define ACOS', ['acos']],
    ['What is ROAS?', ['roas']],
    ['Explain cost per click', ['cpc']],
    ['What does total advertising cost of sales mean?', ['tacos']],
  ];

  for (const [message, expectedMetrics] of cases) {
    const auth = { userId: 'user', configId: 'config' };
    const service = createChatService({
      aiProvider: { requestTurn: async () => assert.fail('Approved definitions must bypass AI') },
      reportService: async (request, receivedAuth) => {
        assert.equal(request.category, 'definition');
        assert.deepEqual(request.metrics, expectedMetrics);
        assert.deepEqual(request.profileIds, []);
        assert.equal(receivedAuth, auth);
        return { category: 'definition', text: 'Approved metric explanation', cards: [], datasets: [] };
      },
    });
    const result = await service({ message, profileIds: ['123'], reportContext: { category: 'summary', profileIds: ['123'] } }, auth);
    assert.equal(result.isReport, true);
    assert.equal(result.replyMessage, 'Approved metric explanation');
  }
});

test('"is X% ACOS good" gets a tailored judgment answer, not a bare definition', async () => {
  const service = createChatService({
    aiProvider: { requestTurn: async () => assert.fail('Judgment answer must not call AI') },
    reportService: async () => assert.fail('Judgment answer must not run a report'),
  });
  const result = await service({ message: 'Is 35% ACOS good for my category?', profileIds: ['123'] }, { userId: 'user', configId: 'config' });
  assert.equal(result.isReport, false);
  assert.match(result.replyMessage, /35/);
  assert.match(result.replyMessage, /break-even|margin/i);
  assert.match(result.replyMessage, /no.*benchmark|not a category benchmark/i);
});

test('numeric TACOS account questions continue through reporting intent selection', async () => {
  let called = false;
  const service = createChatService({
    aiProvider: { requestTurn: async () => { called = true; return { text: 'Please specify a date range', toolCalls: [] }; } },
    reportService: async () => assert.fail('No approved definition was requested'),
  });
  await service({ message: 'What is my TACOS by product this week?', profileIds: ['123'] });
  assert.equal(called, true);
});
