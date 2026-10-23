'use strict';

const { Types } = require('mongoose');


// Native MongoDB reads only. Authentication and profile resolution happen upstream.
const MAX_ROWS = 50000;
const MAX_TIME_MS = 5000;
const ROW_PROJECTION = Object.freeze({
  _id: 0,
  campaignId: 1,
  reportDate: 1,
  spend: 1,
  sales: 1,
  orders: 1,
  clicks: 1,
  impressions: 1,
  lastImportRunId: 1,
  importSourceVersion: 1,
  currencyCode: 1,
  updatedAt: 1
});
const MANIFEST_PROJECTION = Object.freeze({
  _id: 1,
  reportId: 1,
  startDate: 1,
  endDate: 1,
  status: 1,
  importRunId: 1,
  verifiedRows: 1,
  completedAt: 1,
  createdAt: 1,
  updatedAt: 1
});

function toIsoTimestamp(value) {
  if (!(value instanceof Date) && typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function latestTimestamp(values) {
  return values.map(toIsoTimestamp).filter(Boolean).sort().at(-1) || null;
}

function manifestSourceReference(manifest) {
  const value = {
    name: `SP campaign report ${manifest.reportId || manifest._id || manifest.importRunId}`
  };
  if (typeof manifest.importRunId === 'string' && manifest.importRunId) {
    value.importRunId = manifest.importRunId;
  }
  value.completedAt = toIsoTimestamp(manifest.completedAt);
  return value;
}

function hasVerificationMetadata(manifest) {
  return toIsoTimestamp(manifest.completedAt) &&
    typeof manifest.importRunId === 'string' &&
    manifest.importRunId.trim() &&
    Number.isInteger(manifest.verifiedRows) &&
    manifest.verifiedRows >= 0;
}

async function readDay(db, scope, period) {
  if (
    !period ||
    !/^\d{4}-\d{2}-\d{2}$/.test(period.fromDate) ||
    period.fromDate !== period.toDate ||
    period.isPartial
  ) {
    const error = new Error('Summary repository supports complete single-day periods only');
    error.code = 'UNSUPPORTED_REPORT_PERIOD';
    throw error;
  }
  const identity = {
    configId: scope.configIdObjectId,
    profileId: scope.profileIdNumber
  };
  const day = period.fromDate;
  const campaigns = db.collection('campaigns');

  // Read observed rows first, then verify them against a completed import run.
  const rows = await campaigns.find({
    ...identity,
    reportDate: day
  }, {
    projection: ROW_PROJECTION,
    maxTimeMS: MAX_TIME_MS
  }).limit(MAX_ROWS + 1).toArray();
  if (rows.length > MAX_ROWS) {
    const error = new Error('Campaign summary exceeds the supported row limit');
    error.code = 'REPORT_ROW_LIMIT';
    throw error;
  }
  const result = {
    rows,
    verification: 'unverified',
    sourceRefs: [],
    dataAsOf: latestTimestamp(rows.map(row => row.updatedAt)),
    warnings: []
  };
  const identities = new Set();

  for (const row of rows) {
    if (!Number.isSafeInteger(row.campaignId) || row.campaignId <= 0 || row.reportDate !== day) {
      result.verification = 'conflict';
      result.warnings.push('INVALID_CAMPAIGN_DATE_IDENTITY');
      return result;
    }
    if (row.currencyCode !== undefined && row.currencyCode !== scope.currencyCode) {
      result.verification = 'conflict';
      result.warnings.push('CAMPAIGN_CURRENCY_MISMATCH');
      return result;
    }
    const key = `${row.campaignId}#${row.reportDate}`;
    if (identities.has(key)) {
      result.verification = 'conflict';
      result.warnings.push('DUPLICATE_CAMPAIGN_DATE');
      return result;
    }
    identities.add(key);
  }
  // A manifest must cover this profile, report type and requested calendar date.
  const manifestScope = {
    ...identity,
    reportName: 'CAMPAIGNS',
    reportTypeId: 'spCampaigns',
    startDate: {
      $lte: day
    },
    endDate: {
      $gte: day
    }
  };
  const reports = db.collection('reports');
  const completed = await reports.find({
    ...manifestScope,
    status: 'COMPLETED'
  }, {
    projection: MANIFEST_PROJECTION,
    maxTimeMS: MAX_TIME_MS
  }).sort({
    completedAt: -1,
    createdAt: -1,
    _id: -1
  }).limit(20).toArray();
  const incomplete = await reports.find({
    ...manifestScope,
    status: {
      $ne: 'COMPLETED'
    }
  }, {
    projection: MANIFEST_PROJECTION,
    maxTimeMS: MAX_TIME_MS
  }).sort({
    updatedAt: -1,
    createdAt: -1,
    _id: -1
  }).limit(20).toArray();
  const candidate = completed.find(hasVerificationMetadata);
  result.sourceRefs = completed.map(manifestSourceReference);
  const newestIncomplete = latestTimestamp(
    incomplete.flatMap(item => [item.updatedAt, item.createdAt])
  );
  if (newestIncomplete && (!candidate || newestIncomplete > toIsoTimestamp(candidate.completedAt))) {
    result.warnings.push('NEWER_INCOMPLETE_IMPORT');
  }
  if (!candidate) {
    result.warnings.push(
      completed.length ? 'IMPORT_VERIFICATION_METADATA_MISSING' : 'NO_COMPLETED_IMPORT'
    );
    return result;
  }
  if (completed.indexOf(candidate) > 0) {
    result.warnings.push('NEWER_COMPLETED_IMPORT_UNVERIFIED');
  }
  // A zero run cannot explain positive observed rows, even if those rows are old.
  if (candidate.verifiedRows === 0 && rows.length > 0) {
    result.verification = 'conflict';
    result.warnings.push('ZERO_IMPORT_HAS_OBSERVED_ROWS');
    return result;
  }
  if (rows.some(row => row.lastImportRunId !== candidate.importRunId)) {
    result.warnings.push('ROWS_NOT_FROM_COMPLETED_IMPORT');
    return result;
  }
  // verifiedRows records exact rows for this run across its complete date span,
  // not just the requested date. Never compare it to an unscoped collection count.
  const runCount = await campaigns.countDocuments({
    ...identity,
    lastImportRunId: candidate.importRunId,
    reportDate: {
      $gte: candidate.startDate,
      $lte: candidate.endDate
    }
  }, {
    maxTimeMS: MAX_TIME_MS
  });
  if (runCount !== candidate.verifiedRows) {
    result.warnings.push('IMPORT_RUN_COUNT_MISMATCH');
    return result;
  }
  result.verification = 'verified';
  result.sourceRefs = [manifestSourceReference(candidate)];
  result.dataAsOf = toIsoTimestamp(candidate.completedAt);
  return result;
}

async function readSummaryPeriods({
  db,
  scope,
  periods
}) {
  const profileId = scope?.profiles?.[0]?.profileId;
  if (
    !db ||
    typeof db.collection !== 'function' ||
    !/^[a-f\d]{24}$/i.test(scope?.configId || '') ||
    scope?.profiles?.length !== 1 ||
    typeof profileId !== 'string' ||
    !/^[1-9]\d*$/.test(profileId) ||
    !Number.isSafeInteger(Number(profileId))
  ) {
    const error = new Error('A native database and validated reporting scope are required');
    error.code = 'INVALID_REPORT_SCOPE';
    throw error;
  }
  const identity = {
    configIdObjectId: new Types.ObjectId(scope.configId),
    profileIdNumber: Number(profileId),
    currencyCode: scope.profiles[0].currencyCode
  };
  const current = await readDay(db, identity, periods?.current);
  const comparison = periods?.comparison ? await readDay(db, identity, periods.comparison) : null;
  return {
    current,
    comparison
  };
}

module.exports = {
  readSummaryPeriods
};
