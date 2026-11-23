'use strict';
const reportsSchema = require('../models/report.model');
const profileSchema = require('../models/profiles.model');
const cronJobHistorySchema = require('../models/cronJobHistory.model');
const { getOrCreateReportRequest } = require('./reportRequest.service');
const { processStagedReportBatches } = require('./reportBatchWriter.service');
const { acquireImportLock, renewImportLock, releaseImportLock } = require('./reportStaging.service');
const { linkReportHistory } = require('./reportHistoryCompletion.service');

const PENDING = new Set(['PENDING', 'IN_PROGRESS', 'PROCESSING', 'STAGED', 'IMPORTING', 'VERIFYING', 'WRITE_FAILED']);
const TERMINAL = new Set(['FAILED', 'FAILURE', 'CANCELLED', 'CANCELED', 'FATAL', 'EXPIRED']);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const STAGED = new Set(['STAGED', 'IMPORTING', 'VERIFYING', 'WRITE_FAILED']);
const latest = identity => reportsSchema.findOne(identity).sort({ createdAt: -1, _id: -1 }).lean();


async function withPollLease(reportId, work) {
  const key = 'historical_report_poll:' + reportId;
  const token = await acquireImportLock(key, 900);
  if (!token) return 'BUSY';
  const heartbeat = setInterval(() => { renewImportLock(key, token, 900).catch(() => {}); }, 60000);
  try { return await work(); }
  finally { clearInterval(heartbeat); await releaseImportLock(key, token); }
}

/** One historical pass. Creation leases, exact identity reuse, and importer locks are shared with scheduled reports. */
async function runHistoricalAdsReportPhase(scope, { group, reportName, types, getAllowedSyncProfiles, getAccessToken }) {
  const { configId, profileId, startDate, endDate, cronjobid, reportPhase } = scope;
  const saveHistory = async (status, typeStatuses, error) => {
    if (cronjobid) await cronJobHistorySchema.findByIdAndUpdate(cronjobid, { $set: {
      status, error: error || null, 'details.reportPhase': reportPhase,
      'details.expectedReportTypes': types.map(type => type.reportTypeId),
      'details.reportTypeStatuses': typeStatuses,
    } });
    return status;
  };
  try {
    if (!['submit', 'poll'].includes(reportPhase) || !configId || !Number.isSafeInteger(Number(profileId)) || Number(profileId) <= 0 ||
        !validDate(startDate) || !validDate(endDate) || startDate > endDate || Date.parse(endDate) - Date.parse(startDate) > 29 * 86400000) {
      return saveHistory('FAILED', {}, 'Invalid historical report scope');
    }
    const allowed = await getAllowedSyncProfiles(group, 'ads', false);
    if (!allowed.some(item => Number(item.profileId) === Number(profileId) && String(item.configId) === String(configId))) {
      return saveHistory('FAILED', {}, 'Historical Ads profile is not authorized for this report group');
    }
    const profile = await profileSchema.findOne({ configId, profileId: Number(profileId), isActive: true }).lean();
    if (!profile) return saveHistory('FAILED', {}, 'Historical Ads profile is inactive or missing');
    const credentials = await getAccessToken(configId);
    if (!credentials?.adsAccessToken) return saveHistory('FAILED', {}, 'Historical Ads credentials unavailable');

    const attempts = await Promise.allSettled(types.map(async type => {
      const identity = { configId, profileId: Number(profileId), startDate, endDate, reportName, reportTypeId: type.reportTypeId };
      let row;
      let providerStatus;
      try {
        if (reportPhase === 'submit') {
          const request = await getOrCreateReportRequest(identity, async () => {
            const result = await type.run(profile, credentials, { phase: 'submit', creationLocked: true });
            const created = await latest(identity);
            if (!created?.reportId || !PENDING.has(created.status) && created.status !== 'COMPLETED') {
              throw new Error(`Historical request was not accepted (${result || 'ERROR'})`);
            }
            return created;
          });
          if (request.busy) return [type.reportTypeId, 'PENDING'];
          row = request.report;
        } else {
          row = await latest(identity);
          if (!row?.reportId) return [type.reportTypeId, 'ERROR'];
          const expectedReportId = row.reportId;
          const outcome = await withPollLease(expectedReportId, async () => {
            // A different caller may have imported/replaced the row while this lease was acquired.
            row = await latest(identity);
            if (!row?.reportId || row.reportId !== expectedReportId) return 'PENDING';
            if (row.status === 'COMPLETED') return 'COMPLETED';
            if (!PENDING.has(row.status)) return 'ERROR';
            if (type.entity && STAGED.has(row.status)) {
              processStagedReportBatches([type.entity]).catch(() => {});
              return row.status;
            }
            const result = await type.run(profile, credentials, { phase: 'poll', report: row,
              onProviderStatus: value => { providerStatus = value; } });
            if (TERMINAL.has(providerStatus)) {
              await reportsSchema.updateOne({ _id: row._id }, { $set: { status: providerStatus,
                failedAt: new Date(), errorMessage: 'Amazon report reached a terminal status' } });
              return 'ERROR';
            }
            // Accepted IDs survive transport/download/import failures and are polled again.
            if (!PENDING.has(result) && result !== 'COMPLETED') return 'PENDING';
            row = await latest(identity);
            return row?.status === 'COMPLETED' ? 'COMPLETED' : PENDING.has(row?.status) ? row.status : 'ERROR';
          });
          return [type.reportTypeId, outcome === 'BUSY' ? 'PENDING' : outcome];
        }
        return [type.reportTypeId, row?.status === 'COMPLETED' ? 'COMPLETED' : PENDING.has(row?.status) ? row.status : 'ERROR'];
      } catch (_) {
        if (reportPhase === 'poll' && row?.reportId) {
          // Preserve accepted requests on generic provider/download/import errors.
          const current = await latest(identity);
          if (current && TERMINAL.has(current.status) && !TERMINAL.has(providerStatus)) {
            await reportsSchema.updateOne({ _id: row._id }, { $set: { status: 'PENDING' } });
          }
          return [type.reportTypeId, TERMINAL.has(providerStatus) ? 'ERROR' : 'PENDING'];
        }
        return [type.reportTypeId, 'ERROR'];
      }
    }));
    const outcomes = attempts.map((attempt, index) => attempt.status === 'fulfilled' ? attempt.value : [types[index].reportTypeId, 'ERROR']);
    await linkReportHistory({ historyId: cronjobid, configId, profileId: Number(profileId), reportName, startDate, endDate });
    const statuses = Object.fromEntries(outcomes);
    const values = Object.values(statuses);
    // A failed sibling must never prevent pending siblings from being polled/imported.
    const status = values.every(value => value === 'COMPLETED') ? 'COMPLETED'
      : values.some(value => PENDING.has(value)) ? 'PENDING' : 'FAILED';
    return saveHistory(status, statuses, status === 'FAILED' ? 'One or more historical Ads report types failed or were missing' : null);
  } catch (_) {
    return saveHistory('FAILED', {}, 'Historical Ads report phase failed');
  }
}
module.exports = { runHistoricalAdsReportPhase };
