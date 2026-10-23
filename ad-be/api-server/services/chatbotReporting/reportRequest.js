'use strict';

// Validate client selections before authorization and source queries begin.
const moment = require('moment-timezone');
const {
  validateReportRequest
} = require('../../contracts/chatbotReporting.contract');
const {
  REPORT_HANDLERS
} = require('./reportDefinitions');

function reportError(statusCode, code, message) {
  return Object.assign(new Error(message), {
    statusCode,
    code
  });
}

function prepareRequest(input) {
  let request;

  try {
    request = validateReportRequest(input);
  } catch (_) {
    throw reportError(400, 'INVALID_REPORT_REQUEST', 'Invalid reporting request');
  }

  const handler = REPORT_HANDLERS[request.category];
  const dimensions = request.groupBy.length ? request.groupBy : handler.defaults;

  if (dimensions.some(dimension => !handler.dimensions.includes(dimension))) {
    throw reportError(
      400,
      'UNSUPPORTED_REPORT_DIMENSION',
      'This report does not support the selected grouping'
    );
  }

  if (request.category === 'definition') {
    const hasAccountParameters = request.profileIds.length
      || request.entity
      || request.filters.length
      || request.sort
      || request.groupBy.length
      || request.offset
      || request.comparison.mode !== 'none';

    if (hasAccountParameters) {
      throw reportError(
        400,
        'UNSUPPORTED_DEFINITION_REQUEST',
        'Metric definitions do not accept account report filters or comparisons'
      );
    }

    return {
      request,
      handler
    };
  }

  const hasRuleAnalysisParameters = request.filters.length || request.sort;

  if (request.category === 'rules' && hasRuleAnalysisParameters) {
    throw reportError(
      400,
      'UNSUPPORTED_RULE_HISTORY_REQUEST',
      'Rule history does not support metric filtering or sorting'
    );
  }

  if (request.analysis?.includeMovers && !['summary', 'comparison', 'change'].includes(request.category)) {
    throw reportError(400, 'UNSUPPORTED_ANALYSIS_OPTION', 'Movers are supported for summaries and change reports');
  }

  if (request.sort && request.sort.field !== 'name' && !request.metrics.includes(request.sort.field)) {
    throw reportError(
      422,
      'UNSUPPORTED_SORT_METRIC',
      'Include the sort metric in the requested metrics'
    );
  }

  const leafDimensions = new Set(
    [...dimensions, request.entity?.dimension].filter(dimension => (
      ['keyword', 'target', 'search_term', 'placement'].includes(dimension)
    ))
  );

  if (leafDimensions.size > 1) {
    throw reportError(
      422,
      'MIXED_REPORT_GRAINS',
      'Request keyword, target, search-term and placement reports separately'
    );
  }

  const requestedMetrics = [
    ...request.metrics,
    ...request.filters.map(filter => filter.field)
  ];
  const needsProductInputs = requestedMetrics.some(metric => (
    ['profit', 'tacos', 'stock', 'days_of_stock'].includes(metric)
  ));

  if (handler.source === 'daily' && needsProductInputs) {
    throw reportError(
      422,
      'UNSUPPORTED_REPORT_METRIC',
      'Product financial and inventory metrics require the product report'
    );
  }

  const hasHourlyOrderFilter = request.filters.some(filter => (
    ['orders', 'cvr', 'aov'].includes(filter.field)
  ));

  if (request.category === 'time' && hasHourlyOrderFilter) {
    throw reportError(
      422,
      'UNSUPPORTED_HOURLY_FILTER',
      'Hourly orders are not validated; order-based filters cannot be applied'
    );
  }

  // Presentation is validated by the shared contract. Mapping happens after
  // calculations so every visual uses the same scoped values as its table.

  const periodCount = request.comparison.mode === 'none' ? 1 : 2;
  const sourceCount = request.profileIds.length * request.adTypes.length * periodCount;

  if (sourceCount > 20) {
    throw reportError(
      422,
      'REPORT_SCOPE_LIMIT',
      'Select fewer profiles or ad types: at most 20 profile/ad-type/period sources per request'
    );
  }

  // Passing explicit defaults to authorization prevents a hidden search-term or
  // hourly read from bypassing its page permission when groupBy was omitted.
  return {
    request: {
      ...request,
      groupBy: [...dimensions]
    },
    handler
  };
}

function sourceDimension(request, handler) {
  if (request.category === 'products') {
    return 'product';
  }

  if (handler.source === 'special') {
    return request.groupBy[0];
  }

  const priorities = [
    'search_term', 'keyword', 'target', 'placement',
    'ad_group', 'campaign', 'date', 'profile'
  ];

  return priorities.find(dimension => (
    request.groupBy.includes(dimension) || request.entity?.dimension === dimension
  ));
}

function assertPeriodBound(period) {
  const days = moment.utc(period.toDate).diff(moment.utc(period.fromDate), 'days') + 1;

  if (days > 92) {
    throw reportError(422, 'REPORT_DATE_LIMIT', 'Select at most 92 calendar dates per period');
  }
}

module.exports = {
  reportError,
  prepareRequest,
  sourceDimension,
  assertPeriodBound
};
