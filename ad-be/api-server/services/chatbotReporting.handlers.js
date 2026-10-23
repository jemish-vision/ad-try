'use strict';

const { randomUUID } = require('node:crypto');
const moment = require('moment-timezone');
const { validateReportSelection } = require('../contracts/chatbotReporting.contract');
const { resolveReportPeriods } = require('../helper/chatbotReporting.dates');
const { resolveReportScope, checkReportPagePermission } = require('./chatbotReporting.scope');
const { readDailyReport } = require('./chatbotReporting.daily');
const { readSpecialReport } = require('./chatbotReporting.special');
const { REPORT_HANDLERS } = require('./chatbotReporting/reportDefinitions');
const {
  prepareRequest,
  reportError,
  sourceDimension,
  assertPeriodBound,
} = require('./chatbotReporting/reportRequest');
const {
  makeMetricRows,
  sortAndPage,
  metricColumns,
  ruleDatasetRows,
} = require('./chatbotReporting/reportTable');
const {
  glossaryReport,
  createReportState,
  buildReportResponse,
} = require('./chatbotReporting/reportResponse');
const { analyzeReport, appendAnalysis } = require('./chatbotReporting/reportAnalysis');
const { readKeywordInventory } = require('./chatbotReporting/keywordInventory');

function requireAuthenticatedIdentity(authContext) {
  const identity = value => typeof value === 'string' ? value : value?.toHexString?.();
  const hasUser = /^[a-f\d]{24}$/i.test(identity(authContext?.userId) || '');
  const hasConfig = /^[a-f\d]{24}$/i.test(identity(authContext?.configId) || '');

  if (!hasUser || !hasConfig) {
    throw reportError(401, 'REPORT_IDENTITY_REQUIRED', 'Authenticated report identity is required');
  }
}

function validateSelection(request, scope) {
  try {
    validateReportSelection(request, scope);
  } catch (error) {
    if (error.code === 'REPORT_CURRENCY_MISMATCH') {
      throw Object.assign(reportError(400, error.code, 'Use a threshold in the selected profile currency'), {
        currencyCode: error.currencyCode,
      });
    }
    throw reportError(400, 'UNSUPPORTED_REPORT_SELECTION', 'Requested scope, dimensions or filter currencies are unsupported');
  }
}

function resolvePeriods(request, scope, handler, capturedNow) {
  let periods;
  const warnings = [];

  try {
    periods = scope.profiles.map(profile => {
      const options = {
        timezone: profile.timezone,
        now: capturedNow,
      };
      let resolved = resolveReportPeriods(request.period, request.comparison, options);

      // Daily and hourly reports can answer week-to-date through yesterday. Make that
      // boundary explicit, keeping the same completed weekdays last week.
      const canUseCompletedWeek = (handler.source === 'daily' || request.category === 'time')
        && request.period.preset === 'this_week'
        && request.comparison.mode !== 'custom'
        && resolved.current.fromDate < resolved.current.toDate;

      if (canUseCompletedWeek) {
        const lastCompletedDate = moment.tz(resolved.current.toDate, profile.timezone)
          .subtract(1, 'day').format('YYYY-MM-DD');
        const completedPeriod = {
          preset: 'custom',
          fromDate: resolved.current.fromDate,
          toDate: lastCompletedDate,
        };
        const comparison = request.comparison.mode === 'none'
          ? { mode: 'none' }
          : {
            mode: 'custom',
            fromDate: moment.tz(completedPeriod.fromDate, profile.timezone).subtract(7, 'days').format('YYYY-MM-DD'),
            toDate: moment.tz(lastCompletedDate, profile.timezone).subtract(7, 'days').format('YYYY-MM-DD'),
          };

        resolved = resolveReportPeriods(completedPeriod, comparison, options);
        warnings.push(`${profile.profileId}: This week includes completed days through ${lastCompletedDate}; today is still updating.`);
      }

      return { profileId: profile.profileId, ...resolved };
    });
  } catch (_) {
    throw reportError(400, 'INVALID_REPORT_PERIOD', 'Use valid, non-overlapping past periods with matching comparison lengths');
  }

  for (const profilePeriods of periods) {
    const windows = [profilePeriods.current, profilePeriods.comparison].filter(Boolean);

    for (const period of windows) {
      assertPeriodBound(period);

    }
  }

  return { periods, warnings };
}

function unavailablePartialSource() {
  return {
    rows: [],
    verification: 'unverified',
    dataAsOf: null,
    sourceRefs: [],
    warnings: ['Intraday results are unavailable from daily imports; today is still updating.'],
    missingInputs: ['Validated intraday data for the requested partial period.'],
  };
}

