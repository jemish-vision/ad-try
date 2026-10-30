const SyncRun = require("../../models/syncRun.model");
const { SYNC_TASKS } = require("../../../queue-service/queues/queueNames");

// Dependency mapping for hourly sync chain
const SYNC_PREREQUISITES = Object.freeze({
  [SYNC_TASKS.CAMPAIGN_LISTING]: null,
  [SYNC_TASKS.ADGROUP_LISTING]: SYNC_TASKS.CAMPAIGN_LISTING,
  [SYNC_TASKS.TARGETING_LISTING]: SYNC_TASKS.ADGROUP_LISTING,
  [SYNC_TASKS.PRODUCT_ADS_LISTING]: SYNC_TASKS.TARGETING_LISTING,
  [SYNC_TASKS.CAMPAIGN_REPORT]: SYNC_TASKS.PRODUCT_ADS_LISTING,
  [SYNC_TASKS.ADGROUP_REPORT]: SYNC_TASKS.CAMPAIGN_REPORT,
  [SYNC_TASKS.TARGETING_REPORT]: SYNC_TASKS.ADGROUP_REPORT,
  [SYNC_TASKS.PRODUCT_ADS_REPORT]: SYNC_TASKS.TARGETING_REPORT,
  [SYNC_TASKS.PLACEMENT_REPORT]: SYNC_TASKS.PRODUCT_ADS_REPORT,
  [SYNC_TASKS.SEARCH_TERM_REPORT]: SYNC_TASKS.PLACEMENT_REPORT,
});

class PrerequisiteNotMetError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PrerequisiteNotMetError";
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Checks whether the prerequisite sync run for the given timeBlock has completed successfully.
 */
async function checkPrerequisiteStatus({ task, configId, profileId, timeBlock }) {
  const prereqTask = SYNC_PREREQUISITES[task];
  if (!prereqTask) {
    return { ready: true };
  }

  const prereqRun = await SyncRun.findOne({
    task: prereqTask,
    configId,
    profileId,
    timeBlock,
  });

  if (!prereqRun || prereqRun.state !== "COMPLETED") {
    return {
      ready: false,
      prerequisiteTask: prereqTask,
      prerequisiteState: prereqRun ? prereqRun.state : "NOT_FOUND",
    };
  }

  return { ready: true, prerequisiteTask: prereqTask };
}

/**
 * Initializes or retrieves an existing sync run record for a specific hour block.
 */
async function claimSyncRun({ task, configId, profileId, timeBlock, scheduledFor, jobId, isDryRun = false }) {
  const identity = { task, configId, profileId, timeBlock };
  const now = new Date();

  const existing = await SyncRun.findOne(identity);
  if (existing) {
    if (existing.state === "COMPLETED") {
      return {
        shouldExecute: false,
        reason: "ALREADY_COMPLETED",
        record: existing,
      };
    }

    existing.jobId = jobId;
    existing.state = "RUNNING";
    existing.startedAt = now;
    existing.attempts = (existing.attempts || 0) + 1;
    existing.lastError = null;
    await existing.save();

    return {
      shouldExecute: true,
      reason: "RESUMED",
      record: existing,
    };
  }

  try {
    const created = await SyncRun.create({
      ...identity,
      state: "RUNNING",
      jobId,
      scheduledFor: new Date(scheduledFor),
      startedAt: now,
      attempts: 1,
      isDryRun,
    });

    return {
      shouldExecute: true,
      reason: "NEW",
      record: created,
    };
  } catch (err) {
    if (err.code === 11000) {
      const raced = await SyncRun.findOne(identity);
      if (raced && raced.state === "COMPLETED") {
        return {
          shouldExecute: false,
          reason: "ALREADY_COMPLETED",
          record: raced,
        };
      }
      return {
        shouldExecute: true,
        reason: "RESUMED_RACE",
        record: raced,
      };
    }
    throw err;
  }
}

/**
 * Updates provider report ID so retries reuse existing Amazon report request
 */
async function recordProviderReportId(recordId, providerReportId, providerRequestId = null) {
  return await SyncRun.findByIdAndUpdate(
    recordId,
    {
      $set: {
        providerReportId,
        providerRequestId,
      },
    },
    { new: true }
  );
}

/**
 * Marks sync run COMPLETED
 */
async function markSyncRunCompleted(recordId, resultCounts = {}) {
  return await SyncRun.findByIdAndUpdate(
    recordId,
    {
      $set: {
        state: "COMPLETED",
        completedAt: new Date(),
        resultCounts,
      },
    },
    { new: true }
  );
}

/**
 * Marks sync run FAILED
 */
async function markSyncRunFailed(recordId, error) {
  const lastError = error instanceof Error ? { message: error.message, stack: error.stack } : error;
  return await SyncRun.findByIdAndUpdate(
    recordId,
    {
      $set: {
        state: "FAILED",
        lastError,
      },
    },
    { new: true }
  );
}

async function markSyncRunWaiting(recordId, error) {
  return SyncRun.findByIdAndUpdate(recordId, {
    $set: { state: "WAITING", lastError: { message: error.message }, completedAt: null },
  }, { new: true });
}

module.exports = {
  checkPrerequisiteStatus,
  claimSyncRun,
  recordProviderReportId,
  markSyncRunCompleted,
  markSyncRunFailed,
  markSyncRunWaiting,
  SYNC_PREREQUISITES,
  PrerequisiteNotMetError,
};
