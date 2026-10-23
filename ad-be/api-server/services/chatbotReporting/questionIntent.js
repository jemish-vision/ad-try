'use strict';

// Pure question interpretation. No model calls, authorization or data reads.
const SUMMARY_METRICS = Object.freeze(['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']);

function extractExplicitSingleMetric(message = '') {
  const text = typeof message === 'string' ? message.toLowerCase()
    .replace(/cost\s+per\s+click/g, 'cpc')
    .replace(/click[\s-]*through\s+rate/g, 'ctr') : '';
  if (!text) return null;

  // Broad summary or multi-metric phrases shouldn't be collapsed to a single metric
  if (/\b(?:performance|overview|summary|report|how\s+are\s+my|how\s+did\s+my|dashboard|all\s+metrics|kpis)\b/i.test(text)) {
    return null;
  }
  if (/\b(?:campaigns?|keywords?|placements?|search\s+terms?|products?|asins?|profiles?|hours?|weekdays?|top|worst|best|rank|trend|chart|graph)\b/i.test(text)) {
    return null;
  }

  const patterns = [
    ['acos', /\bacos\b/i],
    ['roas', /\broas\b/i],
    ['spend', /\b(?:spend|spent|cost|ad\s*spend)\b/i],
    ['sales', /\b(?:sales|ad\s*sales|revenue)\b/i],
    ['orders', /\b(?:orders?|units?\s*ordered)\b/i],
    ['clicks', /\bclicks?\b/i],
    ['impressions', /\bimpressions?\b/i],
    ['cpc', /\b(?:cpc|cost\s*per\s*click)\b/i],
    ['cvr', /\b(?:cvr|conversion\s*rate)\b/i],
    ['ctr', /\b(?:ctr|click\s*through\s*rate)\b/i],
  ];

  const matched = patterns.filter(([, reg]) => reg.test(text));
  if (matched.length === 1) {
    return matched[0][0];
  }
  return null;
}

function hasExplicitComparisonIntent(message = '') {
  const text = typeof message === 'string' ? message.toLowerCase() : '';
  if (!text) return false;
  return /\b(?:compare|compared|comparison|vs\.?|versus|against|than|diff|difference|growth|increase|decrease|spike|drop|why|higher|lower|change)\b/i.test(text);
}

function isPerformanceSummaryQuestion(message = '') {
  return /\b(?:summari[sz]e|summary|overview|how\s+(?:did|are|am)\b.*\b(?:go|doing|perform(?:ing)?))\b/i.test(message);
}

function normalizeKnownWasteQuestion(args, message) {
  // These two supported requests have clear entities and filter semantics.
  // Leave explicitly numbered thresholds to ordinary validated tool handling.
  if (/[1-9]\d*(?:\.\d+)?|[$₹€£]/.test(message)) return args;

  const relativeCampaigns = /\bcampaigns?\b.*\bspending\b.*\ba lot\b.*\bfew sales\b/i.test(message);
  const searchTermsWithoutOrders = /\bsearch\s+terms?\b.*\bclicks?\b.*\b(?:no|zero|0) orders?\b/i.test(message);
  if (!relativeCampaigns && !searchTermsWithoutOrders) return args;

  return {
    ...args,
    category: 'waste',
    groupBy: [relativeCampaigns ? 'campaign' : 'search_term'],
    metrics: ['spend', 'sales', 'orders', 'clicks', 'acos'],
    filters: relativeCampaigns ? [] : [
      { field: 'clicks', operator: 'gt', value: 0 },
      { field: 'orders', operator: 'eq', value: 0 },
    ],
    sort: { field: relativeCampaigns ? 'acos' : 'spend', direction: 'desc' },
    comparison: { mode: 'none' },
    analysis: { includeMovers: false },
    presentation: 'table',
    offset: 0,
    entity: null,
  };
}

function normalizeWeekdayWasteQuestion(args, message) {
  if (!/\b(?:days? of the week|weekdays?)\b.*\bwaste\b/i.test(message)) return args;

  return {
    ...args,
    category: 'time',
    groupBy: ['weekday'],
    // Waste requires outcomes as well as spend. Leading with orders makes the
    // hourly source's existing order-quality preflight stop an unsafe ranking.
    metrics: ['orders', 'spend', 'sales', 'acos'],
    sort: { field: 'acos', direction: 'desc' },
    comparison: { mode: 'none' },
    filters: [],
    analysis: { includeMovers: false },
    presentation: 'heatmap',
    entity: null,
    offset: 0,
  };
}

