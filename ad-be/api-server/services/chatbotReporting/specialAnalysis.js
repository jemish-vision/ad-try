'use strict';

const moment = require('moment-timezone');
const { aggregateTotals, calculateMetrics } = require('../../helper/chatbotReporting.metrics');
const { METRIC_UNITS } = require('./reportDefinitions');
const { sortAndPage } = require('./reportTable');

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const RATIO_METRICS = new Set(['acos', 'roas', 'cpc', 'cvr', 'ctr', 'aov']);
const PRODUCT_INPUTS = {
  profit: 'Profit requires reconciled total product sales, product costs, fees and complete ad spend.',
  tacos: 'TACOS requires reconciled total product sales including organic and complete ad spend.',
  stock: 'Stock requires fresh sellable inventory joined to advertised ASIN/SKU identities.',
  days_of_stock: 'Days of stock requires fresh sellable inventory and validated sales velocity.'
};

function emptyAnalysis() {
  return {
    cards: [],
    datasets: [],
    blocks: [],
    warnings: [],
    missingInputs: [],
    text: [],
    followUps: []
  };
}

function matchesFilters(metrics, filters = []) {
  return filters.every(filter => {
    const value = metrics[filter.field]?.value;

    if (value === null || value === undefined) {
      return false;
    }

    switch (filter.operator) {
      case 'eq': return value === filter.value;
      case 'neq': return value !== filter.value;
      case 'gt': return value > filter.value;
      case 'gte': return value >= filter.value;
      case 'lt': return value < filter.value;
      case 'lte': return value <= filter.value;
      default: return false;
    }
  });
}

function addDataset(result, dataset, title, block = {}) {
  result.datasets.push(dataset);
  result.blocks.push({ type: 'table', title, datasetId: dataset.id, sortable: true, ...block });
}

function numericColumn(key, label, metric) {
  return { key, label, type: 'number', unit: METRIC_UNITS[metric], nullable: true };
}

function groupTimeRows(rows, dimensions) {
  const groups = new Map();

  for (const row of rows) {
    const values = dimensions.map(dimension => String(row[dimension]));
    const key = JSON.stringify(values);

    if (!groups.has(key)) {
      groups.set(key, { values, rows: [] });
    }

    groups.get(key).rows.push(row);
  }

  return [...groups.values()].map(group => ({
    ...group,
    totals: aggregateTotals(group.rows),
    metrics: calculateMetrics(aggregateTotals(group.rows))
  }));
}

function expectedDatesByWeekday(period) {
  const dates = Array.from({ length: 7 }, () => new Set());
  const date = moment.utc(period.fromDate, 'YYYY-MM-DD', true);
  const end = moment.utc(period.toDate, 'YYYY-MM-DD', true);

  while (date.isSameOrBefore(end, 'day')) {
    dates[date.isoWeekday() - 1].add(date.format('YYYY-MM-DD'));
    date.add(1, 'day');
  }

  return dates;
}

function timeGrid(rows, acceptedRows, period, metric, minClicks) {
  const groups = groupTimeRows(rows, ['weekday', 'hour']);
  const accepted = new Set(acceptedRows);
  const expectedDates = expectedDatesByWeekday(period);
  const cells = [];

  for (let weekday = 1; weekday <= 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const group = groups.find(item => Number(item.values[0]) === weekday && Number(item.values[1]) === hour);
      const selected = group?.rows.filter(row => accepted.has(row)) || [];
      const metrics = selected.length ? calculateMetrics(aggregateTotals(selected)) : null;
      const totals = selected.length ? aggregateTotals(selected) : null;
      const observedDates = new Set(selected.map(row => row.date));
      let status = 'observed';

      if (!expectedDates[weekday - 1].size) {
        status = 'not_in_period';
      } else if (!group) {
        status = 'missing';
      } else if (!selected.length) {
        status = 'filtered';
      } else if (metrics[metric]?.value == null) {
        status = 'metric_unavailable';
      } else if (RATIO_METRICS.has(metric) && (totals.clicks === null || totals.clicks < minClicks)) {
        status = 'insufficient_sample';
      } else if (observedDates.size < expectedDates[weekday - 1].size) {
        status = 'partial_coverage';
      }

      cells.push({
        hour: String(hour).padStart(2, '0'),
        weekday: WEEKDAYS[weekday - 1],
        value: ['observed', 'partial_coverage'].includes(status) ? metrics?.[metric]?.value ?? null : null,
        status
      });
    }
  }

  return cells;
}

