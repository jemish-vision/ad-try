'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzePerformance } = require('../api-server/services/chatbotReporting/performanceAnalysis');

function row(campaignId, spend, sales, clicks, orders, impressions, extra = {}) {
  return { campaignId, name: campaignId, spend, sales, clicks, orders, impressions, ...extra };
}

function source(rows, extra = {}) {
  return { rows, verification: 'verified', warnings: [], missingInputs: [],
    dataAsOf: '2026-10-20T12:00:00.000Z', ...extra };
}

function context(extra = {}) {
  return {
    request: { category: 'summary', metrics: ['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr'],
      groupBy: ['campaign'], comparison: { mode: 'previous_period' } },
    profile: { profileId: '123', currencyCode: 'USD', attributionWindows: { SP: 7 } },
    adType: 'SP',
    current: source([row('a', 40, 200, 20, 4, 1000), row('b', 60, 100, 10, 1, 500)]),
    comparison: source([row('a', 20, 100, 10, 2, 500), row('b', 30, 100, 10, 1, 500)]),
    periods: {
      current: { fromDate: '2026-10-19', toDate: '2026-10-19', startAt: '2026-10-19T00:00:00.000Z', endBefore: '2026-10-20T00:00:00.000Z', isPartial: false },
      comparison: { fromDate: '2026-10-18', toDate: '2026-10-18', startAt: '2026-10-18T00:00:00.000Z', endBefore: '2026-10-19T00:00:00.000Z', isPartial: false }
    },
    options: {}, now: new Date('2026-10-21T00:00:00.000Z'), idPrefix: 'analysis_1', ...extra
  };
}

function category(name, options = {}) {
  const input = context();
  input.request = { ...input.request, category: name, ...options };
  return input;
}

test('summary calculates weighted ratios from summed raw totals and independent deltas', () => {
  const result = analyzePerformance(context());
  const cards = Object.fromEntries(result.cards.map(card => [card.metric, card]));
  assert.equal(cards.spend.value, 100);
  assert.equal(cards.sales.value, 300);
  assert.equal(cards.acos.value, 100 / 300 * 100);
  assert.equal(cards.roas.value, 3);
  assert.equal(cards.cpc.value, 100 / 30);
  assert.equal(cards.cvr.value, 5 / 30 * 100);
  assert.equal(cards.acos.comparison.previousValue, 25);
  assert.equal(cards.sales.comparison.relativeChangePercent, 50);
  assert.equal(result.datasets.length, 0);
  assert.ok(result.cards.every(card => card.id.startsWith('analysis_1_')));
});

test('unverified observed rows show provisional comparison numbers with a caveat', () => {
  const input = context();
  input.current.verification = 'unverified';
  input.current.warnings = ['IMPORT_COVERAGE_UNVERIFIED'];
  const result = analyzePerformance(input);
  const cards = Object.fromEntries(result.cards.map(card => [card.metric, card]));
  assert.equal(cards.spend.value, 100);
  // Observed (unverified) matched periods now yield a provisional comparison
  // instead of withholding it entirely.
  assert.equal(cards.acos.comparison.previousValue, 25);
  assert.ok(result.warnings.some(warning => /provisional/i.test(warning)), 'flags the comparison as provisional');
});

test('conflicting rows and absent unverified data never become zero totals', () => {
  for (const current of [source([], { verification: 'unverified' }), source([row('a', 10, 10, 1, 1, 10)], { verification: 'conflict' })]) {
    const result = analyzePerformance(context({ current }));
    assert.ok(result.cards.every(card => card.value === null));
  }
});

test('verified zero activity preserves null ratios and zero-base comparison semantics', () => {
  const result = analyzePerformance(context({ current: source([]), comparison: source([]) }));
  const cards = Object.fromEntries(result.cards.map(card => [card.metric, card]));
  assert.equal(cards.spend.value, 0);
  assert.equal(cards.spend.comparison.status, 'both_zero');
  assert.equal(cards.acos.value, null);
  assert.equal(cards.acos.status, 'no_sales');
});

test('missing raw fields propagate missing ratios instead of treating them as zero', () => {
  const result = analyzePerformance(context({ current: source([row('a', 10, null, 5, 1, 20)]) }));
  assert.equal(result.cards.find(card => card.metric === 'acos').value, null);
  assert.equal(result.cards.find(card => card.metric === 'spend').value, 10);
});

test('unknown attribution and unmatched windows still withhold changes', () => {
  const cases = [context(), context(), context()];
  cases[0].profile.attributionWindows.SP = null; // unknown attribution
  cases[1].periods.current.isPartial = true;     // partial (intraday) window
  cases[2].periods.comparison.toDate = '2026-10-17'; // mismatched window length

  for (const input of cases) {
    const result = analyzePerformance(input);
    assert.ok(result.cards.every(card => card.comparison.previousValue === null));
    assert.match(result.text.join(' '), /cannot be compared/);
  }
});

test('source-coverage warnings alone yield a provisional comparison, not a full withhold', () => {
  const input = context();
  input.comparison.warnings = ['NEWER_INCOMPLETE_IMPORT'];
  const result = analyzePerformance(input);
  assert.equal(result.cards.find(card => card.metric === 'acos').comparison.previousValue, 25);
  assert.ok(result.warnings.some(warning => /provisional/i.test(warning)));
});

