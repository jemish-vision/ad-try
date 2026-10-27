'use strict';

const { Types } = require('mongoose');

const MAX_ROWS = 50000;
const MAX_TIME_MS = 5000;
const BASE_METRICS = ['spend', 'sales', 'orders', 'clicks', 'impressions'];
const COLLECTIONS = {
  SP: {
    campaign: 'campaigns',
    target: 'targetings',
    search_term: 'searchterms',
    placement: 'placements'
  },
  SB: {
    campaign: 'sbcampaigns',
    target: 'sbtargetings',
    search_term: 'sbsearchterms',
    placement: 'sbplacements'
  },
  SD: {
    campaign: 'sdcampaigns',
    target: 'sdtargetings',
    search_term: 'sdsearchterms',
    placement: 'sdplacements'
  }
};
const SOURCE_DIMENSIONS = {
  profile: 'campaign',
  campaign: 'campaign',
  date: 'campaign',
  keyword: 'target',
  target: 'target',
  ad_group: 'target',
  search_term: 'search_term',
  placement: 'placement'
};
const PROJECTION = Object.fromEntries([
  'campaignId',
  'name',
  'campaignName',
  'reportDate',
  'adGroupId',
  'targetId',
  'targeting',
  'keywordId',
  'keywordType',
  'matchType',
  'searchTerm',
  'placement',
  'currencyCode',
  'updatedAt',
  ...BASE_METRICS
].map(field => [field, 1]));
PROJECTION._id = 0;

function throwReportError(message, code = 'UNSUPPORTED_REPORT_SELECTION') {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 422;
  throw error;
}

function isCanonicalNumericId(value) {
  return typeof value === 'string' &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function calendarDateTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return NaN;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value ? date.getTime() : NaN;
}

function validateInput({
  db,
  profile,
  configId,
  period,
  adType,
  dimension
}) {
  if (
    !db ||
    typeof db.collection !== 'function' ||
    typeof configId !== 'string' ||
    !/^[a-f\d]{24}$/i.test(configId) ||
    !isCanonicalNumericId(profile?.profileId) ||
    !/^[A-Z]{3}$/.test(profile?.currencyCode || '')
  ) {
    throwReportError('A validated profile and database are required', 'INVALID_REPORT_SCOPE');
  }
  if (!Object.hasOwn(COLLECTIONS, adType) || !Object.hasOwn(SOURCE_DIMENSIONS, dimension)) {
    throwReportError('Unsupported daily reporting grain');
  }
  const days = (
    calendarDateTimestamp(period?.toDate) - calendarDateTimestamp(period?.fromDate)
  ) / 86400000 + 1;
  if (!Number.isInteger(days) || days < 1 || days > 92 || period.isPartial) {
    throwReportError(
      'Daily reports require a complete period of at most 92 days',
      'UNSUPPORTED_REPORT_PERIOD'
    );
  }
}

function addEntityFilter(query, entity, source, profileId) {
  if (!entity) {
    return;
  }
  if (
    !Array.isArray(entity.ids) ||
    entity.ids.length < 1 ||
    entity.ids.length > 100 ||
    entity.ids.some(id => (
      typeof id !== 'string' || !id.length || id.length > 100
    ))
  ) {
    throwReportError('Invalid report entity');
  }
  if (entity.dimension === 'profile') {
    if (entity.ids.some(id => id !== profileId)) {
      throwReportError('Profile entity is outside the resolved scope', 'INVALID_REPORT_SCOPE');
    }
    return;
  }
  const fields = {
    campaign: 'campaignId'
  };
  if (source === 'target' || source === 'search_term') {
    fields.ad_group = 'adGroupId';
  }
  if (source === 'target') {
    Object.assign(fields, {
      keyword: 'targetId',
      target: 'targetId'
    });
  }
  if (source === 'search_term') {
    fields.search_term = 'searchTerm';
  }
  if (source === 'placement') {
    fields.placement = 'placement';
  }
  if (!Object.hasOwn(fields, entity.dimension)) {
    throwReportError('Entity does not belong to the requested report grain');
  }
  const field = fields[entity.dimension];
  const numeric = field === 'campaignId' || field === 'adGroupId';
  if (numeric && entity.ids.some(id => !isCanonicalNumericId(id))) {
    throwReportError('Invalid numeric report entity');
  }
  query[field] = {
    $in: numeric ? entity.ids.map(Number) : entity.ids
  };
}

