'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeOpportunities, normalizeKeyword } = require('../api-server/services/chatbotReporting/opportunityAnalysis');

function context(category = 'growth', groupBy = ['search_term']) {
  return {
    request: {
      category,
      groupBy,
      filters: [],
      metrics: ['spend'],
      limit: 25,
      offset: 0,
      analysis: { targetAcos: 30 },
    },
    profile: { profileId: '123', currencyCode: 'USD' },
    adType: 'SP',
    idPrefix: 'p0_SP',
    now: new Date('2026-10-21T12:00:00.000Z'),
    current: {
      verification: 'verified',
      rows: [{
        campaignId: '1', adGroupId: '2', keywordId: '3', searchTerm: 'Red shoes',
        spend: 20, sales: 100, clicks: 20, orders: 3, impressions: 80,
      }],
    },
    keywordInventory: {
      rows: [], verified: true, dataAsOf: '2026-10-21T11:00:00.000Z',
    },
  };
}

test('normalizes Unicode, case and whitespace', () => {
  assert.equal(normalizeKeyword('  ＲＥＤ\tShoes  '), 'red shoes');
});

test('qualifying search terms become scoped recommendations with declared thresholds', () => {
  const result = analyzeOpportunities(context());
  assert.equal(result.datasets[0].rows[0].searchTerm, 'red shoes');
  assert.equal(result.datasets[0].rows[0].acos, 20);
  assert.match(result.text.join(' '), /20 clicks, 3 orders/);
});

test('incomplete reporting does not hide the missing current keyword list', () => {
  const input = context();
  input.current.verification = 'unverified';
  input.keywordInventory.verified = false;
  const result = analyzeOpportunities(input);

  assert.equal(result.datasets.length, 0);
  assert.match(result.missingInputs.join(' '), /current keyword inventory/);
  assert.match(result.text.join(' '), /cannot confirm which terms are not already keywords/);
});

for (const matchType of ['EXACT', 'PHRASE', 'BROAD']) {
  test(`excludes an existing ${matchType} keyword with normalized identical text`, () => {
    const input = context();
    input.keywordInventory.rows.push({ campaignId: 1, adGroupId: 2, text: ' RED  SHOES ', matchType, status: 'paused' });
    assert.equal(analyzeOpportunities(input).datasets[0].rows.length, 0);
  });
}

test('does not exclude the same text from another campaign or ad group', () => {
  const input = context();
  input.keywordInventory.rows.push({ campaignId: 9, adGroupId: 2, text: 'red shoes', matchType: 'EXACT', status: 'enabled' });
  assert.equal(analyzeOpportunities(input).datasets[0].rows.length, 1);
});

test('combines normalized term variants before checking sample thresholds', () => {
  const input = context();
  const row = { ...input.current.rows[0], clicks: 10, orders: 2 };
  input.current.rows = [row, { ...row, searchTerm: ' ＲＥＤ  SHOES ' }];
  const rows = analyzeOpportunities(input).datasets[0].rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clicks, 20);
  assert.equal(rows[0].orders, 4);
});

for (const inventory of [
  undefined,
  { rows: [], verified: false, dataAsOf: null },
  { rows: [], verified: true, dataAsOf: '2026-10-19T12:00:00.000Z' },
  { rows: [], verified: true, dataAsOf: '2026-10-22T12:00:00.000Z' },
  { rows: [{}], verified: true, dataAsOf: '2026-10-21T11:00:00.000Z' },
]) {
  test(`withholds new keyword claims without trustworthy inventory ${JSON.stringify(inventory)}`, () => {
    const input = context();
    input.keywordInventory = inventory;
    const result = analyzeOpportunities(input);
    assert.equal(result.datasets.length, 0);
    assert.ok(result.missingInputs.length);
  });
}

test('withholds growth without explicit target or verified reporting', () => {
  const input = context();
  delete input.request.analysis;
  assert.match(analyzeOpportunities(input).missingInputs[0], /target ACOS/);
  input.current.verification = 'unverified';
  assert.match(analyzeOpportunities(input).missingInputs[0], /Verified reporting/);
});

test('rejects low sample and zero-sales growth candidates', () => {
  for (const change of [{ clicks: 19 }, { orders: 2 }, { sales: 0 }, { spend: 31 }]) {
    const input = context();
    Object.assign(input.current.rows[0], change);
    assert.equal(analyzeOpportunities(input).datasets[0].rows.length, 0);
  }
});

test('keyword growth requires low impressions, not just a low ACOS', () => {
  const input = context('growth', ['keyword']);
  assert.equal(analyzeOpportunities(input).datasets[0].rows.length, 1);
  input.current.rows[0].impressions = 100;
  assert.equal(analyzeOpportunities(input).datasets[0].rows.length, 0);
});

test('daily campaign totals cannot establish early budget exhaustion', () => {
  const result = analyzeOpportunities(context('growth', ['campaign']));
  assert.equal(result.datasets.length, 0);
  assert.match(result.text[0], /cannot establish/);
});

test('waste honors explicit filters after aggregation and keeps zero-sales ACOS null', () => {
  const input = context('waste');
  input.request.filters = [{ field: 'spend', operator: 'gt', value: 30 }, { field: 'sales', operator: 'eq', value: 0 }];
  input.current.rows = [
    { ...input.current.rows[0], sales: 0, orders: 0, clicks: 1 },
    { ...input.current.rows[0], sales: 0, orders: 0, clicks: 1 },
  ];
  const result = analyzeOpportunities(input);
  assert.equal(result.datasets[0].rows[0].spend, 40);
  assert.equal(result.datasets[0].rows[0].acos, null);
  assert.ok(result.warnings.some(value => value.includes('small sample')));
});

test('does not invent money thresholds for generic keyword waste', () => {
  const result = analyzeOpportunities(context('waste', ['keyword']));
  assert.equal(result.datasets.length, 0);
  assert.match(result.missingInputs[0], /Specify/);
});

test('relative campaign waste uses samples and marks unverified rows provisional', () => {
  const input = context('waste', ['campaign']);
  input.current.verification = 'unverified';
  const result = analyzeOpportunities(input);
  assert.equal(result.datasets[1].rows.length, 1);
  assert.match(result.warnings[0], /provisional/);
  input.current.rows[0].clicks = 19;
  assert.equal(analyzeOpportunities(input).datasets[1].rows.length, 0);
});

test('conflicting or invalid rows cannot produce recommendations', () => {
  const input = context();
  input.current.verification = 'conflict';
  assert.equal(analyzeOpportunities(input).datasets.length, 0);
  input.current.verification = 'verified';
  input.current.rows[0].spend = -1;
  assert.ok(analyzeOpportunities(input).missingInputs.length);
});

test('server target option is supported and tables apply pagination', () => {
  const input = context();
  delete input.request.analysis;
  input.options = { targetAcos: 30 };
  input.request.offset = 1;
  const dataset = analyzeOpportunities(input).datasets[0];
  assert.equal(dataset.rows.length, 0);
  assert.equal(dataset.page.total, 1);
});