test('movers aggregate repeated daily entities before top three ranking', () => {
  const input = category('change', { metrics: ['sales'] });
  input.current = source([row('a', 1, 80, 1, 1, 10), row('a', 1, 80, 1, 1, 10),
    row('b', 1, 120, 1, 1, 10), row('c', 1, 90, 1, 1, 10), row('d', 1, 70, 1, 1, 10)]);
  input.comparison = source([]);
  const result = analyzePerformance(input);
  assert.deepEqual(result.datasets[0].rows.map(item => item.campaignId), ['a', 'b', 'c']);
  assert.equal(result.datasets[0].rows[0].absoluteChange, 160);
  assert.equal(result.datasets[0].page.total, 4);
  assert.equal(result.datasets[0].rows[0].cpcCurrent, 1);
  assert.match(result.text.join(' '), /not proof of causation/);
});

test('keyword identities include campaign and ad-group ancestors', () => {
  const input = category('change', { metrics: ['sales'], groupBy: ['keyword'] });
  input.current = source([row('a', 1, 20, 1, 1, 10, { adGroupId: 'g', keywordId: 'k' }),
    row('b', 1, 50, 1, 1, 10, { adGroupId: 'g', keywordId: 'k' })]);
  input.comparison = source([]);
  const result = analyzePerformance(input);
  assert.equal(result.datasets[0].rows.length, 2);
  assert.equal(result.datasets[0].rows[0].campaignId, 'b');
  assert.equal(result.datasets[0].rows[0].adGroupId, 'g');
});

test('missing entity identity withholds rankings', () => {
  const input = category('change', { groupBy: ['keyword'] });
  assert.equal(analyzePerformance(input).datasets.length, 0);
  assert.ok(analyzePerformance(input).missingInputs.length);
});

test('unchanged ACOS is described truthfully and never called an increase', () => {
  const input = category('change', { metrics: ['acos'] });
  input.current = input.comparison;
  const result = analyzePerformance(input);
  assert.match(result.text.join(' '), /did not change/);
  assert.doesNotMatch(result.text.join(' '), /increase coincided/);
});

test('ACOS increase describes directionally consistent factors as associations', () => {
  const input = category('change', { metrics: ['acos'] });
  input.current = source([row('a', 100, 100, 20, 2, 1000)]);
  input.comparison = source([row('a', 50, 200, 20, 4, 1000)]);
  const text = analyzePerformance(input).text.join(' ');
  assert.match(text, /higher CPC/);
  assert.match(text, /lower conversion rate/);
  assert.doesNotMatch(text, /caused/);
  assert.match(text, /Change of \+75\.0 percentage points/);
});

test('explicit changes and movers compare observed imports as provisional', () => {
  for (const request of [
    { category: 'change', metrics: ['sales'] },
    { category: 'comparison', analysis: { includeMovers: true } }
  ]) {
    const input = category(request.category, request);
    input.current.verification = 'unverified';
    input.current.warnings = ['IMPORT_COVERAGE_UNVERIFIED'];

    const result = analyzePerformance(input);

    assert.equal(result.cards[0].value, request.category === 'change' ? 300 : 100);
    // The comparison is now provided (provisional) rather than withheld, so a
    // "why" question gets an answer with a clear caveat.
    assert.ok(result.cards.some(card => card.comparison.previousValue !== null));
    assert.ok(result.warnings.some(warning => /provisional/i.test(warning)));
    assert.doesNotMatch(result.text.join(' '), /cannot be compared/);
  }
});

test('sales decrease describes lower conversion, fewer impressions/clicks and top movers', () => {
  const input = category('change', { metrics: ['sales'] });
  input.current = source([row('a', 50, 100, 20, 2, 500)]);
  input.comparison = source([row('a', 50, 300, 30, 6, 1000)]);
  const text = analyzePerformance(input).text.join(' ');
  assert.match(text, /lower conversion rate/);
  assert.match(text, /fewer impressions/);
  assert.match(text, /fewer clicks/);
  assert.match(text, /Top 3 movers/);
});

test('unusual changes find entity CPC spikes, impression drops and stopped spend', () => {
  const input = category('unusual');
  input.current = source([row('a', 100, 100, 20, 2, 200), row('b', 0, 0, 0, 0, 0)]);
  input.comparison = source([row('a', 20, 100, 20, 2, 1000), row('b', 50, 100, 30, 2, 500)]);
  const rows = analyzePerformance(input).datasets[0].rows;
  assert.ok(rows.some(item => item.metric === 'cpc' && item.direction === 'spike' && item.changePercent === 400));
  assert.ok(rows.some(item => item.metric === 'impressions' && item.changePercent === -80));
  assert.ok(rows.some(item => item.name === 'b' && item.direction === 'stopped spending'));
});

test('stale, unknown and future timestamps never produce unusual alerts', () => {
  for (const dataAsOf of [null, '2026-10-01T00:00:00.000Z', '2026-10-22T00:00:00.000Z']) {
    const input = category('unusual');
    input.comparison.dataAsOf = dataAsOf;
    assert.equal(analyzePerformance(input).datasets.length, 0);
    assert.ok(analyzePerformance(input).missingInputs.length);
  }
});

test('zero baseline and low volume do not manufacture percentage anomalies', () => {
  const input = category('unusual');
  input.current = source([row('a', 100, 100, 1, 1, 20)]);
  input.comparison = source([row('a', 0, 0, 1, 0, 20)]);
  assert.equal(analyzePerformance(input).datasets[0].rows.length, 0);
});

test('summary movers require explicit opt-in', () => {
  const input = context();
  input.request.analysis = { includeMovers: true };
  assert.equal(analyzePerformance(input).datasets.length, 1);
});

test('analysis does not mutate sources or request', () => {
  const input = category('change');
  const before = JSON.stringify(input);
  analyzePerformance(input);
  assert.equal(JSON.stringify(input), before);
});