function unavailableBudgetHistorySource() {
  return {
    rows: [],
    verification: 'unverified',
    dataAsOf: null,
    sourceRefs: [],
    warnings: [],
    missingInputs: ['Timestamped budget exhaustion or budget utilization history is required.'],
  };
}

function sourceRequests(request, scope, periods) {
  const requests = [];

  for (const profile of scope.profiles) {
    const profilePeriods = periods.find(item => item.profileId === profile.profileId);

    for (const adType of request.adTypes) {
      const windows = [
        ['current', profilePeriods.current],
        ['comparison', profilePeriods.comparison],
      ];

      for (const [label, period] of windows) {
        if (!period) {
          continue;
        }

        const profileIsExcluded = request.entity?.dimension === 'profile'
          && !request.entity.ids.includes(profile.profileId);

        if (profileIsExcluded) {
          continue;
        }

        requests.push({ profile, adType, label, period });
      }
    }
  }

  return requests;
}

async function readSource(read, input) {
  try {
    return await read(input);
  } catch (error) {
    if (error.statusCode && [400, 422].includes(error.statusCode)) {
      throw error;
    }

    if (error.code === 'REPORT_ROW_LIMIT') {
      throw reportError(422, 'REPORT_ROW_LIMIT', 'This report exceeds the supported row limit');
    }

    throw reportError(503, 'REPORT_SOURCE_UNAVAILABLE', 'Reporting data could not be read');
  }
}

function collectSourceMetadata(state, source, sourceLabel) {
  if (source.verification !== 'verified') {
    state.allVerified = false;
  }

  for (const warning of source.warnings || []) {
    state.warnings.add((sourceLabel + ': ' + warning).slice(0, 500));
  }

  for (const missing of source.missingInputs || []) {
    state.missingInputs.add((sourceLabel + ': ' + missing).slice(0, 200));
  }

  if (source.verification !== 'verified') {
    state.missingInputs.add(sourceLabel + ': verified import coverage');
  }

  for (const reference of source.sourceRefs || []) {
    state.sourceRefs.set(JSON.stringify(reference), reference);
  }

  if (source.dataAsOf && Number.isFinite(Date.parse(source.dataAsOf))) {
    state.timestamps.push(source.dataAsOf);
  }
}

function sourceRows(source, request, profile, adType) {
  if (request.category === 'rules') {
    const rows = ruleDatasetRows(source.rows);

    return { rows, hasRequestedMetrics: true };
  }

  return makeMetricRows(source.rows, request, profile, adType);
}

function appendSourceTable(state, source, request, handler, selection) {
  const { profile, adType, label } = selection;
  const sourceLabel = profile.profileId + '/' + adType + '/' + label;

  collectSourceMetadata(state, source, sourceLabel);

  if (source.verification === 'conflict') {
    state.missingInputs.add(sourceLabel + ': conflict-free source rows');
    return;
  }

  let grouped;

  try {
    grouped = sourceRows(source, request, profile, adType);
  } catch (_) {
    state.missingInputs.add(sourceLabel + ': valid raw metrics and grouping identities');
    state.allVerified = false;
    return;
  }

  let rows = grouped.rows;
  const hasMissingMetrics = request.category !== 'rules'
    && rows.some(row => request.metrics.some(metric => row[metric] === null));

  if (hasMissingMetrics) {
    state.missingInputs.add(sourceLabel + ': requested metric inputs');
  }

  if (!grouped.hasRequestedMetrics && rows.length) {
    state.missingInputs.add(sourceLabel + ': supported requested metrics');
    rows = [];
  }

  if (grouped.hasRequestedMetrics) {
    state.hasUsableEvidence = true;
  }

  const page = sortAndPage(rows, request);
  const columns = request.category === 'rules'
    ? Object.keys(ruleDatasetRows([{}])[0]).map(key => ({ key, label: key, type: 'string' }))
    : metricColumns(request);
  const id = 'report_' + state.sourceIndex++;

  state.datasets.push({ id, currencyCode: profile.currencyCode, columns, ...page });
  state.blocks.push({
    type: 'table',
    // Raw source rows are evidence, not a verified growth recommendation.
    title: (request.category === 'growth' ? 'Observed performance' : request.category)
      + ' · ' + adType + ' · ' + profile.profileId + ' · ' + label,
    datasetId: id,
    sortable: request.category !== 'rules',
  });

  if (handler.source === 'daily' || request.category === 'products') {
    state.warnings.add('Attributed sales and orders may mature within their attribution window; imported figures are provisional.');
  }

  if (profile.attributionWindows[adType] === null) {
    state.warnings.add(adType + ': the source attribution window is not verified; keep this ad type separate from other totals.');
  }
}

