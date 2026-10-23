'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createChatService,
  isAnalyticsQuestion,
} = require('../api-server/services/chatbotReporting.chat');
const {
  CATEGORIES,
} = require('../api-server/contracts/chatbotReporting.contract');

function makeMockReport({ category = 'summary', reportId = 'rep_round2_1' } = {}) {
  return {
    schemaVersion: '1.0',
    reportId,
    category,
    dataOrigin: 'synthetic',
    status: 'ok',
    scope: {
      configId: '507f1f77bcf86cd799439011',
      profiles: [{
        profileId: '1001',
        timezone: 'America/Los_Angeles',
        currencyCode: 'USD',
        accountType: 'seller',
        adTypes: ['SP'],
        attributionWindows: { SP: 7 },
        supportedDimensions: { SP: ['campaign', 'keyword', 'placement'] },
      }],
      currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
      adTypes: ['SP'],
    },
    periods: [{
      profileId: '1001',
      timezone: 'America/Los_Angeles',
      current: { fromDate: '2026-10-14', toDate: '2026-10-20' },
      comparison: { fromDate: '2026-10-07', toDate: '2026-10-13' },
    }],
    freshness: {
      status: 'complete',
      dataAsOf: '2026-10-21T06:00:00Z',
      sourceRefs: [{ name: 'daily_sp_report' }],
      missingInputs: [],
    },
    text: `Verified ${category} report for the requested period.`,
    cards: [
      { id: 'card_spend', metric: 'spend', label: 'Spend', value: 120, unit: 'currency', status: 'available' },
      { id: 'card_sales', metric: 'sales', label: 'Sales', value: 600, unit: 'currency', status: 'available' },
    ],
    datasets: [{
      id: 'ds_main',
      grain: 'campaign',
      columns: [{ key: 'name', label: 'Campaign' }, { key: 'spend', label: 'Spend' }],
      rows: [{ name: 'Campaign Alpha', spend: 120 }],
    }],
    blocks: [{ type: 'text', text: `Verified ${category} report.` }],
    warnings: [],
    followUps: [{ label: 'Break down by campaign', request: { schemaVersion: '1.0', category: 'change', profileIds: ['1001'], period: { preset: 'last_7_days' }, groupBy: ['campaign'], metrics: ['spend', 'sales'] } }],
  };
}

test('Round 2: isAnalyticsQuestion accurately identifies all 9 reporting categories and variations', () => {
  const analyticsQueries = [
    // 1. Performance
    'How am I doing?',
    'How did yesterday go?',
    'Show me spend and sales for last 7 days',
    'What was my total performance last week?',
    // 2. Root cause / Change
    'Why did my ACOS go up?',
    'Why did sales drop yesterday?',
    'What caused the spike in CPC?',
    // 3. Waste
    'Where am I wasting money?',
    'Show keywords with high spend and no orders',
    'Which placements are wasting budget?',
    // 4. Growth
    'Where can I grow?',
    'Which search terms should I harvest as keywords?',
    'Find growth opportunities in my campaigns',
    // 5. Time
    'When do my ads work best?',
    'Show best hours for dayparting',
    // 6. ASIN / Products
    'Which products are profitable?',
    'Show TACOS by product',
    // 7. Rules
    'Are my rules working?',
    'Show rule history for yesterday',
    // 8. Anomalies
    'Anything unusual in my campaigns?',
    'Any unusual drops or spikes?',
    // 9. Definitions
    'Explain ACOS and ROAS',
    'What is TACOS?',
    'Define CPC and CVR',
    // Follow-ups
    'show campaigns',
    'show keywords',
    'break down by placement',
    'same report last week',
    'what about yesterday?',
  ];

  for (const query of analyticsQueries) {
    assert.equal(isAnalyticsQuestion(query), true, `Query "${query}" should be recognized as analytics`);
  }

  // Non-analytics queries
  const nonAnalyticsQueries = [
    'How do I reset my password?',
    'Can I update my billing credit card?',
    'Hello there!',
    'Thank you so much',
  ];

  for (const query of nonAnalyticsQueries) {
    assert.equal(isAnalyticsQuestion(query), false, `Query "${query}" should NOT be recognized as analytics`);
  }
});

