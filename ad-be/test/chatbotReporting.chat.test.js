'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createChatService,
  sanitizeReportRequest,
  extractBoundedEvidence,
  isAnalyticsQuestion,
} = require('../api-server/services/chatbotReporting.chat');
const {
  createChatController,
} = require('../api-server/controllers/chatbotReporting.controller');

// Synthetic report fixture matching Step 2 contract
function makeMockReport({
  reportId = 'rep_test_12345',
  status = 'ok',
  category = 'summary',
  spend = 120,
  sales = 1000,
  acos = 12,
  orders = 20,
  cpc = 1.2,
  cvr = 20,
  roas = 8.33333333,
} = {}) {
  return {
    schemaVersion: '1.0',
    reportId,
    category,
    dataOrigin: 'synthetic',
    status,
    scope: {
      configId: '507f1f77bcf86cd799439011',
      profiles: [{
        profileId: '1001',
        timezone: 'America/Los_Angeles',
        currencyCode: 'USD',
        accountType: 'seller',
        adTypes: ['SP'],
        attributionWindows: { SP: 14, SB: 14, SD: 14 },
        supportedDimensions: { SP: ['campaign', 'keyword', 'searchTerm'] },
      }],
      selectedAdTypes: ['SP'],
      currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
    },
    periods: {
      '1001': {
        current: {
          fromDate: '2026-10-19',
          toDate: '2026-10-19',
          startAt: '2026-10-19T07:00:00.000Z',
          endBefore: '2026-10-20T07:00:00.000Z',
          isPartial: false,
        },
        comparison: {
          fromDate: '2026-10-18',
          toDate: '2026-10-18',
          startAt: '2026-10-18T07:00:00.000Z',
          endBefore: '2026-10-19T07:00:00.000Z',
          isPartial: false,
        },
      },
    },
    freshness: {
      status: 'verified',
      dataAsOf: '2026-10-20T00:00:00.000Z',
      sources: ['synthetic_test'],
    },
    text: `Summary for yesterday: Spend $${spend}, Sales $${sales}, ACOS ${acos}%.`,
    cards: [
      { metric: 'spend', label: 'Spend', value: spend, unit: 'currency', status: 'ok', comparison: { previousValue: 100, absoluteChange: 20, relativeChangePercent: 20, percentagePointChange: null, status: 'comparable' } },
      { metric: 'sales', label: 'Sales', value: sales, unit: 'currency', status: 'ok', comparison: { previousValue: 800, absoluteChange: 200, relativeChangePercent: 25, percentagePointChange: null, status: 'comparable' } },
      { metric: 'acos', label: 'ACOS', value: acos, unit: 'percent', status: 'ok', comparison: { previousValue: 12.5, absoluteChange: -0.5, relativeChangePercent: -4, percentagePointChange: -0.5, status: 'comparable' } },
      { metric: 'roas', label: 'ROAS', value: roas, unit: 'multiple', status: 'ok' },
      { metric: 'orders', label: 'Orders', value: orders, unit: 'count', status: 'ok' },
      { metric: 'cpc', label: 'CPC', value: cpc, unit: 'currency', status: 'ok' },
      { metric: 'cvr', label: 'CVR', value: cvr, unit: 'percent', status: 'ok' },
    ],
    datasets: [
      {
        id: 'campaign_breakdown',
        grain: 'campaign',
        rowCount: 2,
        columns: [
          { key: 'campaignName', label: 'Campaign', type: 'string' },
          { key: 'spend', label: 'Spend', type: 'number', unit: 'currency' },
          { key: 'sales', label: 'Sales', type: 'number', unit: 'currency' },
        ],
        rows: [
          { campaignId: 'c1', campaignName: 'Campaign Alpha', spend: 80, sales: 700 },
          { campaignId: 'c2', campaignName: 'Campaign Beta', spend: 40, sales: 300 },
        ],
      },
    ],
    blocks: [
      { type: 'number_card', title: 'Key Metrics', cardKeys: ['spend', 'sales', 'acos', 'roas'] },
    ],
    warnings: [],
    followUps: [
      { label: 'Show keywords', request: { category: 'waste', groupBy: ['keyword'] } },
    ],
  };
}

