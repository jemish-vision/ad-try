'use strict';

// Analysis uses imported totals only. It never reads a database or calls an AI.
const {
  aggregateTotals,
  calculateMetrics,
  compareMetric
} = require('../../helper/chatbotReporting.metrics');
const { DIMENSION_FIELDS, METRIC_UNITS } = require('./reportDefinitions');

const EVIDENCE_METRICS = ['cpc', 'cvr', 'impressions', 'ctr', 'aov'];

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

function hasVerifiedCoverage(source) {
  return source?.verification === 'verified' &&
    !source.warnings?.length && !source.missingInputs?.length;
}

function sourceMetrics(source) {
  if (!source || source.verification === 'conflict' || !Array.isArray(source.rows)) {
    return null;
  }

  if (!source.rows.length && !hasVerifiedCoverage(source)) {
    return null;
  }

  try {
    return calculateMetrics(aggregateTotals(source.rows));
  } catch {
    return null;
  }
}

function matchedWindows(periods) {
  const current = periods?.current;
  const comparison = periods?.comparison;

  if (!current || !comparison || current.isPartial || comparison.isPartial) {
    return false;
  }

  // Compare calendar-day counts, so daylight-saving transitions stay valid.
  const days = window => Date.parse(window.toDate) - Date.parse(window.fromDate);

  return Number.isFinite(days(current)) && days(current) === days(comparison) &&
    Date.parse(comparison.endBefore) <= Date.parse(current.startAt);
}

function createCards(request, profile, adType, metrics, previous, idPrefix) {
  return request.metrics.filter(metric => Object.hasOwn(METRIC_UNITS, metric)).map(metric => {
    const descriptor = metrics?.[metric] || {
      value: null,
      status: 'missing_data',
      unit: METRIC_UNITS[metric]
    };

    return {
      id: `${idPrefix}_${metric}`,
      metric,
      title: `${profile.profileId} ${adType}: ${metric.toUpperCase()}`,
      value: descriptor.value,
      status: descriptor.status,
      unit: descriptor.unit,
      currencyCode: profile.currencyCode,
      comparison: compareMetric(descriptor, previous?.[metric])
    };
  });
}

function entityDimensions(request) {
  const requested = request.groupBy || [];
  const entity = requested.find(dimension => ['keyword', 'target', 'search_term', 'placement', 'ad_group'].includes(dimension));

  if (['keyword', 'target', 'search_term'].includes(entity)) {
    return ['campaign', 'ad_group', entity];
  }

  return entity ? ['campaign', entity] : ['campaign'];
}

function groupEntities(rows, dimensions) {
  const groups = new Map();

  for (const row of rows) {
    const identities = dimensions.map(dimension => row[DIMENSION_FIELDS[dimension]]);

    if (identities.some(value => value == null || String(value).trim() === '')) {
      return null;
    }

    const key = JSON.stringify(identities.map(String));

    if (!groups.has(key)) {
      groups.set(key, {
        rows: [],
        identity: Object.fromEntries(dimensions.map((dimension, index) => [
          DIMENSION_FIELDS[dimension],
          String(identities[index])
        ])),
        name: String(row.name || identities.join(' / ')).slice(0, 500)
      });
    }

    groups.get(key).rows.push(row);
  }

  for (const group of groups.values()) {
    group.metrics = calculateMetrics(aggregateTotals(group.rows));
  }

  return groups;
}

function numericColumn(key, unit, nullable = true) {
  return { key, label: key, type: 'number', unit, nullable };
}

function addTable(result, id, title, rows, columns, currencyCode, limit = 3) {
  result.datasets.push({
    id,
    currencyCode,
    columns,
    rows: rows.slice(0, limit),
    page: { offset: 0, limit, total: rows.length, hasMore: rows.length > limit }
  });
  result.blocks.push({ type: 'table', title, datasetId: id, sortable: true });
}

function describeChange(metric, current, previous) {
  const change = compareMetric(current, previous);

  if (change.absoluteChange === null) {
    return `${metric.toUpperCase()} change is unavailable.`;
  }

  if (change.absoluteChange === 0) {
    return `${metric.toUpperCase()} did not change.`;
  }

  const direction = change.absoluteChange > 0 ? 'increased' : 'decreased';
  const amount = current.unit === 'percent'
    ? `${Math.abs(change.absoluteChange).toFixed(2)} percentage points`
    : `${Math.abs(change.absoluteChange).toFixed(2)} ${current.unit}`;

  return `${metric.toUpperCase()} ${direction} by ${amount}.`;
}