test('Round 2: exercises all 9 approved categories through the chat service', async () => {
  const categoryScenarios = [
    { question: 'How did yesterday go?', expectedCategory: 'summary' },
    { question: 'Why did my ACOS go up?', expectedCategory: 'change' },
    { question: 'Where am I wasting money on keywords?', expectedCategory: 'waste' },
    { question: 'Where can I grow with search terms?', expectedCategory: 'growth' },
    { question: 'When do my ads work best?', expectedCategory: 'time' },
    { question: 'Which products are profitable?', expectedCategory: 'products' },
    { question: 'Are my rules working?', expectedCategory: 'rules' },
    { question: 'Anything unusual in CPC or spend?', expectedCategory: 'unusual' },
    { question: 'What is ACOS?', expectedCategory: 'definition' },
  ];

  for (const scenario of categoryScenarios) {
    let toolCallReceived = null;
    const mockAiProvider = {
      async requestTurn(turn) {
        if (!turn.toolResults) {
          // Turn 1
          return {
            provider: 'anthropic',
            model: 'claude-haiku-5-5',
            text: '',
            toolCalls: [{
              id: `call_${scenario.expectedCategory}`,
              name: 'run_report',
              arguments: {
                category: scenario.expectedCategory,
                period: scenario.expectedCategory === 'definition' ? undefined : { preset: 'last_7_days' },
              },
            }],
            usage: { inputTokens: 40, outputTokens: 15 },
          };
        }
        // Turn 2
        return {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          text: `Verified explanation for ${scenario.expectedCategory}.`,
          toolCalls: [],
          usage: { inputTokens: 80, outputTokens: 25 },
        };
      },
    };

    const mockReportService = async (req) => {
      toolCallReceived = req;
      return makeMockReport({ category: scenario.expectedCategory });
    };

    const chatService = createChatService({
      aiProvider: mockAiProvider,
      reportService: mockReportService,
    });

    const response = await chatService({
      message: scenario.question,
      profileIds: ['1001'],
      reportContext: { period: { preset: 'last_7_days' } },
    }, {
      userId: 'user_123',
      profileIds: ['1001'],
    });

    assert.equal(response.isReport, true);
    assert.equal(response.report.category, scenario.expectedCategory);
    assert.equal(toolCallReceived.category, scenario.expectedCategory);
    assert.ok(response.replyMessage.includes(scenario.expectedCategory));
  }
});

test('Round 2: unsupported questions explain limitations politely and do not create tickets', async () => {
  const unsupportedScenarios = [
    {
      question: 'Can you predict my sales for next quarter?',
      aiExplanation: 'AdvertiseIQ provides verified historical performance reporting and root-cause analysis based on actual account data. Future predictive forecasting is not supported.',
    },
    {
      question: 'Please automatically increase all my bids by $3 right now.',
      aiExplanation: 'I am a read-only reporting assistant. Automated bid modifications without human review and approval are not permitted.',
    },
    {
      question: 'How much are my competitors spending on Sponsored Products?',
      aiExplanation: 'I can only access verified performance data for your authorized Amazon advertising accounts. Competitor private spend data is not available.',
    },
  ];

  for (const scenario of unsupportedScenarios) {
    const mockAiProvider = {
      async requestTurn() {
        return {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          text: scenario.aiExplanation,
          toolCalls: [], // No report tool called
          usage: { inputTokens: 30, outputTokens: 25 },
        };
      },
    };

    const chatService = createChatService({
      aiProvider: mockAiProvider,
      reportService: async () => assert.fail('Report service should not be called'),
    });

    const response = await chatService({
      message: scenario.question,
      profileIds: ['1001'],
    }, {
      userId: 'user_123',
    });

    assert.equal(response.isReport, false, 'Unsupported queries must not return fake reports');
    assert.equal(response.stopConversion, false, 'Unsupported queries must NOT trigger support ticket fallback');
    assert.equal(response.replyMessage, scenario.aiExplanation);
  }
});

test('Round 2: natural language follow-up preserves session context and modifies requested dimension', async () => {
  let capturedInstructions = '';
  let capturedArgs = null;

  const mockAiProvider = {
    async requestTurn(turn) {
      if (!turn.toolResults) {
        capturedInstructions = turn.instructions;
        return {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          text: '',
          toolCalls: [{
            id: 'call_followup_nl_1',
            name: 'run_report',
            arguments: {
              category: 'change',
              groupBy: ['campaign'],
            },
          }],
          usage: { inputTokens: 50, outputTokens: 20 },
        };
      }
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'Here is your campaign breakdown for last week.',
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 25 },
      };
    },
  };

  const mockReportService = async (req) => {
    capturedArgs = req;
    return makeMockReport({ category: 'change' });
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: mockReportService,
  });

  const response = await chatService({
    message: 'show campaigns',
    reportContext: {
      category: 'summary',
      profileIds: ['1001'],
      period: { preset: 'last_week' },
      adTypes: ['SP'],
      groupBy: [],
    },
    profileIds: ['1001'],
  }, {
    userId: 'user_123',
    profileIds: ['1001'],
  });

  assert.equal(response.isReport, true);
  assert.ok(capturedInstructions.includes('CURRENT REPORT SESSION CONTEXT'));
  assert.equal(capturedArgs.category, 'change');
  assert.deepEqual(capturedArgs.groupBy, ['campaign']);
  // Baseline period preset from reportContext preserved
  assert.equal(capturedArgs.period.preset, 'last_week');
});