function requestedTargetAcos(message, reportContext) {
  const explicit = message.match(/\b(?:target(?:\s+acos)?(?:\s+is)?|acos\s+(?:under|below|at most))\s*(?:of|:|=)?\s*(\d+(?:\.\d+)?)\s*%/i);
  const value = explicit ? Number(explicit[1]) : reportContext?.analysis?.targetAcos;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeProductQuestion(args, message) {
  let metric;
  if (/\bproducts?\b.*\bprofitable\b/i.test(message)) metric = 'profit';
  else if (/\btacos\b.*\b(?:by|per)\s+(?:product|asin)\b/i.test(message)) metric = 'tacos';
  else if (/\bproducts?\b.*\blow(?:\s+on)?\s+stock\b/i.test(message)) metric = 'stock';
  if (!metric) return args;

  return {
    ...args,
    category: 'products',
    groupBy: ['product'],
    metrics: [metric],
    presentation: 'bar',
    comparison: { mode: 'none' },
    filters: [],
    sort: null,
    entity: null,
    analysis: { includeMovers: false },
    offset: 0,
  };
}

function isEfficientKeywordQuestion(message) {
  return /\bkeywords?\b.*\b(?:great|good|low)\s+acos\b.*\blow impressions\b/i.test(message);
}

function normalizeKeywordGrowthQuestion(args, message, reportContext) {
  if (!isEfficientKeywordQuestion(message)) return args;
  const targetAcos = requestedTargetAcos(message, reportContext);

  return {
    ...args,
    category: 'growth',
    groupBy: ['keyword'],
    metrics: ['spend', 'sales', 'orders', 'clicks', 'impressions', 'acos'],
    filters: [],
    sort: { field: 'acos', direction: 'asc' },
    comparison: { mode: 'none' },
    presentation: 'table',
    entity: null,
    offset: 0,
    analysis: targetAcos === null ? {} : { targetAcos },
  };
}

function normalizeQuestionReportArguments(args, message, reportContext) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;

  const result = { ...args };
  const period = explicitQuestionPeriod(message);
  const singleMetric = extractExplicitSingleMetric(message);
  const wantsComparison = hasExplicitComparisonIntent(message);

  if (period) {
    result.period = period;
    if (result.comparison?.mode === 'custom') result.comparison = { mode: 'previous_period' };
  }

  const isPointMetric = singleMetric && !wantsComparison
    && ['summary', 'comparison'].includes(result.category);
  if (isPointMetric) {
    result.category = 'summary';
    result.metrics = [singleMetric];
    result.comparison = { mode: 'none' };
    result.presentation = 'number_card';
    result.analysis = { ...result.analysis, includeMovers: false };
  } else if (['summary', 'comparison'].includes(result.category) && isPerformanceSummaryQuestion(message)) {
    result.metrics = [...SUMMARY_METRICS];
    if (!result.comparison || result.comparison.mode === 'none') result.comparison = { mode: 'previous_period' };
    result.analysis = { ...result.analysis, includeMovers: true };
  }

  const waste = normalizeWeekdayWasteQuestion(normalizeKnownWasteQuestion(result, message), message);
  const products = normalizeProductQuestion(waste, message);
  return normalizeKeywordGrowthQuestion(products, message, reportContext);
}

// Broad "does the user name any time period at all?" detector. Unlike
// explicitQuestionPeriod (which maps to a fixed set of presets and ignores
// custom dates), this answers a yes/no question: did the user give the
// assistant a date, range, or relative window to report on? It is used to
// decide whether to ask the user for a date instead of assuming one.
function messageMentionsTimePeriod(message = '') {
  const text = typeof message === 'string' ? message : '';
  if (!text.trim()) return false;

  // A rule's start date is event metadata, not a reporting range.
  if (/\brule\b.*\b(?:started|began|enabled|activated)\b/i.test(text)) return false;

  const patterns = [
    // relative day/range words
    /\b(?:today|yesterday|tonight)\b/i,
    /\bthis\s+(?:week|month|year|quarter|morning|afternoon|evening)\b/i,
    /\blast\s+(?:week|month|year|quarter|night)\b/i,
    /\b(?:last|past|previous|prior|trailing|in|over)\s+(?:the\s+)?\d+\s*(?:day|week|month|year|quarter)s?\b/i,
    /\b\d+\s*(?:day|week|month|year)s?\s+(?:ago|back)\b/i,
    // to-date / open ranges
    /\b(?:ytd|mtd|wtd)\b/i,
    /\b(?:year|month|week)\s*[- ]?to[- ]?date\b/i,
    /\bso\s+far\b/i,
    /\bto\s+date\b/i,
    /\bsince\s+\S+/i,
    /\bbetween\s+.+\s+and\s+.+/i,
    /\bfrom\s+.+\s+to\s+.+/i,
    // explicit calendar dates (YYYY-MM-DD, DD-MM-YYYY, D/M/YY, etc.)
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
    /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/,
    // quarters and bare years
    /\bq[1-4]\b/i,
    /\b20\d{2}\b/,
    // weekday names (full)
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    // month names (full), abbreviations with a day/year, and "may" only near a number
    /\b(?:january|february|march|april|june|july|august|september|october|november|december)\b/i,
    /\b(?:jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*\d/i,
    /\b\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
    /\bmay\s+\d/i,
  ];
  return patterns.some(pattern => pattern.test(text));
}

function explicitQuestionPeriod(message) {
  // Only recognize clear reporting ranges. Dates describing a rule's start
  // are event metadata, not a request to change the report period.
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(message)
    || /\brule\b.*\b(?:started|began|enabled|activated)\b/i.test(message)) return null;

  const matches = [];
  for (const [preset, pattern] of [
    ['this_week', /\bthis week\b/i],
    ['last_week', /\blast week\b/i],
    ['yesterday', /\byesterday\b/i],
    ['today', /\btoday\b/i],
    ['last_7_days', /\b(?:last|past|in|over)\s+(?:the\s+)?7\s+days\b/i],
    ['last_14_days', /\b(?:last|past|in|over)\s+(?:the\s+)?14\s+days\b/i],
    ['last_30_days', /\b(?:last|past|in|over)\s+(?:the\s+)?30\s+days\b/i],
  ]) {
    if (pattern.test(message)) matches.push(preset);
  }
  if (matches.length === 1) return { preset: matches[0] };
  if (matches.length === 2 && matches.includes('this_week') && matches.includes('last_week')
    && /\b(?:vs|versus|compare|compared)\b/i.test(message)) return { preset: 'this_week' };
  return null;
}

module.exports = {
  SUMMARY_METRICS,
  extractExplicitSingleMetric,
  hasExplicitComparisonIntent,
  explicitQuestionPeriod,
  messageMentionsTimePeriod,
  normalizeQuestionReportArguments,
  requestedTargetAcos,
  isEfficientKeywordQuestion,
};
