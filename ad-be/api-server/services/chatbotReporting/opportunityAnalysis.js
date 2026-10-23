'use strict';

const { makeMetricRows, metricColumns, sortAndPage } = require('./reportTable');

const ANALYSIS_METRICS = ['spend', 'sales', 'orders', 'clicks', 'impressions', 'acos', 'cvr'];

function normalizeKeyword(text) {
  return String(text || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function emptyAnalysis() {
  return {
    cards: [],
    datasets: [],
    blocks: [],
    warnings: [],
    missingInputs: [],
    text: [],
    followUps: [],
  };
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function inventoryKey(row, text) {
  return JSON.stringify([String(row.campaignId), String(row.adGroupId), normalizeKeyword(text)]);
}

function isExistingKeyword(row) {
  // Paused keywords still exist and should not be suggested as new keywords.
  return ['EXACT', 'PHRASE', 'BROAD'].includes(String(row.matchType || '').toUpperCase())
    && String(row.status || '').toLowerCase() !== 'archived';
}

function isValidInventoryRow(row) {
  return !!row && row.campaignId && row.adGroupId && normalizeKeyword(row.text)
    && ['EXACT', 'PHRASE', 'BROAD'].includes(String(row.matchType || '').toUpperCase())
    && ['enabled', 'paused', 'archived'].includes(String(row.status || '').toLowerCase());
}

function appendTable(result, rows, request, profile, idPrefix, title, sort) {
  const tableRequest = {
    ...request,
    metrics: ANALYSIS_METRICS,
    sort,
    offset: request.offset || 0,
    limit: request.limit || 25,
  };
  const id = idPrefix + '_opportunities';

  result.datasets.push({
    id,
    currencyCode: profile.currencyCode,
    columns: metricColumns(tableRequest),
    ...sortAndPage(rows, tableRequest),
  });
  result.blocks.push({ type: 'table', title, datasetId: id, sortable: true });
}

function analyzeWaste(context, result, rows, minClicks) {
  const { request, profile, idPrefix } = context;
  const hasExplicitFilters = request.filters.length > 0;
  const canRankRelativeEfficiency = request.groupBy.some(value => ['campaign', 'placement'].includes(value));

  if (!hasExplicitFilters && !canRankRelativeEfficiency) {
    result.missingInputs.push('Specify a spend, clicks, orders or ACOS filter for this waste list.');
    result.text.push('Choose an explicit threshold, such as spend above an amount in your profile currency with zero sales.');
    return;
  }

  const candidates = rows.filter(row => {
    if (!(row.spend > 0) || row.sales === null || row.orders === null || row.clicks === null) {
      return false;
    }

    return hasExplicitFilters || row.clicks >= minClicks;
  });

  // Zero-sales spend ranks first. ACOS is undefined for those rows, never zero.
  const withoutSales = candidates.filter(row => row.sales === 0);
  const withSales = candidates.filter(row => row.sales > 0 && row.acos !== null);

  appendTable(result, withoutSales, request, profile, idPrefix + '_no_sales',
    'Observed spend without attributed sales', { field: 'spend', direction: 'desc' });
  appendTable(result, withSales, request, profile, idPrefix + '_high_acos',
    'Highest observed ACOS', { field: 'acos', direction: 'desc' });
  result.text.push(hasExplicitFilters
    ? 'These rows match your filters; spend without sales is shown separately because its ACOS is undefined.'
    : `Relative efficiency ranking requires at least ${minClicks} clicks. High ACOS alone does not establish unprofitable spend.`);

  if (candidates.some(row => row.clicks < minClicks)) {
    result.warnings.push(`Some filtered rows have fewer than ${minClicks} clicks; review the small sample before acting.`);
  }

  result.text.push('Review attribution maturity and your target before changing bids or adding negatives.');
}

function analyzeGrowth(context, result, rows, thresholds) {
  const { request, profile, idPrefix, keywordInventory, current } = context;
  const { minClicks, minOrders, minImpressions, targetAcos } = thresholds;

  if (request.groupBy.includes('campaign')) {
    result.missingInputs.push('Timestamped budget exhaustion or budget utilization history is required.');
    result.text.push('Daily spend alone cannot establish whether a campaign ran out of budget before the day ended.');
    return;
  }

  // A target is always required to judge efficiency; never assume one.
  if (targetAcos === null) {
    result.missingInputs.push('Provide your target ACOS percentage to evaluate efficient growth.');
    result.text.push('A good ACOS depends on your margin or target; no category benchmark is assumed.');
    return;
  }

  // Observed (unverified) reporting no longer withholds the list — the numbers
  // are real, just not yet reconciled against completed-import coverage. Show
  // the candidates and mark them provisional.
  if (current.verification !== 'verified') {
    result.warnings.push('These growth candidates come from observed reporting that is not fully verified; treat them as provisional and confirm before acting.');
  }

  let candidates = rows.filter(row => (
    row.clicks >= minClicks
    && row.orders >= minOrders
    && row.sales > 0
    && row.acos !== null
    && row.acos <= targetAcos
  ));

  if (request.groupBy.includes('search_term')) {
    const inventory = keywordInventory;
    const usableInventory = !!inventory
      && (inventory.verified || inventory.bestEffort)
      && Number.isFinite(Date.parse(inventory.dataAsOf))
      && Array.isArray(inventory.rows)
      && inventory.rows.every(isValidInventoryRow);

    if (!usableInventory) {
      result.missingInputs.push(...(inventory?.missingInputs || [
        'A complete, dated current keyword inventory is required.',
      ]));
      result.text.push('These are observed search-term results. I cannot confirm which terms are not already keywords without a current keyword list.');
      return;
    }

    const snapshotAge = new Date(context.now || new Date()).getTime() - Date.parse(inventory.dataAsOf);

    if (!Number.isFinite(snapshotAge) || snapshotAge < 0 || snapshotAge > 86400000) {
      result.missingInputs.push('The current keyword inventory must be no older than 24 hours.');
      return;
    }

    const existing = new Set(inventory.rows.filter(isExistingKeyword)
      .map(row => inventoryKey(row, row.text)));
    const uniqueTerms = new Set();

    candidates = candidates.filter(row => {
      const key = inventoryKey(row, row.searchTerm);

      if (!normalizeKeyword(row.searchTerm) || existing.has(key) || uniqueTerms.has(key)) {
        return false;
      }

      uniqueTerms.add(key);
      return true;
    });

    result.text.push('Search terms that already exist as keywords in the same ad group are excluded.');
    if (inventory.bestEffort) {
      result.warnings.push('The already-a-keyword check uses the keywords in your recent reporting; one with no recent activity may not be detected, so confirm before adding.');
    }
  } else if (request.groupBy.includes('keyword') || request.groupBy.includes('target')) {
    candidates = candidates.filter(row => Number.isFinite(row.impressions) && row.impressions < minImpressions);
  } else {
    result.missingInputs.push('Choose search terms or keywords for this growth analysis.');
    return;
  }

  appendTable(result, candidates, request, profile, idPrefix,
    'Growth candidates for your review', { field: 'orders', direction: 'desc' });
  result.text.push(`Candidates require at least ${minClicks} clicks, ${minOrders} orders, positive sales and ACOS at or below your ${targetAcos}% target.`);
  if (!request.groupBy.includes('search_term')) {
    result.text.push(`Low exposure means fewer than ${minImpressions} impressions in the selected period.`);
  }
  result.text.push('Review relevance, attribution maturity and available budget before changing bids or adding keywords.');
}

function analyzeOpportunities(context) {
  const result = emptyAnalysis();
  const { request, profile, adType, current, options = {} } = context;

  if (!['waste', 'growth'].includes(request.category)) {
    return result;
  }

  if (!current || current.verification === 'conflict') {
    result.missingInputs.push('Conflict-free reporting rows are required for opportunity analysis.');
    return result;
  }

  const minClicks = positiveNumber(options.minClicks, 20);
  const minOrders = positiveNumber(options.minOrders, 3);
  const minImpressions = positiveNumber(options.minImpressions, 100);
  const targetAcos = positiveNumber(request.analysis?.targetAcos ?? options.targetAcos, null);
  let rows;

  try {
    const rawRows = request.category === 'growth' && request.groupBy.includes('search_term')
      ? current.rows.map(row => ({ ...row, searchTerm: normalizeKeyword(row.searchTerm) }))
      : current.rows;

    rows = makeMetricRows(rawRows, {
      ...request,
      metrics: ANALYSIS_METRICS,
      filters: request.filters || [],
    }, profile, adType).rows;
  } catch (_) {
    result.missingInputs.push('Valid metrics and entity identities are required for opportunity analysis.');
    return result;
  }

  if (current.verification !== 'verified') {
    result.warnings.push('Observed rows have unverified import coverage; lists are provisional and may omit activity.');
  }

  if (request.category === 'waste') {
    analyzeWaste(context, result, rows, minClicks);
  } else {
    analyzeGrowth(context, result, rows, { minClicks, minOrders, minImpressions, targetAcos });
  }

  return result;
}

module.exports = { analyzeOpportunities, normalizeKeyword };
