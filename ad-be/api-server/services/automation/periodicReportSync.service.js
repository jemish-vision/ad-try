const moment = require("moment-timezone");
const reportsSchema = require("../../models/report.model");
const cronJobHistorySchema = require("../../models/cronJobHistory.model");
const { ReportImportPendingError } = require("../../../queue-service/contracts/errors");

const REPORT_TYPES = [
  ["CAMPAIGNS", ["spCampaigns", "sbCampaigns", "sdCampaigns"]],
  ["AD_GROUPS", ["spCampaigns", "sbAdGroup", "sdAdGroup"]],
  ["Targeting Report", ["spTargeting", "sbTargeting", "sdTargeting"]],
  ["PRODUCT_ADS", ["spAdvertisedProduct", "sdAdvertisedProduct"]],
  ["PLACEMENTS", ["spCampaigns", "sbCampaignPlacement"]],
  ["SEARCHTERM", ["spSearchTerm", "sbSearchTerm"]],
];
const TERMINAL_STATUSES = ["FAILED", "FATAL", "EXPIRED", "CANCELLED", "CANCELED", "VALIDATION_FAILED"];
const RECOVERY_TYPES = [
  ["CAMPAIGNS", ["spCampaigns"]],
  ["AD_GROUPS", ["spCampaigns", "sbAdGroup"]],
];

async function requireCompletedReports({ configId, profileId, startDate, endDate, task, expectedTypes = REPORT_TYPES }) {
  const reports = await reportsSchema.find({
    configId,
    profileId: Number(profileId),
    startDate,
    endDate,
    $or: expectedTypes.map(([reportName, types]) => ({ reportName, reportTypeId: { $in: types } })),
  }).sort({ createdAt: -1 }).select("reportName reportTypeId status errorMessage").lean();

  const latest = new Map();
  for (const report of reports) {
    const key = `${report.reportName}/${report.reportTypeId}`;
    if (!latest.has(key)) latest.set(key, report);
  }
  const pending = [];
  for (const [reportName, types] of expectedTypes) {
    for (const type of types) {
      const key = `${reportName}/${type}`;
      const report = latest.get(key);
      if (TERMINAL_STATUSES.includes(report?.status)) {
        throw new Error(`${task} report failed (${key}, ${startDate} to ${endDate}): ${report.errorMessage || report.status}`);
      }
      if (report?.status !== "COMPLETED") pending.push(`${key}:${report?.status || "NOT_FOUND"}`);
    }
  }
  return pending;
}

/** BullMQ owns polling for the scheduled range and a bounded recent backlog. */
async function generatePeriodicReports({ task, configId, profileId, syncDate, pastSyncObj, weekly, delegates }) {
  const currentRange = {
    startDate: moment(syncDate).subtract(weekly ? 9 : 14, "days").format("YYYY-MM-DD"),
    endDate: moment(syncDate).subtract(1, "day").format("YYYY-MM-DD"),
  };
  const ranges = [currentRange];

  // Jobs previously completed on PENDING have no owner left. Resume just one
  // old range per invocation, scoped to this profile and the last 48 hours.
  const now = Date.now();
  const backlog = await reportsSchema.find({
    configId,
    profileId: Number(profileId),
    status: "PENDING",
    createdAt: { $gte: new Date(now - 48 * 3600000), $lte: new Date(now - 6 * 3600000) },
    $or: [
      { reportName: "CAMPAIGNS", reportTypeId: "spCampaigns" },
      { reportName: "AD_GROUPS", reportTypeId: { $in: ["spCampaigns", "sbAdGroup"] } },
    ],
  }).sort({ createdAt: 1 }).limit(1).select("startDate endDate").lean();
  const oldRange = backlog[0];
  if (oldRange?.startDate && oldRange?.endDate &&
      (oldRange.startDate !== currentRange.startDate || oldRange.endDate !== currentRange.endDate)) {
    ranges.push({ startDate: oldRange.startDate, endDate: oldRange.endDate, recovery: true });
  }

  const results = {};
  const pendingRanges = [];
  for (const range of ranges) {
    const scope = { ...pastSyncObj, startDate: range.startDate, endDate: range.endDate, recurring: false };
    const result = {};
    for (const [name, generate] of Object.entries(delegates)) {
      if (range.recovery && !["campaign", "adGroup"].includes(name)) continue;
      result[name] = await generate(weekly, !weekly, scope);
      if (result[name] === "ERROR") {
        throw new Error(`${task} ${name} report request failed (${range.startDate} to ${range.endDate}); see cron logs.`);
      }
    }
    results[`${range.startDate}/${range.endDate}`] = result;
    const pending = await requireCompletedReports({
      ...range, configId, profileId, task,
      expectedTypes: range.recovery ? RECOVERY_TYPES : REPORT_TYPES,
    });
    if (pending.length) pendingRanges.push({ ...range, reports: pending });
  }
  if (pendingRanges.length) {
    throw new ReportImportPendingError(
      `${task} reports are awaiting completion: ${JSON.stringify(pendingRanges)}`,
      { task, configId, profileId, pendingRanges }
    );
  }
  // Preserve the existing six-category result shape for queue consumers.
  return results[`${currentRange.startDate}/${currentRange.endDate}`];
}

async function runPeriodicReportSync(options) {
  const { configId, profileId, weekly, syncDate } = options;
  const history = await cronJobHistorySchema.findOneAndUpdate({
    configId, profileId: Number(profileId),
    cronName: weekly ? "Weekly Report" : "BiWeekly Report",
    historyDate: syncDate,
  }, { $set: { status: "PENDING" } }, { upsert: true, new: true }).lean();
  try {
    const result = await generatePeriodicReports(options);
    await cronJobHistorySchema.updateOne({ _id: history._id }, { $set: { status: "COMPLETED" } });
    return result;
  } catch (err) {
    if (!(err instanceof ReportImportPendingError)) {
      await cronJobHistorySchema.updateOne({ _id: history._id }, { $set: { status: "FAILED" } });
    }
    throw err;
  }
}

module.exports = { runPeriodicReportSync };
