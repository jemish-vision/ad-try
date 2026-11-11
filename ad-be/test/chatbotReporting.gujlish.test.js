'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createChatService,
  extractExplicitSingleMetric,
  normalizeQuestionReportArguments,
  sanitizeReportRequest,
} = require('../api-server/services/chatbotReporting.chat');
const {
  isGujlish,
  explicitQuestionPeriod,
  messageMentionsTimePeriod,
  hasExplicitComparisonIntent,
} = require('../api-server/services/chatbotReporting/questionIntent');

test('isGujlish accurately identifies Gujlish queries and does not false-flag English queries', () => {
  const gujlishQueries = [
    'kem cho',
    'Kem chho? Shu chale chhe?',
    'su chale che?',
    'tame shu kari shako cho?',
    'gai kaale ketlo spend thayo?',
    'gaikale ketlo kharch thayo?',
    'kal nu sales batavo',
    'aaje ketlo ACOS chhe?',
    'kya keywords ma paisa waste thay chhe?',
    'chhella 7 divas no report aapo',
    'ACOS no matlab shu chhe? Samjaavo',
    'aa week ma ketla clicks aavya?',
    'gaya week karta aa week ma shu farak chhe?',
    'maro connected profile kyo chhe?',
    'advertiseiq shu chhe?',
    'mane kal nu spend batavo',
    'kya products ma vadhare faaydo chhe?',
  ];

  for (const q of gujlishQueries) {
    assert.equal(isGujlish(q), true, `Expected "${q}" to be detected as Gujlish`);
  }

  const englishQueries = [
    'How did yesterday go?',
    'What was my spend yesterday?',
    'Show me yesterday ACOS',
    'Which keywords are wasting money?',
    'Give me performance summary for last 7 days',
    'What is AdvertiseIQ used for?',
    'Can you define ACOS and ROAS?',
    'Is 35% ACOS good?',
    'Which campaigns have low stock?',
    'What are your capabilities?',
    'Help me optimize my bids',
  ];

  for (const q of englishQueries) {
    assert.equal(isGujlish(q), false, `Expected "${q}" to NOT be detected as Gujlish`);
  }
});

test('explicitQuestionPeriod accurately extracts presets from Gujlish queries', () => {
  assert.deepEqual(explicitQuestionPeriod('gai kaale ketlo spend thayo'), { preset: 'yesterday' });
  assert.deepEqual(explicitQuestionPeriod('gaikale acos ketlo hato'), { preset: 'yesterday' });
  assert.deepEqual(explicitQuestionPeriod('kal nu sales batavo'), { preset: 'yesterday' });
  assert.deepEqual(explicitQuestionPeriod('kale ketlo kharch thayo'), { preset: 'yesterday' });
  assert.deepEqual(explicitQuestionPeriod('aaje ketlo ACOS chhe'), { preset: 'today' });
  assert.deepEqual(explicitQuestionPeriod('aaj nu spend batavo'), { preset: 'today' });
  assert.deepEqual(explicitQuestionPeriod('chhella 7 divas no performance report'), { preset: 'last_7_days' });
  assert.deepEqual(explicitQuestionPeriod('chhela 14 divas nu sales'), { preset: 'last_14_days' });
  assert.deepEqual(explicitQuestionPeriod('chhella 30 divas ma ketli orders aavi'), { preset: 'last_30_days' });
  assert.deepEqual(explicitQuestionPeriod('aa athvadiyu performance kasto chhe'), { preset: 'this_week' });
  assert.deepEqual(explicitQuestionPeriod('gaya athvadiye ketlo spend thayo'), { preset: 'last_week' });
});

test('extractExplicitSingleMetric recognizes Gujlish metric phrases', () => {
  assert.equal(extractExplicitSingleMetric('Mane gai kaal no ACOS ketlo hato te batavo'), 'acos');
  assert.equal(extractExplicitSingleMetric('Gai kaale ketlo spend thayo?'), 'spend');
  assert.equal(extractExplicitSingleMetric('Kal no kharch ketlo hato?'), 'spend');
  assert.equal(extractExplicitSingleMetric('Kal nu sales ketlu hatu?'), 'sales');
  assert.equal(extractExplicitSingleMetric('Kal ni kamani ketli hati?'), 'sales');
  assert.equal(extractExplicitSingleMetric('Kal no ROAS ketlo hato?'), 'roas');
  assert.equal(extractExplicitSingleMetric('Kal no CPC batavo'), 'cpc');
});

test('messageMentionsTimePeriod detects Gujlish time expressions', () => {
  assert.equal(messageMentionsTimePeriod('gai kaale ketlo spend thayo'), true);
  assert.equal(messageMentionsTimePeriod('aaje ACOS kevo chhe'), true);
  assert.equal(messageMentionsTimePeriod('chhella 7 divas nu kaho'), true);
  assert.equal(messageMentionsTimePeriod('aa athvadiye shu thayu'), true);
  assert.equal(messageMentionsTimePeriod('gaya mahine ketlo kharch thayo'), true);
});

