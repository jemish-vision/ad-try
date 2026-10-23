'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractExplicitSingleMetric,
  hasExplicitComparisonIntent,
  createChatService
} = require('../api-server/services/chatbotReporting.chat');

test('extractExplicitSingleMetric isolates requested metrics accurately', () => {
  assert.equal(extractExplicitSingleMetric('give me yesterday acos'), 'acos');
  assert.equal(extractExplicitSingleMetric('what is my acos yesterday?'), 'acos');
  assert.equal(extractExplicitSingleMetric('what was my spend yesterday'), 'spend');
  assert.equal(extractExplicitSingleMetric('yesterday sales'), 'sales');
  assert.equal(extractExplicitSingleMetric('orders yesterday'), 'orders');
  assert.equal(extractExplicitSingleMetric('what was our roas this week'), 'roas');
  assert.equal(extractExplicitSingleMetric('cpc yesterday'), 'cpc');
  assert.equal(extractExplicitSingleMetric('conversion rate yesterday'), 'cvr');
  assert.equal(extractExplicitSingleMetric('impressions yesterday'), 'impressions');
  assert.equal(extractExplicitSingleMetric('clicks yesterday'), 'clicks');

  // Multi-metric or general queries must not be collapsed to a single metric
  assert.equal(extractExplicitSingleMetric('how did my ads perform yesterday'), null);
  assert.equal(extractExplicitSingleMetric('show yesterday performance'), null);
  assert.equal(extractExplicitSingleMetric('give me a summary of yesterday'), null);
  assert.equal(extractExplicitSingleMetric('show me spend and sales for last 7 days'), null);
  assert.equal(extractExplicitSingleMetric('dashboard overview'), null);
});

test('hasExplicitComparisonIntent detects comparative phrasing vs point queries', () => {
  assert.equal(hasExplicitComparisonIntent('give me yesterday acos'), false);
  assert.equal(hasExplicitComparisonIntent('what was my spend yesterday'), false);
  assert.equal(hasExplicitComparisonIntent('yesterday sales'), false);

  assert.equal(hasExplicitComparisonIntent('compare yesterday acos with day before yesterday'), true);
  assert.equal(hasExplicitComparisonIntent('why did acos increase yesterday'), true);
  assert.equal(hasExplicitComparisonIntent('sales vs previous period'), true);
  assert.equal(hasExplicitComparisonIntent('how did acos change?'), true);
  assert.equal(hasExplicitComparisonIntent('is spend higher or lower?'), true);
});

test('executeChatTurn maps single metric questions to single card and suppresses comparison tables', async () => {
  let receivedReportRequest = null;

  const mockAiProvider = {
    async requestTurn(turn) {
      if (!turn.toolResults) {
        // Model originally attempts general summary with all 7 metrics and comparison
        return {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          text: '',
          toolCalls: [{
            id: 'call_point_metric',
            name: 'run_report',
            arguments: {
              category: 'summary',
              period: { preset: 'yesterday' },
              metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr'],
              comparison: { mode: 'previous_period' },
              presentation: 'auto'
            }
          }],
          usage: { inputTokens: 50, outputTokens: 20 }
        };
      }
      return {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        text: 'Yesterday ACOS for Tagdo was 18.5%.',
        toolCalls: [],
        usage: { inputTokens: 60, outputTokens: 15 }
      };
    }
  };

  const mockReportService = async (req) => {
    receivedReportRequest = req;
    return {
      schemaVersion: '1.0',
      reportId: 'test_rep',
      category: 'summary',
      dataOrigin: 'reporting',
      status: 'ok',
      scope: { profiles: [{ profileId: '2630925322373862', currencyCode: 'INR', timezone: 'Asia/Kolkata', accountType: 'seller', adTypes: ['SP'] }] },
      periods: [{
        profileId: '2630925322373862',
        current: { fromDate: '2026-10-21', toDate: '2026-10-21' },
        comparison: null
      }],
      freshness: { status: 'complete', sourceRefs: [{ name: 'campaigns' }], missingInputs: [] },
      cards: [{ id: 'card_acos', metric: 'acos', value: 18.47, unit: 'percent', status: 'available' }],
      datasets: [{
        id: 'ds_1',
        columns: [{ key: 'name', label: 'Name' }, { key: 'acos', label: 'ACOS' }],
        rows: [{ name: 'Tagdo', acos: 18.47 }]
      }],
      blocks: [
        { type: 'number_card', metricId: 'card_acos' },
        { type: 'table', title: 'Performance · Selected period', datasetId: 'ds_1' }
      ],
      warnings: [],
      followUps: []
    };
  };

  const chatService = createChatService({
    aiProvider: mockAiProvider,
    reportService: mockReportService
  });

  const response = await chatService({
    message: 'give me yesterday acos',
    profileIds: ['2630925322373862']
  }, {
    userId: 'user_test',
    profileIds: ['2630925322373862'],
    currencyCode: 'INR'
  });

  assert.equal(response.isReport, true);
  assert.deepEqual(receivedReportRequest.metrics, ['acos'], 'Must request only the asked single metric');
  assert.equal(receivedReportRequest.comparison.mode, 'none', 'Must suppress comparison for point query');
  assert.equal(receivedReportRequest.presentation, 'number_card', 'Must use number_card presentation');
  assert.equal(response.report.cards.length, 1, 'Only 1 KPI card must be returned');
  assert.equal(response.report.blocks.filter(b => b.type === 'table').length, 1, 'Only 1 table must be returned');
});
