'use strict';

// Pure grouping, filtering and pagination of already scoped source rows.
const {
  aggregateTotals,
  calculateMetrics
} = require('../../helper/chatbotReporting.metrics');
const {
  METRIC_UNITS,
  DIMENSION_FIELDS
} = require('./reportDefinitions');

function groupingDimensions(request) {
  const dimensions = [...request.groupBy];

  // A keyword/target identifier can be reused in another campaign or ad group.
  // Keep its ancestors visible rather than merging unrelated entities by label.
  if (dimensions.some(dimension => ['keyword', 'target', 'search_term', 'ad_group'].includes(dimension))) {
    dimensions.unshift('campaign');
  }

  if (dimensions.some(dimension => ['keyword', 'target', 'search_term'].includes(dimension))) {
    dimensions.unshift('ad_group');
  }

  return [...new Set(dimensions)];
}

function metricMatches(value, filter) {
  if (value === null || value === undefined) {
    return false;
  }

  switch (filter.operator) {
    case 'eq':
      return value === filter.value;
    case 'neq':
      return value !== filter.value;
    case 'gt':
      return value > filter.value;
    case 'gte':
      return value >= filter.value;
    case 'lt':
      return value < filter.value;
    case 'lte':
      return value <= filter.value;
    default:
      return false;
  }
}

function makeMetricRows(rawRows, request, profile, adType) {
  const groups = new Map();
  const dimensions = groupingDimensions(request);

  for (const raw of rawRows) {
    const values = dimensions.map(dimension => {
      if (dimension === 'profile') {
        return profile.profileId;
      }

      const value = raw[DIMENSION_FIELDS[dimension]];

      if (value === undefined || value === null || value === '') {
        throw new Error('Missing grouping identity');
      }

      return String(value);
    });
    const key = JSON.stringify(values);

    if (!groups.has(key)) {
      groups.set(key, {
        values,
        rows: []
      });
    }

    groups.get(key).rows.push(raw);
  }

  const result = [];
  let hasRequestedMetrics = false;

  for (const group of groups.values()) {
    const metrics = calculateMetrics(aggregateTotals(group.rows));
    const row = {
      profileId: profile.profileId,
      adType
    };
    dimensions.forEach((dimension, index) => {
      row[DIMENSION_FIELDS[dimension]] = group.values[index];
    });
    // Keep the source's human-readable label; identifiers remain the group key.
    const profileAggregate = dimensions.every(dimension => ['profile', 'date'].includes(dimension));
    row.name = profileAggregate
      ? (row.date || 'Selected profile')
      : String(group.rows[0].name || group.values.join(' / ')).slice(0, 500);

    for (const metric of request.metrics) {
      row[metric] = metrics[metric]?.value ?? null;
    }

    if (request.metrics.some(metric => row[metric] !== null)) {
      hasRequestedMetrics = true;
    }

    const calculatedValues = Object.fromEntries(
      Object.entries(metrics).map(([metric, descriptor]) => [metric, descriptor.value])
    );

    if (request.filters.every(filter => metricMatches(calculatedValues[filter.field], filter))) {
      result.push(row);
    }
  }

  return {
    rows: result,
    hasRequestedMetrics
  };
}

function sortAndPage(rows, request) {
  const sorted = [...rows];
  const field = request.sort?.field;
  const direction = request.sort?.direction === 'desc' ? -1 : 1;
  sorted.sort((left, right) => {
    if (field) {
      const leftValue = left[field];
      const rightValue = right[field];

      // Missing values always sort last, for both directions.
      if (leftValue == null && rightValue != null) {
        return 1;
      }

      if (leftValue != null && rightValue == null) {
        return -1;
      }

      const bothAreNumbers = typeof leftValue === 'number' && typeof rightValue === 'number';
      const comparison = bothAreNumbers
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''));

      if (comparison) {
        return comparison * direction;
      }
    }

    return JSON.stringify(left).localeCompare(JSON.stringify(right));
  });

  return {
    rows: sorted.slice(request.offset, request.offset + request.limit),
    page: {
      offset: request.offset,
      limit: request.limit,
      total: rows.length,
      hasMore: request.offset + request.limit < rows.length
    }
  };
}

function metricColumns(request) {
  const dimensions = [...new Set([
    'profileId',
    'adType',
    ...groupingDimensions(request).map(dimension => DIMENSION_FIELDS[dimension]),
    'name'
  ])];

  return [...dimensions.map(key => ({
    key,
    label: key,
    type: key === 'date' ? 'date' : 'string'
  })), ...request.metrics.map(key => ({
    key,
    label: key,
    type: 'number',
    unit: METRIC_UNITS[key],
    nullable: true
  }))];
}

function ruleDatasetRows(rows) {
  const keys = ['profileId', 'adType', 'date', 'ruleId', 'ruleType', 'entityId', 'name', 'changeType', 'oldValue', 'newValue', 'status', 'ruleTime'];

  return rows.map(row => Object.fromEntries(keys.map(key => [key, String(row[key] ?? '').slice(0, 500)])));
}

module.exports = {
  makeMetricRows,
  sortAndPage,
  metricColumns,
  ruleDatasetRows
};