test('sanitizeReportRequest ensures strict v1.0 parameters and defaults', () => {
  const sanitized = sanitizeReportRequest({
    category: 'summary',
    period: { preset: 'yesterday' },
  }, {
    profileIds: ['1001'],
    currencyCode: 'USD',
  });

  assert.equal(sanitized.schemaVersion, '1.0');
  assert.equal(sanitized.category, 'summary');
  assert.deepEqual(sanitized.profileIds, ['1001']);
  assert.deepEqual(sanitized.adTypes, ['SP']);
  assert.equal(sanitized.period.preset, 'yesterday');
  assert.equal(sanitized.comparison.mode, 'previous_period');
  assert.ok(sanitized.metrics.includes('spend'));
  assert.ok(sanitized.metrics.includes('sales'));
  assert.ok(sanitized.metrics.includes('acos'));
  assert.equal(sanitized.limit, 25);
  assert.equal(sanitized.offset, 0);
});

test('sanitizeReportRequest injects currencyCode into money filters when omitted', () => {
  const sanitized = sanitizeReportRequest({
    category: 'waste',
    filters: [
      { field: 'spend', operator: 'gt', value: 30 },
      { field: 'sales', operator: 'eq', value: 0 },
    ],
  }, {
    profileIds: ['2002'],
    currencyCode: 'INR',
  });

  assert.equal(sanitized.filters[0].field, 'spend');
  assert.equal(sanitized.filters[0].currencyCode, 'INR');
  assert.equal(sanitized.filters[1].field, 'sales');
  assert.equal(sanitized.filters[1].currencyCode, 'INR');
});

test('extractBoundedEvidence caps dataset rows and retains KPI cards', () => {
  const report = makeMockReport();
  const evidence = extractBoundedEvidence(report);

  assert.equal(evidence.status, 'ok');
  assert.equal(evidence.kpiCards.length, 7);
  assert.equal(evidence.kpiCards[0].metric, 'spend');
  assert.equal(evidence.kpiCards[0].value, 120);
  assert.equal(evidence.datasets.length, 1);
  assert.equal(evidence.datasets[0].sampleRows.length, 2);
  assert.equal(evidence.datasets[0].sampleRows[0].campaignName, 'Campaign Alpha');
});

test('isAnalyticsQuestion identifies reporting and metric intents correctly', () => {
  assert.equal(isAnalyticsQuestion('How did yesterday go?'), true);
  assert.equal(isAnalyticsQuestion('Why did my ACOS spike?'), true);
  assert.equal(isAnalyticsQuestion('Where am I wasting ad spend?'), true);
  assert.equal(isAnalyticsQuestion('What is TACOS?'), true);
  assert.equal(isAnalyticsQuestion('How do I reset my account password?'), false);
  assert.equal(isAnalyticsQuestion('Billing question for my invoice'), false);
});

test('executeChatTurn runs complete two-turn flow with Anthropic stub (default)', async () => {
  const turnCalls = [];
  const mockAiProvider = {
    async requestTurn(turn) {
      turnCalls.push(turn);
      if (turnCalls.length === 1) {
        // Turn 1: model decides to call run_report tool
        return {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          text: '',
          toolCalls: [{
            id: 'call_anthropic_1',
            name: 'run_report',
            arguments: {
              category: 'summary',
              period: { preset: 'yesterday' },
              comparison: { mode: 'previous_period' },
            },
          }],
          usage: { inputTokens: 50, outputTokens: 20 },
          continuation: { provider: 'anthropic', messages: ['stub_msg_1'] },
        };
      }
      // Turn 2: model receives toolResults and provides final explanation
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'Yesterday your spend was $120.00 generating $1,000.00 in sales at an ACOS of 12.0%. Performance improved with sales up 25%.',
        toolCalls: [],
        usage: { inputTokens: 120, outputTokens: 45 },
      };
    },
  };

  const reportServiceCalls = [];
  const mockReportService = async (req, auth) => {
    reportServiceCalls.push({ req, auth });
    return makeMockReport();
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: mockReportService,
  });

  const response = await chatService({
    message: 'How did yesterday go?',
    profileIds: ['1001'],
  }, {
    userId: 'user_123',
    configId: 'config_456',
    organizationId: 'org_789',
    currencyCode: 'USD',
  });

  assert.equal(response.isReport, true);
  assert.equal(response.stopConversion, false);
  assert.ok(response.replyMessage.includes('$1,000.00 in sales'));
  assert.equal(response.report.status, 'ok');
  assert.equal(reportServiceCalls.length, 1);
  assert.equal(reportServiceCalls[0].req.category, 'summary');
  assert.deepEqual(reportServiceCalls[0].req.profileIds, ['1001']);
  assert.equal(turnCalls.length, 2);
  assert.equal(turnCalls[1].toolResults[0].toolCallId, 'call_anthropic_1');
  assert.equal(turnCalls[1].toolResults[0].name, 'run_report');
  assert.ok(response.timings.totalDurationMs >= 0);
  assert.equal(response.usage.totalInputTokens, 170);
  assert.equal(response.usage.totalOutputTokens, 65);
});

