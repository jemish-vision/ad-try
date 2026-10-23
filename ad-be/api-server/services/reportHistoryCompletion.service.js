const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");

const REPORT_GROUPS = {
  SEARCHTERM: { cronName: "Search Term Report", types: ["spSearchTerm", "sbSearchTerm"] },
  PLACEMENTS: { cronName: "Placement Report", types: ["spCampaigns", "sbCampaignPlacement"] },
  "Targeting Report": { cronName: "Targeting Report", types: ["spTargeting", "sbTargeting", "sdTargeting"] },
  CAMPAIGNS: { cronName: "Campaign Report", types: ["spCampaigns", "sbCampaigns", "sdCampaigns"] },
  AD_GROUPS: { cronName: "AdGroups Report", types: ["spCampaigns", "sbAdGroups", "sdAdGroup"] },
};

const finalizeReportHistory = async (historyId) => {
  if (!historyId) return false;
  const history = await cronJobHistorySchema.findById(historyId).lean();
  if (!history || history.status === "FAILED") return false;
  const linked = await reportsSchema.find({ cronHistoryId: historyId })
    .select("reportName reportTypeId status").lean();
  const group = linked.length ? REPORT_GROUPS[linked[0].reportName] : null;
  if (!group || history.cronName !== group.cronName) return false;
  if (!group.types.every((type) => {
    const matches = linked.filter((report) => report.reportName === linked[0].reportName && report.reportTypeId === type);
    return matches.length > 0 && matches.every((report) => report.status === "COMPLETED");
  })) return false;
  await cronJobHistorySchema.updateOne({ _id: historyId, status: { $ne: "FAILED" } }, { $set: { status: "COMPLETED" } });
  return true;
};

const linkReportHistory = async ({ historyId, configId, profileId, reportName, startDate, endDate }) => {
  const group = REPORT_GROUPS[reportName];
  if (!historyId || !group) return;
  const history = await cronJobHistorySchema.findById(historyId).lean();
  // Weekly Report has its own broader lifecycle; this link is for a category's
  // dedicated cron history only.
  if (!history || history.cronName !== group.cronName) return;
  await reportsSchema.updateMany({
    configId, profileId, reportName, startDate, endDate,
    reportTypeId: { $in: group.types },
  }, { $set: { cronHistoryId: historyId } });
  await finalizeReportHistory(historyId);
};

module.exports = { linkReportHistory, finalizeReportHistory };