test('hasExplicitComparisonIntent detects Gujlish comparison words', () => {
  assert.equal(hasExplicitComparisonIntent('gaya athvadiye karta aa athvadiye shu farak chhe'), true);
  assert.equal(hasExplicitComparisonIntent('this week ane last week ni sarkhamani karo'), true);
  assert.equal(hasExplicitComparisonIntent('spend vadhyo ke ghatyo'), true);
});

test('Conversational Gujlish greeting receives direct Gujlish text without calling run_report', async () => {
  let toolCalled = false;
  const mockAiProvider = {
    requestTurn: async ({ instructions, messages }) => {
      assert.match(instructions, /LANGUAGE HANDLING & GUJLISH SUPPORT/);
      assert.match(instructions, /GUJLISH & MULTILINGUAL CONVERSATION INSTRUCTIONS/);
      return {
        text: 'Kem cho! Hu tamaro AdvertiseIQ assistant chhu. Hu tamara Amazon advertising performance nu analysis karva ma ane campaigns optimize karva ma madad kari shaku chhu. Tamare aaje shu jovanu chhe?',
        toolCalls: [],
      };
    },
  };

  const service = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => {
      toolCalled = true;
      return {};
    },
  });

  const result = await service({
    message: 'Kem cho? Tame shu kari shako cho?',
    activeProfile: { name: 'Tagdo', currencyCode: 'INR' },
  });

  assert.equal(result.isReport, false);
  assert.equal(toolCalled, false);
  assert.match(result.replyMessage, /Kem cho!/);
  assert.match(result.replyMessage, /AdvertiseIQ/);
});

test('Gujlish metric query triggers run_report with yesterday and spend, returning Gujlish explanation', async () => {
  let reportToolArgs = null;
  const mockReport = {
    category: 'summary',
    status: 'ok',
    cards: [
      { metric: 'spend', value: 1250.50, unit: 'currency', currencyCode: 'INR', title: 'Spend' },
      { metric: 'sales', value: 5000.00, unit: 'currency', currencyCode: 'INR', title: 'Sales' },
    ],
    datasets: [],
    scope: { profiles: [{ profileId: '123', name: 'Tagdo' }] },
  };

  let turnNumber = 1;
  const mockAiProvider = {
    requestTurn: async ({ toolResults }) => {
      if (turnNumber === 1) {
        turnNumber = 2;
        return {
          toolCalls: [{
            id: 'call_1',
            name: 'run_report',
            arguments: {
              category: 'summary',
              period: { preset: 'yesterday' },
              metrics: ['spend'],
              presentation: 'number_card',
            },
          }],
        };
      }
      // Turn 2
      assert.ok(toolResults);
      return {
        text: 'Tamaro gai kal no total ad spend ₹1,250.50 hato.',
      };
    },
  };

  const service = createChatService({
    aiProvider: mockAiProvider,
    reportService: async (args) => {
      reportToolArgs = args;
      return mockReport;
    },
  });

  const result = await service({
    message: 'Gai kaale ketlo spend thayo?',
    profileIds: ['123'],
    activeProfile: { name: 'Tagdo', currencyCode: 'INR' },
  });

  assert.equal(result.isReport, true);
  assert.equal(reportToolArgs.period.preset, 'yesterday');
  assert.deepEqual(reportToolArgs.metrics, ['spend']);
  assert.match(result.replyMessage, /gai kal/i);
  assert.match(result.replyMessage, /1,250\.50/);
});

test('Gujlish waste query invokes waste report and responds in Gujlish', async () => {
  let reportArgs = null;
  const mockReport = {
    category: 'waste',
    status: 'ok',
    title: 'Wasted spend last 7 days',
    cards: [],
    datasets: [{
      id: 'waste_ds',
      columns: [{ key: 'keywordText', unit: 'string' }, { key: 'spend', unit: 'currency' }, { key: 'orders', unit: 'count' }],
      rows: [{ keywordText: 'cotton shirt', spend: 850.00, orders: 0 }],
    }],
    scope: { profiles: [{ profileId: '123', name: 'Tagdo' }] },
  };

  let turnNumber = 1;
  const mockAiProvider = {
    requestTurn: async () => {
      if (turnNumber === 1) {
        turnNumber = 2;
        return {
          toolCalls: [{
            id: 'call_waste',
            name: 'run_report',
            arguments: {
              category: 'waste',
              groupBy: ['keyword'],
              period: { preset: 'last_7_days' },
            },
          }],
        };
      }
      return {
        text: 'Chhella 7 divas ma "cotton shirt" keyword par ₹850.00 spend thayo ane 0 orders aavya, jema paisa waste thai rahya chhe.',
      };
    },
  };

  const service = createChatService({
    aiProvider: mockAiProvider,
    reportService: async (args) => {
      reportArgs = args;
      return mockReport;
    },
  });

  const result = await service({
    message: 'Kya keywords ma paisa waste thay chhe?',
    profileIds: ['123'],
    activeProfile: { name: 'Tagdo', currencyCode: 'INR' },
  });

  assert.equal(result.isReport, true);
  assert.equal(reportArgs.category, 'waste');
  assert.deepEqual(reportArgs.groupBy, ['keyword']);
  assert.match(result.replyMessage, /cotton shirt/);
  assert.match(result.replyMessage, /850\.00/);
});