test('executeChatTurn supports OpenAI provider switching via options', async () => {
  let turnNumber = 0;
  const mockAiProvider = {
    async requestTurn(turn) {
      turnNumber += 1;
      assert.equal(turn.options.provider, 'openai');
      if (turnNumber === 1) {
        return {
          provider: 'openai',
          model: 'gpt-4o',
          text: '',
          toolCalls: [{
            id: 'call_openai_99',
            name: 'run_report',
            arguments: {
              category: 'change',
              period: { preset: 'last_7_days' },
              groupBy: ['campaign'],
            },
          }],
          usage: { inputTokens: 40, outputTokens: 15 },
          continuation: { provider: 'openai', messages: ['stub_openai_msg'] },
        };
      }
      return {
        provider: 'openai',
        model: 'gpt-4o',
        text: 'ACOS increased primarily due to Campaign Beta having lower conversion.',
        toolCalls: [],
        usage: { inputTokens: 90, outputTokens: 30 },
      };
    },
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => makeMockReport({ category: 'change' }),
  });

  const response = await chatService({
    message: 'Why did my ACOS go up?',
    profileIds: ['1001'],
    options: { provider: 'openai' },
    reportContext: { period: { preset: 'last_7_days' } },
  }, {
    userId: 'user_123',
    configId: 'config_456',
    organizationId: 'org_789',
  });

  assert.equal(response.isReport, true);
  assert.ok(response.replyMessage.includes('ACOS increased'));
  assert.equal(response.report.category, 'change');
});

test('executeChatTurn supports Gemini provider switching via options', async () => {
  let turnNumber = 0;
  const mockAiProvider = {
    async requestTurn(turn) {
      turnNumber += 1;
      assert.equal(turn.options.provider, 'gemini');
      if (turnNumber === 1) {
        return {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          text: '',
          toolCalls: [{
            id: 'call_gemini_55',
            name: 'run_report',
            arguments: {
              category: 'waste',
              groupBy: ['keyword'],
            },
          }],
          usage: { inputTokens: 35, outputTokens: 10 },
          continuation: { provider: 'gemini' },
        };
      }
      return {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        text: 'Found 2 keywords with spend over $30 and zero sales.',
        toolCalls: [],
        usage: { inputTokens: 80, outputTokens: 25 },
      };
    },
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => makeMockReport({ category: 'waste' }),
  });

  const response = await chatService({
    message: 'Where am I wasting money on keywords?',
    profileIds: ['1001'],
    options: { provider: 'gemini' },
    reportContext: { period: { preset: 'last_7_days' } },
  }, {
    userId: 'user_123',
    configId: 'config_456',
    organizationId: 'org_789',
  });

  assert.equal(response.isReport, true);
  // This stub explanation invents a $30 threshold and zero-sales keywords;
  // neither exists in the supplied campaign report. Keep the safe report text.
  assert.equal(response.replyMessage, response.report.text);
  assert.equal(response.replyMessage.includes('Found 2 keywords'), false);
  assert.equal(response.report.category, 'waste');
});

test('executeChatTurn handles non-reporting general chat without tool call', async () => {
  const mockAiProvider = {
    async requestTurn() {
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'Hello! I am your AdvertiseIQ advertising assistant. How can I help you today?',
        toolCalls: [],
        usage: { inputTokens: 25, outputTokens: 20 },
      };
    },
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => assert.fail('Should not be called'),
  });

  const response = await chatService({
    message: 'Hello!',
  }, {
    userId: 'user_123',
    configId: 'config_456',
    organizationId: 'org_789',
  });

  assert.equal(response.isReport, false);
  assert.equal(response.report, null);
  assert.ok(response.replyMessage.includes('Hello! I am your AdvertiseIQ'));
});