function createReportService({
  db,
  resolveScope = resolveReportScope,
  readDaily = readDailyReport,
  readSpecial = readSpecialReport,
  readKeywords = readKeywordInventory,
  analyze = analyzeReport,
  checkReportPermission,
  now = () => new Date(),
  makeReportId = randomUUID,
} = {}) {
  return async function executeReport(input, authContext) {
    const { request, handler } = prepareRequest(input);

    requireAuthenticatedIdentity(authContext);

    if (handler.source === 'glossary') {
      return glossaryReport(request, makeReportId());
    }

    const database = typeof db === 'function'
      ? db()
      : db || require('mongoose').connection.db;

    if (!database) {
      throw reportError(503, 'REPORT_DATABASE_UNAVAILABLE', 'Reporting database is unavailable');
    }

    const permission = checkReportPermission || ((userId, organizationId, pageName) => (
      checkReportPagePermission(userId, organizationId, pageName, { db: database })
    ));
    const scope = await resolveScope(request, authContext, {
      db: database,
      checkReportPermission: permission,
    });

    validateSelection(request, scope);

    const capturedNow = now();
    const { periods, warnings: periodWarnings } = resolvePeriods(request, scope, handler, capturedNow);
    const state = createReportState();
    periodWarnings.forEach(warning => state.warnings.add(warning));

    let keywordInventoryData = null;
    if (request.category === 'growth' && request.groupBy.includes('search_term')) {
      keywordInventoryData = await readKeywords({
        db: database,
        profile: scope.profiles[0],
        configId: scope.configId,
        userId: authContext.userId,
      });
    }

    const sourcesByScope = new Map();

    // Preserve profile/ad-type/period order; never combine overlapping sources.
    for (const selection of sourceRequests(request, scope, periods)) {
      const read = handler.source === 'daily' ? readDaily : readSpecial;
      const hasUnsupportedPartialPeriod = handler.source === 'daily' && selection.period.isPartial;
      const needsBudgetHistory = request.category === 'growth' && request.groupBy.includes('campaign');
      // Campaign totals cannot answer when a budget ran out. Avoid an expensive
      // read and an unrelated campaign table until that history source exists.
      const source = hasUnsupportedPartialPeriod ? unavailablePartialSource()
        : needsBudgetHistory ? unavailableBudgetHistorySource()
        : await readSource(read, {
        db: database,
        profile: selection.profile,
        configId: scope.configId,
        userId: authContext.userId,
        period: selection.period,
        adType: selection.adType,
        dimension: sourceDimension(request, handler),
        entity: request.entity?.dimension === 'profile' ? undefined : request.entity,
        category: request.category,
        maxRows: request.category === 'time' ? 120000 : undefined,
        metrics: [...new Set([
          ...request.metrics,
          ...request.filters.map(filter => filter.field),
        ])],
      });

      if (hasUnsupportedPartialPeriod && selection.label === 'current') {
        state.analysisText.push(`${selection.profile.profileId}/${selection.adType}: Intraday results are unavailable from daily imports; today is still updating. Choose yesterday or a completed date range.`);
      }

      appendSourceTable(state, source, request, handler, selection);

      const scopeKey = `${selection.profile.profileId}:${selection.adType}`;
      if (!sourcesByScope.has(scopeKey)) {
        sourcesByScope.set(scopeKey, { profile: selection.profile, adType: selection.adType });
      }
      const entry = sourcesByScope.get(scopeKey);
      if (selection.label === 'current') {
        entry.current = source;
      } else if (selection.label === 'comparison') {
        entry.comparison = source;
      }
    }

    // Step 5: Execute analysis inside handlers
    let analysisIndex = 0;
    for (const [, entry] of sourcesByScope) {
      const profilePeriods = periods.find(item => item.profileId === entry.profile.profileId);
      const analysisResult = analyze({
        request,
        profile: entry.profile,
        adType: entry.adType,
        current: entry.current,
        comparison: entry.comparison,
        periods: profilePeriods,
        idPrefix: `analysis_${analysisIndex++}`,
        options: request.analysis || {},
        now: capturedNow,
        keywordInventory: keywordInventoryData,
      });

      appendAnalysis(state, analysisResult, `${entry.profile.profileId}/${entry.adType}`);
    }

    return buildReportResponse(state, request, scope, periods, makeReportId());
  };
}

module.exports = { REPORT_HANDLERS, createReportService, prepareRequest };
