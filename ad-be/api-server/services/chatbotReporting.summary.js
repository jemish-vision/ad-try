'use strict';

const { randomUUID } = require('node:crypto');
const moment = require('moment-timezone');
const {
  validateReportRequest,
  validateReportResponse,
  validateReportSelection,
} = require('../contracts/chatbotReporting.contract');
const {
  aggregateTotals,
  calculateMetrics,
  compareMetric,
} = require('../helper/chatbotReporting.metrics');
const { resolveReportPeriods } = require('../helper/chatbotReporting.dates');
const { resolveSummaryScope, checkCampaignReportPermission } = require('./chatbotReporting.scope');
const { readSummaryPeriods } = require('./chatbotReporting.repository');

const SUMMARY_METRICS = Object.freeze(['spend', 'sales', 'acos', 'roas', 'orders', 'cpc', 'cvr']);
const TITLES = {
  spend: 'Spend',
  sales: 'Attributed sales',
  acos: 'ACOS',
  roas: 'ROAS',
  orders: 'Orders',
  cpc: 'CPC',
  cvr: 'Conversion rate',
};

const identity = value => typeof value === 'string' ? value : value?.toHexString?.();
const failure = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

function validateSummaryRequest(input) {
  let request;

  try {
    request = validateReportRequest(input);
  } catch (_) {
    throw failure(400, 'INVALID_REPORT_REQUEST', 'Invalid reporting request');
  }


  const unsupportedScope = request.category !== 'summary' ||
    request.profileIds.length !== 1 || request.adTypes.length !== 1 || request.adTypes[0] !== 'SP';
  const unsupportedPeriod = request.period.preset !== 'yesterday' ||
    request.comparison.mode !== 'previous_period';
  const unsupportedMetrics = request.metrics.length !== SUMMARY_METRICS.length ||
    SUMMARY_METRICS.some(metric => !request.metrics.includes(metric));
  const unsupportedOptions = request.filters.length || request.groupBy.length ||
    request.entity || request.sort || request.analysis || request.offset !== 0 ||
    !['auto', 'number_card'].includes(request.presentation);

  if (unsupportedScope || unsupportedPeriod || unsupportedMetrics || unsupportedOptions) {
    throw failure(400, 'UNSUPPORTED_SUMMARY_REQUEST', 'This summary supports yesterday versus the previous day, one profile, SP and the seven summary metrics only');
  }


  return request;
}

function metricsFor(source) {
  if (!source || source.verification === 'conflict' ||
      (!source.rows?.length && source.verification !== 'verified')) {
    return null;
  }

  try {
    return calculateMetrics(aggregateTotals(source.rows));
  } catch (_) {
    return null;
  }
}

function missingMetricDescriptor(metric) {
  let unit = 'count';


  if (['spend', 'sales', 'cpc'].includes(metric)) {
    unit = 'currency';
  } else if (['acos', 'cvr'].includes(metric)) {
    unit = 'percent';
  } else if (metric === 'roas') {
    unit = 'multiple';
  }


  return { value: null, unit, status: 'missing_data' };
}

function buildSummaryCards(currentMetrics, previousMetrics, currencyCode) {
  return SUMMARY_METRICS.map(metric => {
    const descriptor = currentMetrics?.[metric] || missingMetricDescriptor(metric);

    return {
      id: metric,
      metric,
      title: TITLES[metric],
      ...descriptor,
      currencyCode,
      comparison: compareMetric(descriptor, previousMetrics?.[metric] || null),
    };
  });
}

function collectCoverageWarnings(current, previous, currentMetrics, previousMetrics) {
  const warnings = [];
  const missingInputs = [];


  for (const [label, source] of [['current', current], ['comparison', previous]]) {
    for (const warning of source?.warnings || []) {
      warnings.push(`${label}: ${warning}`);
    }


    if (!source || source.verification !== 'verified') {
      warnings.push(`${label}: Import coverage is not verified; observed rows are not proof of complete reporting.`);
      missingInputs.push(`${label} verified import coverage`);
    }
  }


  if (!currentMetrics) {
    missingInputs.push('current reliable campaign metrics');
  }


  if (!previousMetrics) {
    missingInputs.push('comparison reliable campaign metrics');
  }


  if (currentMetrics &&
      SUMMARY_METRICS.some(metric => currentMetrics[metric].status === 'missing_data')) {
    missingInputs.push('current raw metric fields');
  }


  if (previousMetrics &&
      SUMMARY_METRICS.some(metric => previousMetrics[metric].status === 'missing_data')) {
    missingInputs.push('comparison raw metric fields');
  }


  return { warnings, missingInputs };
}

function summaryStatus(unavailable, observedEmpty, complete) {
  if (unavailable) {
    return 'unavailable';
  }


  if (observedEmpty && complete) {
    return 'empty';
  }


  return complete ? 'ok' : 'partial';
}