test('executeChatTurn routes high-confidence non-analytics FAQ directly', async () => {
  const mockFaqService = async (msg) => {
    if (msg.includes('invoice')) {
      return {
        question: 'How do I download my invoice?',
        answer: 'You can download invoices in Account Settings > Billing.',
        matchPercentage: 90,
      };
    }
    return null;
  };

  const chatService = createChatService({
    aiProvider: { requestTurn: async () => assert.fail('AI should not be called for matched FAQ') },
    reportService: async () => assert.fail('Report should not be called for FAQ'),
    faqService: mockFaqService,
  });

  const response = await chatService({
    message: 'How do I download my invoice?',
  }, {
    userId: 'user_123',
    configId: 'config_456',
    organizationId: 'org_789',
  });

  assert.equal(response.isReport, false);
  assert.ok(response.replyMessage.includes('Billing'));
  assert.equal(response.faqMatch.matchPercentage, 90);
});

test('executeChatTurn handles report permission denial (403) gracefully', async () => {
  const mockAiProvider = {
    async requestTurn() {
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: '',
        toolCalls: [{
          id: 'call_1',
          name: 'run_report',
          arguments: { category: 'summary' },
        }],
      };
    },
  };

  const mockReportService = async () => {
    const error = new Error('Access denied to requested profile');
    error.statusCode = 403;
    error.code = 'REPORT_ACCESS_DENIED';
    throw error;
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: mockReportService,
  });

  const response = await chatService({
    message: 'How did yesterday go?',
    profileIds: ['9999'],
  }, {
    userId: 'user_123',
    configId: 'config_456',
    organizationId: 'org_789',
  });

  assert.equal(response.isReport, false);
  assert.equal(response.error.statusCode, 403);
  assert.ok(response.replyMessage.includes('do not have permission'));
});

test('executeChatTurn handles AI credentials missing error cleanly', async () => {
  const mockAiProvider = {
    async requestTurn() {
      const error = new Error('ANTHROPIC_API_KEY is not configured on the server');
      error.code = 'AI_CREDENTIALS_MISSING';
      error.statusCode = 502;
      throw error;
    },
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => makeMockReport(),
  });

  const response = await chatService({
    message: 'How did yesterday go?',
  }, {
    userId: 'user_123',
  });

  assert.equal(response.isReport, false);
  assert.equal(response.error.code, 'AI_CREDENTIALS_MISSING');
  assert.ok(response.replyMessage.includes('ANTHROPIC_API_KEY'));
});

test('createChatController processes HTTP request and responds with status 200', async () => {
  const mockChatService = async (body, auth) => {
    assert.equal(body.message, 'How did yesterday go?');
    assert.equal(auth.userId, 'user_abc');
    return {
      replyMessage: 'Yesterday went great!',
      report: makeMockReport(),
      isReport: true,
      stopConversion: false,
    };
  };

  const controller = createChatController({ chatService: mockChatService });

  let statusCode = 0;
  let jsonResult = null;
  const mockReq = {
    body: { message: 'How did yesterday go?' },
    user: { _id: 'user_abc' },
    config: { configId: 'config_def' },
    organizationId: 'org_ghi',
  };
  const mockRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResult = data;
      return this;
    },
  };

  await controller(mockReq, mockRes);

  assert.equal(statusCode, 200);
  assert.equal(jsonResult.isSuccess, true);
  assert.equal(jsonResult.isReport, true);
  assert.equal(jsonResult.replyMessage, 'Yesterday went great!');
  assert.ok(jsonResult.report);
});

test('Step 8: executeChatTurn executes structured follow-up bypass directly without calling AI', async () => {
  let aiCalled = false;
  const mockAiProvider = {
    async requestTurn() {
      aiCalled = true;
      throw new Error('AI should not be called for structured followUpRequest');
    },
  };

  let executedRequest = null;
  const mockReportService = async (req) => {
    executedRequest = req;
    return makeMockReport({ category: 'change', reportId: 'rep_followup_123' });
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: mockReportService,
  });

  const response = await chatService({
    followUpRequest: {
      category: 'change',
      groupBy: ['campaign'],
    },
    reportContext: {
      category: 'summary',
      profileIds: ['1001'],
      period: { preset: 'last_7_days' },
      adTypes: ['SP'],
    },
  }, {
    userId: 'user_123',
    profileIds: ['1001'],
  });

  assert.equal(aiCalled, false, 'AI Turn 1 must NOT be called for structured followUpRequest');
  assert.equal(response.isReport, true);
  assert.equal(response.isDirectFollowUp, true);
  assert.equal(response.report.reportId, 'rep_followup_123');
  assert.equal(executedRequest.category, 'change');
  assert.deepEqual(executedRequest.groupBy, ['campaign']);
  assert.deepEqual(executedRequest.profileIds, ['1001']);
  assert.deepEqual(executedRequest.period, { preset: 'last_7_days' });
});