test('English queries continue to respond in English without interference', async () => {
  const mockAiProvider = {
    requestTurn: async () => ({
      text: 'Hello! I am your AdvertiseIQ advertising assistant for Tagdo. How can I help you today?',
      toolCalls: [],
    }),
  };

  const service = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => ({}),
  });

  const result = await service({
    message: 'What can you do?',
    activeProfile: { name: 'Tagdo', currencyCode: 'INR' },
  });

  assert.equal(result.isReport, false);
  assert.match(result.replyMessage, /Hello! I am your AdvertiseIQ/);
});

test('partial report with open attribution window executes Turn 2 AI summary in Gujlish', async () => {
  let turns = 0;
  const mockReport = {
    category: 'growth',
    status: 'partial',
    cards: [
      { metric: 'sales', value: 12000, unit: 'currency', currencyCode: 'INR' },
      { metric: 'acos', value: 18.5, unit: 'percent' },
    ],
    datasets: [{
      id: 'growth_ds',
      columns: [{ key: 'searchTerm', unit: 'string' }, { key: 'sales', unit: 'currency' }],
      rows: [{ searchTerm: 'formal shoes', sales: 12000 }],
    }],
    scope: { profiles: [{ profileId: '123', name: 'Tagdo', currencyCode: 'INR' }] },
    freshness: { status: 'verified', missingInputs: ['Completed 14-day attribution window'] },
  };

  const mockAiProvider = {
    requestTurn: async () => {
      turns += 1;
      if (turns === 1) {
        return {
          toolCalls: [{
            id: 'call_growth_partial',
            name: 'run_report',
            arguments: {
              category: 'growth',
              period: { preset: 'last_7_days' },
            },
          }],
        };
      }
      return {
        text: 'Chhella 7 divas ma tamara growth report mujab "formal shoes" search term thi ₹12000 nu sales thayu chhe ane ACOS 18.5% chhe.',
      };
    },
  };

  const service = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => mockReport,
  });

  const result = await service({
    message: 'Mane growth opportunities batavo chhella 7 divas na',
    profileIds: ['123'],
    activeProfile: { name: 'Tagdo', currencyCode: 'INR' },
  });

  assert.equal(turns, 2, 'Should execute Turn 2 AI summary even for partial status');
  assert.equal(result.isReport, true);
  assert.match(result.replyMessage, /formal shoes/);
  assert.match(result.replyMessage, /12000/);
  assert.doesNotMatch(result.replyMessage, /Ahiya uplabdh results chhe/);
  assert.doesNotMatch(result.replyMessage, /Here are the available results/);
});

test('partial report with open attribution window executes Turn 2 AI summary in English', async () => {
  let turns = 0;
  const mockReport = {
    category: 'summary',
    status: 'partial',
    cards: [
      { metric: 'spend', value: 450, unit: 'currency', currencyCode: 'USD' },
      { metric: 'sales', value: 2500, unit: 'currency', currencyCode: 'USD' },
      { metric: 'acos', value: 18.0, unit: 'percent' },
    ],
    datasets: [],
    scope: { profiles: [{ profileId: '456', name: 'BrandUS', currencyCode: 'USD' }] },
    freshness: { status: 'verified', missingInputs: ['Completed 14-day attribution window'] },
  };

  const mockAiProvider = {
    requestTurn: async () => {
      turns += 1;
      if (turns === 1) {
        return {
          toolCalls: [{
            id: 'call_summary_partial',
            name: 'run_report',
            arguments: {
              category: 'summary',
              period: { preset: 'yesterday' },
            },
          }],
        };
      }
      return {
        text: 'Yesterday your campaigns spent $450 with total sales of $2500, delivering a solid 18.0% ACOS.',
      };
    },
  };

  const service = createChatService({
    aiProvider: mockAiProvider,
    reportService: async () => mockReport,
  });

  const result = await service({
    message: 'Give me yesterday performance summary',
    profileIds: ['456'],
    activeProfile: { name: 'BrandUS', currencyCode: 'USD' },
  });

  assert.equal(turns, 2, 'Should execute Turn 2 AI summary for partial status in English');
  assert.equal(result.isReport, true);
  assert.match(result.replyMessage, /\$450/);
  assert.match(result.replyMessage, /\$2500/);
  assert.doesNotMatch(result.replyMessage, /Here are the available results/);
});