function validNumericId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasInvalidMetrics(row) {
  return BASE_METRICS.some(metric => {
    const value = row[metric];
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return true;
    }
    if (['spend', 'clicks', 'impressions'].includes(metric) && value < 0) {
      return true;
    }
    return ['orders', 'clicks', 'impressions'].includes(metric) && !Number.isSafeInteger(value);
  });
}

function dailyRowIdentity(row, source, period) {
  if (
    !validNumericId(row.campaignId) ||
    !Number.isFinite(calendarDateTimestamp(row.reportDate)) ||
    row.reportDate < period.fromDate ||
    row.reportDate > period.toDate
  ) {
    return null;
  }
  const parts = [row.campaignId, row.reportDate];
  if (source === 'target' || source === 'search_term') {
    if (!validNumericId(row.adGroupId)) {
      return null;
    }
    parts.push(row.adGroupId);
  }
  if (source === 'target') {
    if (typeof row.targetId !== 'string' || !row.targetId.trim()) {
      return null;
    }
    parts.push(row.targetId);
  }
  if (source === 'search_term') {
    // Automatic targets can have a null keywordId; it is still part of the stored unique key.
    if (row.keywordId !== null && !validNumericId(row.keywordId)) {
      return null;
    }
    if (typeof row.searchTerm !== 'string' || !row.searchTerm.trim()) {
      return null;
    }
    parts.push(row.keywordId, row.searchTerm);
  }
  if (source === 'placement') {
    if (typeof row.placement !== 'string' || !row.placement.trim()) {
      return null;
    }
    parts.push(row.placement);
  }
  return JSON.stringify(parts);
}

function normalizeRow(row, profile, adType, source) {
  let entityName = null;

  if (source === 'target') {
    entityName = row.targeting;
  } else if (source === 'search_term') {
    entityName = row.searchTerm;
  } else if (source === 'placement') {
    entityName = row.placement;
  }

  const result = {
    profileId: profile.profileId,
    adType,
    grain: `${adType}:${source}:day`,
    campaignId: String(row.campaignId),
    name: entityName || row.name || row.campaignName || String(row.campaignId),
    date: row.reportDate
  };
  for (const metric of BASE_METRICS) {
    // Keep missing fields missing. A missing order count must never become zero orders.
    if (Object.hasOwn(row, metric)) {
      result[metric] = row[metric];
    }
  }
  if (source === 'target' || source === 'search_term') {
    result.adGroupId = String(row.adGroupId);
  }
  if (source === 'target') {
    result.targetId = row.targetId;
    result.keywordId = row.targetId;
  }
  if (source === 'search_term') {
    result.keywordId = row.keywordId === null ? null : String(row.keywordId);
  }
  for (const field of ['targeting', 'keywordType', 'matchType', 'searchTerm', 'placement']) {
    if (Object.hasOwn(row, field)) {
      result[field] = row[field];
    }
  }
  return result;
}