test('Step 8: executeChatTurn injects reportContext into instructions for natural language follow-up', async () => {
  let receivedInstructions = '';
  const mockAiProvider = {
    async requestTurn(turn) {
      receivedInstructions = turn.instructions;
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'Report updated for last week.',
        toolCalls: [{
          id: 'call_followup_nl',
          name: 'run_report',
          arguments: {
            category: 'summary',
            period: { preset: 'last_week' },
          },
        }],
        usage: { inputTokens: 50, outputTokens: 20 },
      };
    },
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => makeMockReport({ category: 'summary' }),
  });

  await chatService({
    message: 'same report last week',
    reportContext: {
      category: 'summary',
      profileIds: ['1001'],
      period: { preset: 'last_7_days' },
      adTypes: ['SP'],
      groupBy: [],
    },
  }, {
    userId: 'user_123',
    profileIds: ['1001'],
  });

  assert.ok(receivedInstructions.includes('CURRENT REPORT SESSION CONTEXT'), 'instructions must include session context');
  assert.ok(receivedInstructions.includes('"1001"'), 'instructions must include active profiles');
  assert.ok(receivedInstructions.includes('"last_7_days"'), 'instructions must include previous period');
});

test('Step 8: executeChatTurn structured follow-up handles access denial (403) safely', async () => {
  const deniedError = new Error('Permission denied for profile');
  deniedError.statusCode = 403;
  deniedError.code = 'REPORT_ACCESS_DENIED';

  const mockReportService = async () => {
    throw deniedError;
  };

  const chatService = createChatService({
    reportService: mockReportService,
  });

  const response = await chatService({
    followUpRequest: {
      category: 'rules',
      profileIds: ['9999'],
    },
  }, {
    userId: 'user_unauthorized',
    profileIds: ['9999'],
  });

  assert.equal(response.isReport, false);
  assert.equal(response.error.statusCode, 403);
  assert.ok(response.replyMessage.includes('permission'));
});

test('sanitizeReportRequest prunes SD when placement, keyword, or search_term is requested', () => {
  const sanitizedPlacement = sanitizeReportRequest({
    category: 'summary',
    groupBy: ['placement'],
    adTypes: ['SP', 'SB', 'SD'],
    presentation: 'donut',
  }, { profileIds: ['1001'] });

  assert.deepEqual(sanitizedPlacement.adTypes, ['SP', 'SB']);
  assert.equal(sanitizedPlacement.presentation, 'donut');
  assert.deepEqual(sanitizedPlacement.groupBy, ['placement']);

  const sanitizedKeyword = sanitizeReportRequest({
    category: 'waste',
    groupBy: ['keyword'],
    adTypes: ['SD'],
  }, { profileIds: ['1001'] });

  assert.deepEqual(sanitizedKeyword.adTypes, ['SP']);
});


test('executeChatTurn answers capabilities, project purpose and profile questions even with active reportContext', async () => {
  let capturedInstructions;
  const mockAiProvider = {
    async requestTurn({ instructions }) {
      capturedInstructions = instructions;
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'I can help you monitor and optimize your Amazon advertising campaigns for Tagdo across Sponsored Products.',
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 40 },
      };
    },
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => assert.fail('Should not call report tool for general questions'),
  });

  const res1 = await chatService({
    message: 'what can you do?',
    profileIds: ['2630925322373862'],
    reportContext: { category: 'time', profileIds: ['2630925322373862'] },
  }, {
    userId: 'user_123',
    configId: 'config_456',
    activeProfile: { profileId: '2630925322373862', name: 'Tagdo', currencyCode: 'INR', timezone: 'Asia/Kolkata', countryCode: 'IN' },
  });

  assert.equal(res1.isReport, false);
  assert.equal(res1.report, null);
  assert.ok(res1.replyMessage.includes('Tagdo'));
  assert.doesNotMatch(res1.replyMessage, /could not verify reporting data/);
  assert.ok(capturedInstructions.includes('Tagdo'));
  assert.ok(capturedInstructions.includes('INR'));

  const res2 = await chatService({
    message: 'what is this project is use for?',
    profileIds: ['2630925322373862'],
    reportContext: { category: 'time' },
  }, {
    userId: 'user_123',
    configId: 'config_456',
    activeProfile: { profileId: '2630925322373862', name: 'Tagdo', currencyCode: 'INR' },
  });

  assert.equal(res2.isReport, false);
  assert.doesNotMatch(res2.replyMessage, /could not verify reporting data/);
});
