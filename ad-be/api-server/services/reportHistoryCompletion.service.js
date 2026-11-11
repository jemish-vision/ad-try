const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");

const REPORT_GROUPS = {
  "Weekly Report": {
    cronName: "Weekly Report",
    cronNames: ["Weekly Report"],
    types: ["spCampaigns", "sbCampaigns", "sdCampaigns", "spTargeting", "sbTargeting", "sdTargeting", "spSearchTerm", "sbSearchTerm", "spAdvertisedProduct", "sdAdvertisedProduct", "spProductAds", "sbAdGroups", "sdAdGroup", "sbCampaignPlacement"],
  },
  "BiWeekly Report": {
    cronName: "BiWeekly Report",
    cronNames: ["BiWeekly Report"],
    types: ["spCampaigns", "sbCampaigns", "sdCampaigns", "spTargeting", "sbTargeting", "sdTargeting", "spSearchTerm", "sbSearchTerm", "spAdvertisedProduct", "sdAdvertisedProduct", "spProductAds", "sbAdGroups", "sdAdGroup", "sbCampaignPlacement"],
  },
  SEARCHTERM: {
    cronName: "SearchTerm Report",
    cronNames: ["SearchTerm Report", "Search Term Report", "Weekly Report", "BiWeekly Report"],
    types: ["spSearchTerm", "sbSearchTerm"],
  },
  PLACEMENTS: {
    cronName: "Placement Report",
    cronNames: ["Placement Report", "Weekly Report", "BiWeekly Report"],
    types: ["spCampaigns", "sbCampaignPlacement"],
  },
  "Targeting Report": {
    cronName: "Targeting Report",
    cronNames: ["Targeting Report", "Weekly Report", "BiWeekly Report"],
    types: ["spTargeting", "sbTargeting", "sdTargeting"],
  },
  CAMPAIGNS: {
    cronName: "Campaign Report",
    cronNames: ["Campaign Report", "Weekly Report", "BiWeekly Report"],
    types: ["spCampaigns", "sbCampaigns", "sdCampaigns"],
  },
  AD_GROUPS: {
    cronName: "AdGroup Report",
    cronNames: ["AdGroup Report", "AdGroups Report", "Weekly Report", "BiWeekly Report"],
    types: ["spCampaigns", "sbAdGroups", "sbAdGroup", "sdAdGroup"],
  },
  PRODUCT_ADS: {
    cronName: "ProductAds Report",
    cronNames: ["ProductAds Report", "Weekly Report", "BiWeekly Report"],
    types: ["spAdvertisedProduct", "sdAdvertisedProduct", "spProductAds"],
  },
};

const finalizeReportHistory = async (historyId, extraDetails = {}) => {
  if (!historyId) return false;
  const history = await cronJobHistorySchema.findById(historyId).lean();
  if (!history || history.status === "FAILED") return false;
  const linked = await reportsSchema.find({ cronHistoryId: historyId })
    .select("reportName reportTypeId status").lean();
  if (!linked.length) return false;

  const group = (linked.length && REPORT_GROUPS[linked[0].reportName]) || REPORT_GROUPS[history.cronName];
  if (!group || !group.cronNames.includes(history.cronName)) return false;

  const distinctTypes = [...new Set(linked.map((r) => r.reportTypeId))];
  const completedTypes = [...new Set(linked.filter((r) => r.status === "COMPLETED").map((r) => r.reportTypeId))];

  const isComplete = group.types.every((type) => {
    const matches = linked.filter((report) => report.reportTypeId === type);
    if (matches.length === 0) return true;
    return matches.some((report) => report.status === "COMPLETED");
  }) && distinctTypes.length > 0 && distinctTypes.every((t) => completedTypes.includes(t));

  if (!isComplete) return false;

  await cronJobHistorySchema.updateOne(
    { _id: historyId, status: { $ne: "FAILED" } },
    {
      $set: {
        status: "COMPLETED",
        "details.reportGroup": group.cronName,
        "details.linkedReportTypes": distinctTypes,
        "details.completedReportCount": linked.filter((r) => r.status === "COMPLETED").length,
        "details.completedAt": new Date().toISOString(),
        ...extraDetails,
      },
    }
  );
  return true;
};

const linkReportHistory = async ({ historyId, configId, profileId, reportName, startDate, endDate }) => {
  const group = REPORT_GROUPS[reportName];
  if (!historyId || !group) return;
  const history = await cronJobHistorySchema.findById(historyId).lean();
  // Dedicated cron history link
  if (!history || !group.cronNames.includes(history.cronName)) return;
  await reportsSchema.updateMany({
    configId, profileId, reportName, startDate, endDate,
    reportTypeId: { $in: group.types },
  }, { $set: { cronHistoryId: historyId } });

  await cronJobHistorySchema.updateOne(
    { _id: historyId },
    {
      $set: {
        startDate,
        endDate,
        reportType: reportName,
        "details.reportName": reportName,
        "details.startDate": startDate,
        "details.endDate": endDate,
        "details.linkedAt": new Date().toISOString(),
      },
    }
  );

  await finalizeReportHistory(historyId);
};

module.exports = { linkReportHistory, finalizeReportHistory };