function analyzeTime(input, result) {
  const { request, current, profile, periods, idPrefix, options } = input;
  const minClicks = Number.isSafeInteger(options.minClicks) && options.minClicks > 0 ? options.minClicks : 20;
  const metric = request.sort?.field && request.sort.field !== 'name' ? request.sort.field : request.metrics[0];
  const dimensions = request.groupBy.length ? request.groupBy : ['weekday', 'hour'];

  result.warnings.push(`Time rankings require at least ${minClicks} observed clicks per group. Ratios use summed inputs, not averages of row ratios.`);
  result.warnings.push('Hourly coverage is observed only; absent hours remain unknown. Compare equal calendar windows and account for attribution lag before creating dayparting rules.');

  // Hourly orders/sales are Amazon's 7-day attributed figures (a provisional
  // conversion proxy). The source already nulls them when the profile attribution
  // window does not match the hourly 7-day data, so keep the values here.
  const rows = current.rows.map(row => ({
    ...row,
    sales: current.warnings?.includes('HOURLY_ATTRIBUTION_WINDOW_MISMATCH') ? null : row.sales
  }));
  const groups = groupTimeRows(rows, dimensions);
  const qualifying = groups.filter(group => matchesFilters(group.metrics, request.filters));
  const acceptedRows = qualifying.flatMap(group => group.rows);
  const ranked = qualifying.filter(group => group.totals.clicks >= minClicks && group.metrics[metric]?.value != null);
  const rankingRows = ranked.map(group => ({
    name: group.values.join(' / '),
    value: group.metrics[metric].value,
    clicks: group.totals.clicks
  }));
  const lowerIsBetter = ['acos', 'cpc', 'spend'].includes(metric);
  const direction = request.sort?.direction || (lowerIsBetter ? 'asc' : 'desc');
  const rankingPage = sortAndPage(rankingRows, {
    ...request,
    sort: { field: 'value', direction }
  });

  if (rankingRows.length) {
    addDataset(result, {
      id: `${idPrefix}_time_rank`,
      currencyCode: profile.currencyCode,
      columns: [
        { key: 'name', label: dimensions.join(' / '), type: 'string' },
        numericColumn('value', metric, metric),
        numericColumn('clicks', 'Observed clicks', 'clicks')
      ],
      ...rankingPage
    }, `Observed time groups ranked by ${metric}`);
  } else {
    result.text.push(`No observed time group has both a usable ${metric} value and the minimum ${minClicks} clicks. This does not establish that the excluded groups perform poorly.`);
  }

  const grid = timeGrid(rows, acceptedRows, periods.current, metric, minClicks);
  result.datasets.push({
    id: `${idPrefix}_time_grid`,
    currencyCode: profile.currencyCode,
    columns: [
      { key: 'hour', label: 'Profile-local hour', type: 'string' },
      { key: 'weekday', label: 'Weekday', type: 'string' },
      numericColumn('value', metric, metric),
      { key: 'status', label: 'Cell coverage / eligibility', type: 'string' }
    ],
    rows: grid
  });
  result.blocks.push({
    type: 'heatmap',
    title: `Observed ${metric} by profile-local weekday and hour`,
    datasetId: `${idPrefix}_time_grid`,
    xKey: 'hour',
    yKeys: ['weekday'],
    valueKey: 'value'
  });

  if (request.metrics.some(value => ['orders', 'cvr', 'aov'].includes(value))) {
    result.warnings.push('Hourly conversion uses Amazon 7-day attributed units per click, not settled orders; treat the best-converting times as provisional.');
  }

  result.text.push('Time cells distinguish observed, partial coverage, filtered, insufficient sample, missing and weekdays outside the requested period. Low ACOS or CPC alone does not establish the best conversion time.');
}

