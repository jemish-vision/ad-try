const reportsSchema = require("../models/report.model");
const { acquireImportLock, renewImportLock, checkImportLock, releaseImportLock } = require("./reportStaging.service");
const { cron_logs } = require("../../winston/utility/logger");

const REUSABLE_STATUSES = [
  "PENDING", "IN_PROGRESS", "PROCESSING", "STAGED", "IMPORTING",
  "VERIFYING", "WRITE_FAILED", "COMPLETED",
];
const LOCK_TTL_SECONDS = 300;

const findReusableRequest = identity => reportsSchema.findOne({
  ...identity,
  status: { $in: REUSABLE_STATUSES },
}).sort({ createdAt: -1, _id: -1 }).lean();

/** Serialize only creation; existing requests can be polled without a lock. */
async function getOrCreateReportRequest(identity, createRequest) {
  let report = await findReusableRequest(identity);
  if (report) return { report, created: false };

  const scope = `report_request:${[
    identity.configId, identity.profileId, identity.reportName, identity.reportTypeId,
    identity.startDate, identity.endDate,
  ].map(value => encodeURIComponent(String(value))).join(":")}`;
  const token = await acquireImportLock(scope, LOCK_TTL_SECONDS);
  if (!token) return { busy: true };

  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    try {
      if (!await renewImportLock(scope, token, LOCK_TTL_SECONDS)) leaseLost = true;
    } catch (_) {
      leaseLost = true;
    }
    if (leaseLost) {
      cron_logs({ message: `[Report Request Lock] Lease renewal failed for ${scope}.`, log_type: "warn" });
    }
  }, 60000);

  try {
    // Another caller may have saved a request after our first lookup.
    report = await findReusableRequest(identity);
    if (report) return { report, created: false };
    if (leaseLost || !await checkImportLock(scope, token)) {
      throw new Error(`Report request creation lease lost for ${scope}.`);
    }
    report = await createRequest();
    return { report, created: true };
  } finally {
    clearInterval(heartbeat);
    await releaseImportLock(scope, token);
  }
}

module.exports = { getOrCreateReportRequest };
