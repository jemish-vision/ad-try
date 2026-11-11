const cronJobHistorySchema = require("../models/cronJobHistory.model");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Standard Helper for Recording Detailed Cron and Report Execution History
 */

/**
 * Records the initiation of a cron job or report sync with metadata.
 */
async function recordCronStart({
  configId = null,
  profileId = null,
  cronName,
  historyDate = null,
  startDate = null,
  endDate = null,
  reportType = null,
  details = {},
} = {}) {
  try {
    const today = historyDate || new Date().toISOString().substring(0, 10);
    const query = {
      cronName,
      historyDate: today,
      configId: configId || null,
      profileId: profileId || null,
    };

    const setPayload = {
      status: "PENDING",
      startDate,
      endDate,
      reportType,
      "details.startedAt": new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(details).map(([k, v]) => [`details.${k}`, v])
      ),
    };

    const doc = await cronJobHistorySchema.findOneAndUpdate(
      query,
      { $set: setPayload },
      { new: true, upsert: true }
    );

    return doc;
  } catch (err) {
    cron_logs({
      message: `[cronHistory.helper] Failed to record start for ${cronName}: ${err.message}`,
      log_type: "warn",
    });
    return null;
  }
}

/**
 * Records successful completion with processed count, duration, and execution details.
 */
async function recordCronSuccess({
  historyId,
  configId = null,
  profileId = null,
  cronName,
  historyDate = null,
  recordsCount = 0,
  durationMs = null,
  details = {},
} = {}) {
  try {
    const today = historyDate || new Date().toISOString().substring(0, 10);
    const query = historyId
      ? { _id: historyId }
      : {
          cronName,
          historyDate: today,
          configId: configId || null,
          profileId: profileId || null,
        };

    const setPayload = {
      status: "COMPLETED",
      recordsCount,
      "details.completedAt": new Date().toISOString(),
      ...(durationMs !== null && durationMs !== undefined ? { durationMs } : {}),
      ...Object.fromEntries(
        Object.entries(details).map(([k, v]) => [`details.${k}`, v])
      ),
    };

    const doc = await cronJobHistorySchema.findOneAndUpdate(
      query,
      { $set: setPayload },
      { new: true, upsert: true }
    );

    return doc;
  } catch (err) {
    cron_logs({
      message: `[cronHistory.helper] Failed to record success for ${cronName}: ${err.message}`,
      log_type: "warn",
    });
    return null;
  }
}

/**
 * Records failure with error message, stack trace, and execution details.
 */
async function recordCronFailure({
  historyId,
  configId = null,
  profileId = null,
  cronName,
  historyDate = null,
  error = "Unknown error",
  durationMs = null,
  details = {},
} = {}) {
  try {
    const today = historyDate || new Date().toISOString().substring(0, 10);
    const errorStr = error?.message || String(error);
    const query = historyId
      ? { _id: historyId }
      : {
          cronName,
          historyDate: today,
          configId: configId || null,
          profileId: profileId || null,
        };

    const setPayload = {
      status: "FAILED",
      error: errorStr,
      "details.failedAt": new Date().toISOString(),
      "details.errorMessage": errorStr,
      ...(durationMs !== null && durationMs !== undefined ? { durationMs } : {}),
      ...Object.fromEntries(
        Object.entries(details).map(([k, v]) => [`details.${k}`, v])
      ),
    };

    const doc = await cronJobHistorySchema.findOneAndUpdate(
      query,
      { $set: setPayload },
      { new: true, upsert: true }
    );

    return doc;
  } catch (err) {
    cron_logs({
      message: `[cronHistory.helper] Failed to record failure for ${cronName}: ${err.message}`,
      log_type: "warn",
    });
    return null;
  }
}

/**
 * Direct Upsert of Execution Status and Metrics (Safe alternative to createCronHistory.save())
 */
async function recordCronExecution({
  historyId,
  configId = null,
  profileId = null,
  cronName,
  historyDate = null,
  status = "COMPLETED",
  recordsCount = 0,
  durationMs = null,
  error = null,
  details = {},
} = {}) {
  try {
    const today = historyDate || new Date().toISOString().substring(0, 10);
    const query = historyId
      ? { _id: historyId }
      : {
          cronName,
          historyDate: today,
          configId: configId || null,
          profileId: profileId || null,
        };

    const setPayload = {
      status,
      recordsCount,
      ...(error ? { error: error?.message || String(error) } : {}),
      ...(durationMs !== null && durationMs !== undefined ? { durationMs } : {}),
      "details.executedAt": new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(details).map(([k, v]) => [`details.${k}`, v])
      ),
    };

    const doc = await cronJobHistorySchema.findOneAndUpdate(
      query,
      { $set: setPayload },
      { new: true, upsert: true }
    );

    return doc;
  } catch (err) {
    cron_logs({
      message: `[cronHistory.helper] recordCronExecution error for ${cronName}: ${err.message}`,
      log_type: "warn",
    });
    return null;
  }
}

module.exports = {
  recordCronStart,
  recordCronSuccess,
  recordCronFailure,
  recordCronExecution,
};