async function readDailyReport(input) {
  validateInput(input);

  const {
    db,
    profile,
    configId,
    period,
    adType,
    dimension,
    entity
  } = input;
  const source = SOURCE_DIMENSIONS[dimension];
  const collection = COLLECTIONS[adType][source];

  // Build the database query only from the validated reporting scope.
  const query = {
    configId: new Types.ObjectId(configId),
    profileId: Number(profile.profileId),
    reportDate: {
      $gte: period.fromDate,
      $lte: period.toDate
    }
  };
  addEntityFilter(query, entity, source, profile.profileId);
  if (dimension === 'keyword') {
    query.keywordType = {
      $in: ['EXACT', 'PHRASE', 'BROAD']
    };
  }
  let rawRows;

  try {
    rawRows = await db.collection(collection).find(query, {
      projection: PROJECTION,
      maxTimeMS: MAX_TIME_MS
    }).limit(MAX_ROWS + 1).toArray();
  } catch (error) {
    // A bounded query can time out even when the reporting source is healthy.
    // Keep the existing limits and explain how the user can narrow this request.
    if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
      throwReportError(
        'This report exceeded the query time limit. Choose fewer dates or a single campaign.',
        'REPORT_QUERY_TIMEOUT'
      );
    }

    throw error;
  }
  if (rawRows.length > MAX_ROWS) {
    throwReportError(
      'Daily report exceeds 50000 rows; narrow the period or entity',
      'REPORT_ROW_LIMIT'
    );
  }

  // Wider daily grains remain provisional until their import coverage is verified.
  const result = {
    rows: [],
    sourceRefs: [{
      name: collection
    }],
    dataAsOf: null,
    verification: 'unverified',
    warnings: ['IMPORT_COVERAGE_UNVERIFIED'],
    missingInputs: ['VERIFIED_IMPORT_COVERAGE']
  };
  const seen = new Map();
  const missingMetrics = new Set();

  for (const row of rawRows) {
    const key = dailyRowIdentity(row, source, period);
    const invalidMetrics = hasInvalidMetrics(row);
    if (
      !key ||
      invalidMetrics ||
      row.currencyCode !== undefined && row.currencyCode !== profile.currencyCode
    ) {
      result.verification = 'conflict';
      let warning = 'DAILY_CURRENCY_MISMATCH';

      if (!key) {
        warning = 'INVALID_DAILY_ROW_IDENTITY';
      } else if (invalidMetrics) {
        warning = 'INVALID_DAILY_METRICS';
      }

      result.warnings.push(warning);
      result.missingInputs.push('CONSISTENT_DAILY_ROWS');
      // Never expose rows that callers might accidentally total after a conflict.
      result.rows = [];
      return result;
    }

    const rowUpdatedAtMs = row.updatedAt instanceof Date || typeof row.updatedAt === 'string'
      ? (Number.isFinite(new Date(row.updatedAt).getTime()) ? new Date(row.updatedAt).getTime() : null)
      : null;

    if (seen.has(key)) {
      const existing = seen.get(key);
      if (
        rowUpdatedAtMs !== null &&
        existing.updatedAtMs !== null &&
        rowUpdatedAtMs > existing.updatedAtMs
      ) {
        // Newer snapshot supersedes older snapshot
        seen.set(key, { row, updatedAtMs: rowUpdatedAtMs });
      } else if (
        rowUpdatedAtMs !== null &&
        existing.updatedAtMs !== null &&
        rowUpdatedAtMs < existing.updatedAtMs
      ) {
        // Existing snapshot is already newer, ignore older snapshot
      } else {
        // Indeterminate or identical timestamps cannot be safely resolved
        result.verification = 'conflict';
        result.warnings.push('DUPLICATE_DAILY_ROW');
        result.missingInputs.push('CONSISTENT_DAILY_ROWS');
        result.rows = [];
        return result;
      }
    } else {
      seen.set(key, { row, updatedAtMs: rowUpdatedAtMs });
    }
  }

  for (const { row } of seen.values()) {
    for (const metric of BASE_METRICS) {
      if (row[metric] === null || row[metric] === undefined) {
        missingMetrics.add(metric);
      }
    }
    result.rows.push(normalizeRow(row, profile, adType, source));
    const updatedAt = row.updatedAt instanceof Date || typeof row.updatedAt === 'string'
      ? new Date(row.updatedAt)
      : null;
    if (updatedAt && Number.isFinite(updatedAt.getTime())) {
      const instant = updatedAt.toISOString();
      if (!result.dataAsOf || instant > result.dataAsOf) {
        result.dataAsOf = instant;
      }
    }
  }

  if (!rawRows.length) {
    result.missingInputs.push('NO_REPORT_ROWS');
  }
  for (const metric of missingMetrics) {
    result.missingInputs.push(`MISSING_${metric.toUpperCase()}`);
  }
  // Range completeness cannot be inferred from observed rows or updatedAt. The
  // Step 3 manifest verifier covers SP single-day summaries only; these wider
  // grains stay provisional until a matching per-grain verifier exists.
  return result;
}

module.exports = {
  readDailyReport
};