function buildSummaryText(unavailable, observedEmpty, status, periods, profile) {
  if (unavailable) {
    return `A reliable SP summary for ${periods.current.fromDate} is unavailable. Missing or conflicting reporting data is not zero activity.`;
  }


  if (observedEmpty) {
    return 'No campaign rows were returned for either date by the verified imports as of the displayed timestamp.';
  }


  const partialWarning = status === 'partial'
    ? ' Reporting is incomplete or provisional; review the warnings before interpreting changes.'
    : '';

  return `SP campaign summary for ${periods.current.fromDate}, compared with ${periods.comparison.fromDate}. Values use ${profile.currencyCode} and ${profile.timezone}.${partialWarning}`;
}

function createSummaryService({
  db,
  checkReportPermission,
  resolveScope = resolveSummaryScope,
  readPeriods = readSummaryPeriods,
  now = () => new Date(),
  makeReportId = randomUUID,
} = {}) {
  return async function summary(input, authContext) {
    const request = validateSummaryRequest(input);

    if (!/^[a-f\d]{24}$/i.test(identity(authContext?.userId) || '') ||
        !/^[a-f\d]{24}$/i.test(identity(authContext?.configId) || '')) {
      throw failure(401, 'REPORT_IDENTITY_REQUIRED', 'Authenticated report identity is required');
    }

    const database = typeof db === 'function' ? db() : db || require('mongoose').connection.db;

    if (!database) {
      throw failure(503, 'REPORT_DATABASE_UNAVAILABLE', 'Reporting database is unavailable');
    }


    const permission = checkReportPermission || ((userId, orgId) =>
      checkCampaignReportPermission(userId, orgId, { db: database }));
    const scope = await resolveScope(request, authContext, {
      db: database,
      checkReportPermission: permission,
    });

    validateReportSelection(request, scope);
    const profile = scope.profiles[0];
    const capturedNow = now();
    const periods = resolveReportPeriods(request.period, request.comparison, {
      timezone: profile.timezone,
      now: capturedNow,
    });

    let sources;

    try {
      sources = await readPeriods({ db: database, scope, periods });
    } catch (error) {
      if (error?.code === 'REPORT_ROW_LIMIT') {
        throw failure(422, 'REPORT_ROW_LIMIT', 'Campaign summary exceeds the supported row limit');
      }

      throw failure(503, 'REPORT_SOURCE_UNAVAILABLE', 'Reporting data could not be read');
    }


    const current = sources.current;
    const previous = sources.comparison;
    const currentMetrics = metricsFor(current);

    // Never give an unverified prior period the appearance of verified growth.
    const previousMetrics = previous?.verification === 'verified' ? metricsFor(previous) : null;
    const { warnings, missingInputs } = collectCoverageWarnings(
      current,
      previous,
      currentMetrics,
      previousMetrics,
    );

    const observedEmpty = current?.verification === 'verified' &&
      previous?.verification === 'verified' && !current.rows.length && !previous.rows.length;
    const localNow = moment(capturedNow).tz(profile.timezone);
    const attributionDays = profile.attributionWindows.SP;
    const provisional = !observedEmpty && localNow.diff(
      moment.tz(periods.current.toDate, 'YYYY-MM-DD', profile.timezone),
      'days',
    ) < attributionDays;

    if (provisional) {
      warnings.push(`Attributed sales and orders are provisional within this profile's ${attributionDays}-day SP attribution window. Comparisons describe currently imported figures, not final results.`);
    }


    const complete = !missingInputs.length && !warnings.length;
    const unavailable = !currentMetrics;
    const status = summaryStatus(unavailable, observedEmpty, complete);
    const cards = buildSummaryCards(currentMetrics, previousMetrics, profile.currencyCode);
    const refs = new Map();


    for (const source of [current, previous]) {
      for (const ref of source?.sourceRefs || []) {
        refs.set(`${ref.name}:${ref.importRunId || ''}`, ref);
      }
    }


    const timestamps = [current?.dataAsOf, previous?.dataAsOf]
      .filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))
      .sort();
    const text = buildSummaryText(unavailable, observedEmpty, status, periods, profile);

    return validateReportResponse({
      schemaVersion: '1.0',
      reportId: makeReportId(),
      category: 'summary',
      dataOrigin: 'reporting',
      status,
      scope,
      periods: [{ profileId: profile.profileId, ...periods }],
      freshness: {
        status: unavailable ? 'unavailable' : status === 'partial' ? 'partial' : 'complete',
        dataAsOf: timestamps[0] || null,
        sourceRefs: [...refs.values()],
        missingInputs,
      },
      text,
      cards,
      datasets: [],
      blocks: [
        { type: 'text', text },
        ...cards.map(card => ({ type: 'number_card', metricId: card.id })),
      ],
      warnings,
      followUps: [],
    });
  };
}

module.exports = { createSummaryService, validateSummaryRequest, SUMMARY_METRICS };
