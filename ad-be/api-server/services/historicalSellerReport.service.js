'use strict';

const Reports = require('../models/report.model');
const { getOrCreateReportRequest } = require('./reportRequest.service');
const { acquireImportLock, renewImportLock, releaseImportLock } = require('./reportStaging.service');

const settled = report => ['COMPLETED', 'CANCELLED'].includes(report?.status) ? 'COMPLETED'
  : ['FAILED', 'FATAL', 'ERROR'].includes(report?.status) ? 'ERROR' : null;

// Explicit historical phases never borrow a report from another date range.
// Legacy callers do not enter this path.
async function runHistoricalSellerReport(options) {
  try { return await executeHistoricalSellerReport(options); }
  catch (_) { return 'ERROR'; }
}

async function executeHistoricalSellerReport({ phase, identity, createRequest, processReport }) {
  if (!['submit', 'poll'].includes(phase)) throw new Error('Invalid historical Seller report phase');
  for (const key of ['configId', 'profileId', 'reportTypeId', 'startDate', 'endDate']) {
    if (identity?.[key] == null || identity[key] === '') throw new Error('Incomplete historical Seller report identity');
  }
  const parseDay = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid historical Seller report date');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid historical Seller report date');
    return date.getTime();
  };
  const inclusiveDays = (parseDay(identity.endDate) - parseDay(identity.startDate)) / 86400000 + 1;
  if (inclusiveDays < 1 || inclusiveDays > 30) throw new Error('Historical Seller report window must be 1 to 30 days');
  const reusableStatuses = ['PENDING', 'IN_PROGRESS', 'PROCESSING', 'STAGED', 'IMPORTING', 'VERIFYING', 'WRITE_FAILED', 'COMPLETED', 'CANCELLED'];
  const find = async () => await Reports.findOne({ ...identity, status: { $in: reusableStatuses } }).sort({ createdAt: -1, _id: -1 }).lean()
    || await Reports.findOne(identity).sort({ createdAt: -1, _id: -1 }).lean();
  let report = await find();
  const result = settled(report);
  if (result === 'COMPLETED') return result;
  if (phase === 'submit') {
    const request = await getOrCreateReportRequest(identity, createRequest);
    if (request.busy) return 'PENDING';
    if (!request.report?.reportId) return 'ERROR';
    return settled(request.report) || 'PENDING';
  }
  if (!report) return 'ERROR';
  if (result) return result;
  if (!report.reportId) return 'ERROR';
  const lockedReportId = String(report._id);
  const lockScope = `historical_seller_report:${lockedReportId}`;
  const lease = await acquireImportLock(lockScope, 300);
  if (!lease) return 'PENDING';
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    try { if (!await renewImportLock(lockScope, lease, 300)) leaseLost = true; }
    catch (_) { leaseLost = true; }
  }, 60000);
  heartbeat.unref?.();
  try {
    report = await find();
    if (String(report?._id) !== lockedReportId) return 'PENDING';
    const final = settled(report);
    if (final) return final;
    if (!report?.reportId || leaseLost) return 'PENDING';
    const status = await processReport(report);
    if (leaseLost) return 'ERROR';
    return ['COMPLETED', 'CANCELLED'].includes(status) ? 'COMPLETED'
      : ['ERROR', 'FAILED', 'FATAL'].includes(status) ? 'ERROR' : 'PENDING';
  } finally {
    clearInterval(heartbeat);
    await releaseImportLock(lockScope, lease);
  }
}

const aggregateSellerReportStatus = results => results.some(result => !['COMPLETED', 'CANCELLED', 'ERROR', 'FAILED', 'FATAL'].includes(result)) ? 'PENDING'
  : results.some(result => ['ERROR', 'FAILED', 'FATAL'].includes(result)) ? 'ERROR' : 'COMPLETED';

async function saveHistoricalSellerHistory(model, id, results) {
  const result = aggregateSellerReportStatus(results);
  if (id) await model.findByIdAndUpdate(id, { $set: {
    status: result === 'ERROR' ? 'FAILED' : result,
    ...(result === 'ERROR' ? { error: 'Seller report phase failed. Check report request status.' } : { error: null }),
  } });
  return result;
}

const sellerReportStreamHandler = (pipeline, reject, handler) => (...args) => {
  const fail = error => {
    pipeline.destroy();
    reject(error);
  };
  // Invoke synchronously so the original handler's pause() takes effect before
  // the source can emit another row or its end event.
  try { Promise.resolve(handler(...args)).catch(fail); }
  catch (error) { fail(error); }
};

module.exports = { runHistoricalSellerReport, aggregateSellerReportStatus, saveHistoricalSellerHistory, sellerReportStreamHandler };
