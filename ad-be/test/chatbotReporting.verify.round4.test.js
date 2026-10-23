'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createChatService,
  extractBoundedEvidence,
} = require('../api-server/services/chatbotReporting.chat');
const {
  validateReportResponse,
} = require('../api-server/contracts/chatbotReporting.contract');

const fixtures = require('../../R-AdvertiseIQ/src/helper/chatbot/fixtures/reporting.v1.json');

function makeLargeReport(rowCount = 100) {
  const base = JSON.parse(JSON.stringify(fixtures.scenarios[0].response));
  base.reportId = 'rep_large_stress_1';
  base.fixtureLabel = 'representative_large_summary';
  base.text = 'Summary of ' + rowCount + ' active campaigns.';
  base.cards = base.cards.slice(0, 3);
  base.datasets = [base.datasets[0]];
  base.blocks = [
    { type: 'text', text: 'Summary of ' + rowCount + ' active campaigns.' },
    { type: 'number_card', metricId: base.cards[0].id },
    { type: 'table', title: 'Daily Breakdown', datasetId: base.datasets[0].id, sortable: true },
  ];
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const day = (i % 28) + 1;
    rows.push({
      date: '2026-09-' + String(day).padStart(2, '0'),
      spend: 10 + i * 2,
      sales: 50 + i * 10,
    });
  }
  base.datasets[0].rows = rows;
  base.datasets[0].page = {
    offset: 0,
    limit: 100,
    total: rowCount,
    hasMore: false,
  };
  base.followUps = [{
    label: 'Break down by campaign',
    request: {
      schemaVersion: '1.0',
      category: 'change',
      profileIds: [base.scope.profiles[0].profileId],
      adTypes: ['SP'],
      period: { preset: 'last_7_days' },
      groupBy: ['campaign'],
      metrics: ['spend', 'sales'],
    },
  }];
  return base;
}

test('Round 4: extractBoundedEvidence strictly caps large dataset sample rows at 10', () => {
  const largeReport = makeLargeReport(100);
  assert.equal(largeReport.datasets[0].rows.length, 100);

  const bounded = extractBoundedEvidence(largeReport);
  assert.equal(bounded.status, 'ok');
  assert.equal(bounded.datasets.length, 1);
  assert.equal(bounded.datasets[0].rowCount, 100);
  assert.equal(bounded.datasets[0].sampleRows.length, 10, 'Sample rows sent to LLM must be strictly capped at 10');
  assert.equal(bounded.kpiCards.length, 3);
});

test('Round 4: execution records comprehensive timing and token metrics across turns', async () => {
  const mockAiProvider = {
    async requestTurn(turn) {
      if (!turn.toolResults) {
        return {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          text: '',
          toolCalls: [{
            id: 'call_timing_1',
            name: 'run_report',
            arguments: { category: 'summary' },
          }],
          usage: { inputTokens: 45, outputTokens: 18 },
        };
      }
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'Total spend was $5,000 generating $25,000 in sales at a 20.0% ACOS.',
        toolCalls: [],
        usage: { inputTokens: 120, outputTokens: 35 },
      };
    },
  };

  const largeReport = makeLargeReport(50);
  const mockReportService = async () => largeReport;

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: mockReportService,
  });

  const response = await chatService({
    message: 'How did my campaigns do last week?',
    profileIds: ['1001'],
  }, {
    userId: 'user_pilot_1',
    profileIds: ['1001'],
  });

  assert.equal(response.isReport, true);
  assert.ok(response.timings);
  assert.ok(typeof response.timings.turn1DurationMs === 'number');
  assert.ok(typeof response.timings.reportDurationMs === 'number');
  assert.ok(typeof response.timings.turn2DurationMs === 'number');
  assert.ok(typeof response.timings.totalDurationMs === 'number');

  assert.equal(response.usage.totalInputTokens, 165);
  assert.equal(response.usage.totalOutputTokens, 53);
});

test('Round 4: non-analytics FAQ intercept retains priority and does not invoke reporting', async () => {
  let aiCalled = false;
  let reportCalled = false;

  const mockFaqService = async (msg) => {
    if (msg.includes('billing')) {
      return {
        question: 'How do I update billing?',
        answer: 'You can update billing information under Settings > Billing.',
        matchPercentage: 90,
      };
    }
    return null;
  };

  const chatService = createChatService({
    aiProvider: {
      async requestTurn() {
        aiCalled = true;
        return { text: 'AI response' };
      },
    },
    reportService: async () => {
      reportCalled = true;
      return null;
    },
    faqService: mockFaqService,
  });

  const response = await chatService({
    message: 'How do I update billing details?',
  }, {
    userId: 'user_123',
  });

  assert.equal(response.isReport, false);
  assert.equal(aiCalled, false, 'FAQ with high confidence should bypass AI');
  assert.equal(reportCalled, false, 'FAQ should never invoke reporting');
  assert.ok(response.replyMessage.includes('Settings > Billing'));
  assert.equal(response.faqMatch.matchPercentage, 90);
});

test('Round 4: representative account synthetic v1 report passes strict schema validation', () => {
  const report = makeLargeReport(25);
  const validated = validateReportResponse(report);

  assert.equal(validated.schemaVersion, '1.0');
  assert.equal(validated.category, 'summary');
  assert.equal(validated.cards.length, 3);
  assert.equal(validated.datasets[0].rows.length, 25);
  assert.equal(validated.followUps.length, 1);
  assert.equal(validated.followUps[0].request.category, 'change');
});
