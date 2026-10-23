'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  messageMentionsTimePeriod,
  missingPeriodClarification,
  createChatService,
} = require('../api-server/services/chatbotReporting.chat');

test('messageMentionsTimePeriod recognizes explicit and relative date references', () => {
  const withDates = [
    'how did yesterday go?',
    "give me yesterday's acos",
    'summarize this week vs last week',
    'performance for the last 7 days',
    'spend over the past 14 days',
    'sales in the last 30 days',
    'how did october look',
    'what about this month',
    'show me last month',
    'data for 2026-10-21',
    'when do my ads work best? give me data for date 21-10-26 for any one campaign',
    'between 2026-10-01 and 2026-10-07',
    'from oct 1 to oct 7',
    'performance 3 days ago',
    'year to date acos',
    'how did friday do',
    'q3 performance',
  ];
  for (const message of withDates) {
    assert.equal(messageMentionsTimePeriod(message), true, message);
  }
});

test('messageMentionsTimePeriod returns false when no time period is named', () => {
  const noDates = [
    'how did my ads do?',
    'when do my ads work best?',
    'where am I wasting ad spend?',
    'find growth search terms',
    'which campaigns have the worst acos?',
    'how may I improve my acos?', // "may" modal, not the month
    'what is tacos?',
    'show me my campaigns',
  ];
  for (const message of noDates) {
    assert.equal(messageMentionsTimePeriod(message), false, message);
  }
});

test('a rule start date is not treated as a reporting range', () => {
  assert.equal(messageMentionsTimePeriod('did performance improve after my bid rule started on monday?'), false);
});

test('missingPeriodClarification asks when no date is given and none carries over', () => {
  const ask = missingPeriodClarification('summary', 'how did my ads do?', null);
  assert.ok(ask, 'should return a clarification string');
  assert.match(ask, /date range/i);
  assert.match(ask, /last 7 days/i);
});

test('missingPeriodClarification stays silent when the question names a date', () => {
  assert.equal(missingPeriodClarification('summary', 'how did yesterday go?', null), null);
  assert.equal(missingPeriodClarification('time', 'when do my ads work best in the last 7 days?', null), null);
});

test('missingPeriodClarification reuses the period carried over from a prior report', () => {
  const reportContext = { category: 'summary', period: { preset: 'last_7_days' } };
  assert.equal(missingPeriodClarification('change', 'break it down by campaign', reportContext), null);
});

test('definition questions never require a date', () => {
  assert.equal(missingPeriodClarification('definition', 'what does TACOS mean?', null), null);
});

test('an undated analytics question asks for the date instead of running a report', async () => {
  let ran = false;
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [{ id: 'r', name: 'run_report', arguments: { category: 'time', groupBy: ['hour', 'weekday'] } }] }) },
    reportService: async () => { ran = true; return { status: 'ok' }; },
  });
  const result = await service({ message: 'When do my ads work best?', profileIds: ['123'] });
  assert.equal(ran, false, 'must not query the database without a date');
  assert.equal(result.isReport, false);
  assert.match(result.replyMessage, /date range/i);
});

test('the same question with a date proceeds to the report', async () => {
  let ran = false;
  const service = createChatService({
    aiProvider: { requestTurn: async () => ({ toolCalls: [{ id: 'r', name: 'run_report', arguments: { category: 'time', groupBy: ['hour', 'weekday'], period: { preset: 'last_7_days' } } }] }), },
    reportService: async () => { ran = true; return { category: 'time', status: 'ok' }; },
  });
  const result = await service({ message: 'When do my ads work best in the last 7 days?', profileIds: ['123'] });
  assert.equal(ran, true, 'a dated question should reach the report');
  assert.equal(result.isReport, true);
});
