const moment = require("moment-timezone");
const { getEligibleProfile } = require("./profileEligibility.service");
const { isShadowModeEnabled } = require("../../../shared/automationMode");
const {
  checkPrerequisiteStatus,
  claimSyncRun,
  markSyncRunCompleted,
  markSyncRunFailed,
  markSyncRunWaiting,
} = require("./syncRun.service");
const { SYNC_TASKS } = require("../../../queue-service/queues/queueNames");
const {
  DependencyNotReadyError,
  ProfileInactiveError,
  PermanentJobError,
  ReportImportPendingError,
} = require("../../../queue-service/contracts/errors");

// Controller delegates
const { cronListCampaignsFromAmazon, cronGenerateCampaignReport } = require("../../controllers/campaign.controller");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("../../controllers/adGroups.controller");
const { cronListTargetingFromAmazon, cronGenerateTargetingReport } = require("../../controllers/targeting.controller");
const { cronListProductAdsFromAmazon, cronGenerateAdProductReport } = require("../../controllers/productAds.controller");
const { cronGeneratePlacementReport } = require("../../controllers/placement.controller");
const { cronGenerateSearchTermReport } = require("../../controllers/searchTerm.controller");

/** Generate/poll targeting reports and require verified imports before completion. */
async function runTargetingReportSync({ pastSyncObj, configId, profileId, syncDate, scheduledFor }) {
  // BullMQ owns polling; do not start the legacy recurring report loop.
  const result = await cronGenerateTargetingReport(false, false, {
    ...pastSyncObj,
    startDate: syncDate,
    endDate: syncDate,
    recurring: false,
    reportRequestedAfter: scheduledFor,
  });

  if (result === "ERROR") {
    throw new Error("Targeting report request failed; see cron logs for the Amazon error.");
  }

  const reportsSchema = require("../../models/report.model");
  const reportTypes = ["spTargeting", "sbTargeting", "sdTargeting"];
  const reports = await reportsSchema.find({
    configId,
    profileId: Number(profileId),
    reportName: "Targeting Report",
    startDate: syncDate,
    endDate: syncDate,
    reportTypeId: { $in: reportTypes },
    $or: [
      { createdAt: { $gte: new Date(scheduledFor) } },
      // A request from a prior occurrence may finish during this job.
      { completedAt: { $gte: new Date(scheduledFor) } },
      {
        status: {
          $in: ["PENDING", "IN_PROGRESS", "PROCESSING", "STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"],
        },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    ],
  })
    .sort({ createdAt: -1 })
    .select("reportTypeId status errorMessage")
    .lean();

  const latestByType = new Map();
  for (const report of reports) {
    if (!latestByType.has(report.reportTypeId)) {
      latestByType.set(report.reportTypeId, report);
    }
  }

  const failedReport = [...latestByType.values()].find(report => report.status === "FAILED");
  if (failedReport) {
    throw new Error(
      `Targeting report import failed (${failedReport.reportTypeId}): ${failedReport.errorMessage || "see utility logs"}`
    );
  }

  const allCompleted = reportTypes.every(type => latestByType.get(type)?.status === "COMPLETED");
  if (!allCompleted) {
    throw new ReportImportPendingError(
      "Targeting reports are awaiting verified MongoDB import.",
      { task: SYNC_TASKS.TARGETING_REPORT, profileId, configId }
    );
  }

  return result;
}

/**
 * Runs a single hourly sync task for exactly one profile and time block.
 *
 * Enforces:
 * 1. Profile eligibility check (fails fast if inactive or unlicensed)
 * 2. Prerequisite dependency check (throws DependencyNotReadyError if predecessor not complete)
 * 3. Idempotent sync-run claiming (skips if already completed, resumes if retry)
 * 4. Task execution with isolated { profileId, configId } scope
 * 5. Sync-run state transitions and metrics recording
 * 6. Dry-run bypass in shadow mode (no external Amazon mutations)
 *
 * @param {Object} params
 * @param {string} params.task
 * @param {string} params.configId
 * @param {number} params.profileId
 * @param {string} params.timeBlock
 * @param {string} params.scheduledFor
 * @param {string} params.jobId
 */
async function runHourlySyncForProfile({ task, configId, profileId, timeBlock, scheduledFor, jobId }) {
  // 1. Revalidate single-profile eligibility
  const profile = await getEligibleProfile({ configId, profileId, syncType: "ads" });

  const isShadow = isShadowModeEnabled();
  const effectiveTimeBlock = isShadow ? `shadow-${timeBlock}` : timeBlock;

  // 2. Check prerequisite status for the given time block
  const prereqCheck = await checkPrerequisiteStatus({
    task,
    configId,
    profileId,
    timeBlock: effectiveTimeBlock,
  });

  if (!prereqCheck.ready) {
    throw new DependencyNotReadyError(
      `Prerequisite task "${prereqCheck.prerequisiteTask}" for ${task} (timeBlock: ${effectiveTimeBlock}) is not COMPLETED (current state: ${prereqCheck.prerequisiteState}).`,
      { task, configId, profileId, timeBlock: effectiveTimeBlock, prereqCheck }
    );
  }

  // 3. Claim sync run
  const claim = await claimSyncRun({
    task,
    configId,
    profileId,
    timeBlock: effectiveTimeBlock,
    scheduledFor,
    jobId,
    isDryRun: isShadow,
  });

  if (!claim.shouldExecute) {
    return {
      success: true,
      skipped: true,
      reason: claim.reason,
      syncRunId: claim.record?._id,
      dryRun: isShadow,
    };
  }

  const syncRunRecordId = claim.record._id;

  // In shadow dry-run mode, skip external Amazon calls and record verification completion
  if (isShadow) {
    await markSyncRunCompleted(syncRunRecordId, {
      dryRun: true,
      verifiedProfile: profile.name,
      prerequisiteTask: prereqCheck.prerequisiteTask || null,
    });

    return {
      success: true,
      dryRun: true,
      task,
      configId,
      profileId,
      timeBlock: effectiveTimeBlock,
      syncRunId: syncRunRecordId,
      profileName: profile.name,
    };
  }

  // Production live execution
  const syncDate = moment.tz(scheduledFor, profile.timezone || "UTC").format("YYYY-MM-DD");
  const pastSyncObj = {
    profileId: Number(profileId),
    configId: String(configId),
    dates: [syncDate],
    timeBlock,
  };

  try {
    let result = null;

    switch (task) {
      case SYNC_TASKS.CAMPAIGN_LISTING:
        result = await cronListCampaignsFromAmazon(pastSyncObj);
        break;
      case SYNC_TASKS.ADGROUP_LISTING:
        result = await cronListAdGroupsFromAmazon(pastSyncObj);
        break;
      case SYNC_TASKS.TARGETING_LISTING:
        result = await cronListTargetingFromAmazon(pastSyncObj);
        break;
      case SYNC_TASKS.PRODUCT_ADS_LISTING:
        result = await cronListProductAdsFromAmazon(pastSyncObj);
        break;
      case SYNC_TASKS.CAMPAIGN_REPORT:
        result = await cronGenerateCampaignReport(false, false, pastSyncObj);
        break;
      case SYNC_TASKS.ADGROUP_REPORT:
        result = await cronGenerateAdGroupReport(false, false, pastSyncObj);
        break;
      case SYNC_TASKS.TARGETING_REPORT:
        result = await runTargetingReportSync({
          pastSyncObj,
          configId,
          profileId,
          syncDate,
          scheduledFor,
        });
        break;
      case SYNC_TASKS.PRODUCT_ADS_REPORT:
        result = await cronGenerateAdProductReport(false, false, pastSyncObj);
        break;
      case SYNC_TASKS.PLACEMENT_REPORT:
        result = await cronGeneratePlacementReport(false, false, pastSyncObj);
        break;
      case SYNC_TASKS.SEARCH_TERM_REPORT:
        result = await cronGenerateSearchTermReport(false, false, pastSyncObj);
        break;
      case SYNC_TASKS.BIWEEKLY_REPORT:
        result = {
          campaign: await cronGenerateCampaignReport(false, true, pastSyncObj),
          adGroup: await cronGenerateAdGroupReport(false, true, pastSyncObj),
          targeting: await cronGenerateTargetingReport(false, true, pastSyncObj),
          productAds: await cronGenerateAdProductReport(false, true, pastSyncObj),
          placement: await cronGeneratePlacementReport(false, true, pastSyncObj),
          searchTerm: await cronGenerateSearchTermReport(false, true, pastSyncObj),
        };
        break;
      case SYNC_TASKS.WEEKLY_REPORT:
        result = {
          campaign: await cronGenerateCampaignReport(true, false, pastSyncObj),
          adGroup: await cronGenerateAdGroupReport(true, false, pastSyncObj),
          targeting: await cronGenerateTargetingReport(true, false, pastSyncObj),
          productAds: await cronGenerateAdProductReport(true, false, pastSyncObj),
          placement: await cronGeneratePlacementReport(true, false, pastSyncObj),
          searchTerm: await cronGenerateSearchTermReport(true, false, pastSyncObj),
        };
        break;
      default:
        throw new PermanentJobError(`Unsupported sync task: "${task}"`);
    }

    await markSyncRunCompleted(syncRunRecordId, { executedAt: new Date() });

    return {
      success: true,
      task,
      configId,
      profileId,
      timeBlock,
      result,
    };
  } catch (err) {
    if (err instanceof ReportImportPendingError) {
      await markSyncRunWaiting(syncRunRecordId, err);
      throw err;
    }
    await markSyncRunFailed(syncRunRecordId, err);
    throw err;
  }
}

module.exports = {
  runHourlySyncForProfile,
};