function analyzeProducts({ request, current }, result) {
  const explanations = {
    profit: 'Product profit is not available yet. It needs total sales, product costs, selling fees and advertising spend. Ad sales minus ad spend is not net product profit.',
    tacos: 'Product TACOS is not available yet. It needs total product sales, including organic sales, matched to advertising spend for the same dates.',
    stock: 'Low-stock products cannot be identified yet because up-to-date sellable inventory is not connected to the advertised products.',
    days_of_stock: 'Days of stock is not available yet. It needs up-to-date sellable inventory and reliable daily product sales.'
  };

  for (const metric of request.metrics) {
    if (PRODUCT_INPUTS[metric]) {
      result.missingInputs.push(PRODUCT_INPUTS[metric]);
      result.text.push(explanations[metric]);
    }
  }

  if (!request.metrics.some(metric => PRODUCT_INPUTS[metric])) {
    result.text.push('These figures show sales and activity attributed to product advertising.');
  }

  if (current.rows.length) {
    result.warnings.push('Advertising product rows alone cannot establish profitability, TACOS, low stock or days of stock.');
  }
}

function ruleEvidenceStatus(row) {
  // Snapshots describe recorded settings. Only independently verified execution
  // evidence could promote a record to an attempted/applied/failed action.
  if (row.executionVerified === true && ['applied', 'attempted', 'failed'].includes(row.status)) {
    return row.status;
  }

  return 'history_snapshot';
}

function analyzeRules({ request, current, comparison, profile, idPrefix }, result) {
  const rows = current.rows.map(row => ({
    ruleId: String(row.ruleId || ''),
    entityId: String(row.entityId || ''),
    date: String(row.date || ''),
    changeType: String(row.changeType || ''),
    oldValue: String(row.oldValue ?? ''),
    newValue: String(row.newValue ?? ''),
    evidence: ruleEvidenceStatus(row)
  }));

  if (rows.length) {
    addDataset(result, {
      id: `${idPrefix}_rule_evidence`,
      currencyCode: profile.currencyCode,
      columns: Object.keys(rows[0]).map(key => ({ key, label: key, type: 'string' })),
      ...sortAndPage(rows, { ...request, sort: undefined })
    }, 'Rule records classified by execution evidence');
  }

  result.text.push('Rule history lists recorded old and new settings. A history snapshot is not proof that Amazon applied the action.');
  result.missingInputs.push('Rule effectiveness requires a verified applied event with timestamp and equal, complete before/after performance windows.');
  result.warnings.push('Other rules, overlapping changes, seasonality and attribution lag can affect a before/after comparison; a comparison alone cannot prove a rule caused the change.');

  if (comparison || request.comparison?.mode !== 'none') {
    result.text.push('Rule effectiveness is unavailable: this source does not join confirmed applied events to comparable before/after advertising performance.');
  }
}

function analyzeSpecial(input) {
  const result = emptyAnalysis();
  const normalized = {
    ...input,
    options: input.options || {},
    idPrefix: input.idPrefix || 'special',
    current: input.current || { rows: [] }
  };

  if (normalized.current.verification === 'conflict') {
    result.missingInputs.push('Conflict-free source rows are required for analysis.');
    return result;
  }

  if (input.request.category === 'products') {
    analyzeProducts(normalized, result);
  } else if (input.request.category === 'rules') {
    analyzeRules(normalized, result);
  } else if (input.request.category === 'time' && normalized.current.rows.length) {
    analyzeTime(normalized, result);
  } else if (input.request.category === 'time') {
    result.missingInputs.push('Observed hourly rows are required; missing hours are not zero activity.');
  }

  return result;
}

module.exports = { analyzeSpecial };