function addMovers(result, context, metrics, previousMetrics) {
  const { request, current, comparison, profile, idPrefix } = context;
  const dimensions = entityDimensions(request);
  let currentGroups;
  let previousGroups;

  try {
    currentGroups = groupEntities(current.rows, dimensions);
    previousGroups = groupEntities(comparison.rows, dimensions);
  } catch {
    currentGroups = null;
  }

  if (!currentGroups || !previousGroups) {
    result.missingInputs.push('Complete entity identities and valid totals are required to rank movers.');
    return;
  }

  const metric = request.category === 'change' ? request.metrics[0] : 'sales';

  if (!metrics[metric] || !previousMetrics[metric]) {
    result.missingInputs.push('The requested change metric is unavailable from advertising totals.');
    return;
  }
  const keys = new Set([...currentGroups.keys(), ...previousGroups.keys()]);
  const zeroMetrics = calculateMetrics(aggregateTotals([]));
  const rows = [];

  for (const key of keys) {
    const currentGroup = currentGroups.get(key);
    const previousGroup = previousGroups.get(key);
    const currentValues = currentGroup?.metrics || zeroMetrics;
    const previousValues = previousGroup?.metrics || zeroMetrics;
    const change = compareMetric(currentValues[metric], previousValues[metric]);

    // Verified complete windows allow an absent entity to represent no activity.
    if (change.absoluteChange === null || change.absoluteChange === 0) {
      continue;
    }

    const group = currentGroup || previousGroup;
    const row = {
      ...group.identity,
      name: group.name,
      currentValue: currentValues[metric].value,
      previousValue: previousValues[metric].value,
      absoluteChange: change.absoluteChange
    };

    for (const evidence of EVIDENCE_METRICS) {
      row[`${evidence}Current`] = currentValues[evidence].value;
      row[`${evidence}Previous`] = previousValues[evidence].value;
    }

    rows.push(row);
  }

  rows.sort((left, right) => Math.abs(right.absoluteChange) - Math.abs(left.absoluteChange) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const columns = dimensions.map(dimension => ({
    key: DIMENSION_FIELDS[dimension], label: dimension, type: 'string'
  }));
  columns.push({ key: 'name', label: 'Name', type: 'string' });

  for (const key of ['currentValue', 'previousValue', 'absoluteChange']) {
    columns.push(numericColumn(key, METRIC_UNITS[metric]));
  }

  for (const evidence of EVIDENCE_METRICS) {
    columns.push(numericColumn(`${evidence}Current`, METRIC_UNITS[evidence]));
    columns.push(numericColumn(`${evidence}Previous`, METRIC_UNITS[evidence]));
  }

  addTable(result, `${idPrefix}_movers`, `Biggest ${metric} movers`, rows, columns, profile.currencyCode);
  result.text.push(describeChange(metric, metrics[metric], previousMetrics[metric]));
  result.text.push(rows.length
    ? 'Movers are ranked by absolute change after aggregating each entity across the period. CPC, conversion, impressions, CTR and order value are supporting associations, not proof of causation.'
    : 'No entity with a measurable change was found.');

  if (metric === 'acos' && metrics.acos.value > previousMetrics.acos.value) {
    const associations = [];

    if (metrics.cpc.value > previousMetrics.cpc.value && previousMetrics.cpc.value !== null) {
      associations.push('higher CPC');
    }

    if (metrics.cvr.value !== null && metrics.cvr.value < previousMetrics.cvr.value) {
      associations.push('lower conversion rate');
    }

    if (metrics.aov.value !== null && metrics.aov.value < previousMetrics.aov.value) {
      associations.push('lower average order value');
    }

    if (associations.length) {
      result.text.push(`The ACOS increase coincided with ${associations.join(', ')}. Review entity-level evidence before deciding what to change.`);
    }
  }

  if (metric === 'sales' && metrics.sales.value < previousMetrics.sales.value) {
    const associations = [];

    if (metrics.cvr.value !== null && previousMetrics.cvr.value !== null && metrics.cvr.value < previousMetrics.cvr.value) {
      associations.push(`lower conversion rate (${metrics.cvr.value.toFixed(1)}% vs ${previousMetrics.cvr.value.toFixed(1)}%)`);
    }

    if (metrics.impressions.value !== null && previousMetrics.impressions.value !== null && metrics.impressions.value < previousMetrics.impressions.value) {
      const impChange = Math.round((metrics.impressions.value - previousMetrics.impressions.value) / previousMetrics.impressions.value * 100);
      associations.push(`fewer impressions (${impChange}%)`);
    }

    if (metrics.clicks.value !== null && previousMetrics.clicks.value !== null && metrics.clicks.value < previousMetrics.clicks.value) {
      const clickChange = Math.round((metrics.clicks.value - previousMetrics.clicks.value) / previousMetrics.clicks.value * 100);
      associations.push(`fewer clicks (${clickChange}%)`);
    }

    if (metrics.aov.value !== null && previousMetrics.aov.value !== null && metrics.aov.value < previousMetrics.aov.value) {
      associations.push('lower average order value');
    }

    if (metrics.spend.value !== null && previousMetrics.spend.value !== null && metrics.spend.value < previousMetrics.spend.value) {
      associations.push('lower ad spend');
    }

    if (associations.length) {
      result.text.push(`The sales decrease coincided with ${associations.join(', ')}. Review entity-level evidence before deciding what to change.`);
    }
  }

  if (metric === 'orders' && metrics.orders.value < previousMetrics.orders.value) {
    const associations = [];
    if (metrics.cvr.value !== null && previousMetrics.cvr.value !== null && metrics.cvr.value < previousMetrics.cvr.value) {
      associations.push('lower conversion rate');
    }
    if (metrics.clicks.value !== null && previousMetrics.clicks.value !== null && metrics.clicks.value < previousMetrics.clicks.value) {
      associations.push('fewer clicks');
    }
    if (associations.length) {
      result.text.push(`The order decrease coincided with ${associations.join(', ')}.`);
    }
  }

  if (metric === 'cpc' && metrics.cpc.value > previousMetrics.cpc.value) {
    result.text.push(`CPC increased from ${previousMetrics.cpc.value.toFixed(2)} to ${metrics.cpc.value.toFixed(2)}.`);
  }

  if (rows.length) {
    const top3 = rows.slice(0, 3).map((r, i) => {
      const changeSign = r.absoluteChange > 0 ? '+' : '';
      const unit = METRIC_UNITS[metric];
      const changeStr = unit === 'currency'
        ? `${changeSign}${profile.currencyCode || ''} ${Number(r.absoluteChange).toFixed(2)}`
        : unit === 'percent'
        ? `${changeSign}${Number(r.absoluteChange).toFixed(1)} percentage points`
        : `${changeSign}${Number(r.absoluteChange)}`;
      return `${i + 1}. ${r.name}: Change of ${changeStr}`;
    });
    result.text.push(`Top 3 movers:\n${top3.join('\n')}`);
  }
}

function recentSource(source, now, maxHours) {
  const timestamp = Date.parse(source?.dataAsOf);
  const age = new Date(now).getTime() - timestamp;

  return Number.isFinite(age) && age >= 0 && age <= maxHours * 3600000;
}

function addUnusualChanges(result, context) {
  const { options = {}, current, comparison, now, profile, idPrefix, request } = context;
  const changePercent = options.changePercent ?? 50;
  const minClicks = options.minClicks ?? 20;
  const minImpressions = options.minImpressions ?? 100;
  const maxHours = options.maxDataAgeHours ?? 48;

  if (!recentSource(current, now, maxHours) || !recentSource(comparison, now, maxHours)) {
    result.missingInputs.push('Fresh import timestamps for both periods are required to flag unusual changes.');
    return;
  }

  let currentGroups;
  let previousGroups;

  try {
    currentGroups = groupEntities(current.rows, entityDimensions(request));
    previousGroups = groupEntities(comparison.rows, entityDimensions(request));
  } catch {
    currentGroups = null;
  }

  if (!currentGroups || !previousGroups) {
    result.missingInputs.push('Complete entity identities and valid totals are required to flag unusual changes.');
    return;
  }

  const rows = [];

  for (const [key, previousGroup] of previousGroups) {
    const metrics = currentGroups.get(key)?.metrics || calculateMetrics(aggregateTotals([]));
    const previousMetrics = previousGroup.metrics;

  for (const metric of ['cpc', 'impressions', 'spend']) {
    const change = compareMetric(metrics[metric], previousMetrics[metric]);
    const enoughVolume = metric === 'impressions'
      ? previousMetrics.impressions.value >= minImpressions
      : previousMetrics.clicks.value >= minClicks;
    const enoughCurrentClicks = metric !== 'cpc' || metrics.clicks.value >= minClicks;

    if (!enoughVolume || !enoughCurrentClicks || change.status !== 'comparable' ||
      Math.abs(change.relativeChangePercent) < changePercent) {
      continue;
    }

    rows.push({
      name: previousGroup.name,
      identity: JSON.stringify(previousGroup.identity),
      metric,
      direction: change.absoluteChange > 0 ? 'spike' : metric === 'spend' && metrics.spend.value === 0 ? 'stopped spending' : 'drop',
      previousValue: previousMetrics[metric].value,
      currentValue: metrics[metric].value,
      changePercent: change.relativeChangePercent
    });
  }
  }

  rows.sort((left, right) => Math.abs(right.changePercent) - Math.abs(left.changePercent) ||
    left.identity.localeCompare(right.identity) || left.metric.localeCompare(right.metric));

  // Different metric units stay in labelled text, not one mixed-unit numeric axis.
  const displayRows = rows.map(row => ({
    name: row.name,
    identity: row.identity,
    metric: row.metric,
    direction: row.direction,
    previousValue: `${row.previousValue} ${METRIC_UNITS[row.metric]}`,
    currentValue: `${row.currentValue} ${METRIC_UNITS[row.metric]}`,
    changePercent: row.changePercent
  }));
  const columns = ['name', 'identity', 'metric', 'direction', 'previousValue', 'currentValue'].map(key => ({
    key, label: key, type: 'string'
  }));
  columns.push(numericColumn('changePercent', 'percent', false));

  addTable(result, `${idPrefix}_unusual`, 'Unusual entity changes', displayRows,
    columns, profile.currencyCode, 100);
  result.text.push(rows.length
    ? `Found ${rows.length} changes meeting the configured ${changePercent}% threshold. These are review signals, not causal explanations.`
    : 'No unusual change met the configured threshold and volume requirements.');
}

function analyzePerformance(context) {
  const result = emptyAnalysis();
  const { request, profile, adType, current, comparison, periods, idPrefix } = context;
  const metrics = sourceMetrics(current);
  const previousMetrics = sourceMetrics(comparison);

  // Observed rows can supply provisional totals, but cannot prove that an
  // absent campaign had zero activity. Mover rankings require full coverage.
  const currentCoverage = hasVerifiedCoverage(current);
  const comparisonCoverage = hasVerifiedCoverage(comparison);
  const knownAttribution = Number.isFinite(profile.attributionWindows?.[adType]);

  const canCompare = currentCoverage && comparisonCoverage &&
    matchedWindows(periods) && knownAttribution && metrics && previousMetrics;

  result.cards = createCards(request, profile, adType, metrics, canCompare ? previousMetrics : null, idPrefix);
  result.blocks = result.cards.map(card => ({ type: 'number_card', metricId: card.id }));

  if (!metrics) {
    result.missingInputs.push('Usable current-period reporting totals are unavailable.');
  } else if (!hasVerifiedCoverage(current)) {
    result.warnings.push('Current totals are observed imported rows; complete source coverage is unverified.');
  }

  const needsComparison = request.category !== 'summary' || request.analysis?.includeMovers ||
    request.comparison?.mode && request.comparison.mode !== 'none';

  if (needsComparison && !canCompare) {
    result.missingInputs.push('Verified, conflict-free, matched reporting periods with known attribution are required for changes and mover rankings.');
    result.text.push('Changes are withheld because the two periods cannot be compared reliably.');
    return result;
  }

  if (canCompare && (request.category === 'change' || request.analysis?.includeMovers)) {
    addMovers(result, context, metrics, previousMetrics);
  }

  if (canCompare && request.category === 'unusual') {
    addUnusualChanges(result, context, metrics, previousMetrics);
  }

  return result;
}

module.exports = { analyzePerformance };
