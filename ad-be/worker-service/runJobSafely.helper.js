const {
  recordCronStart,
  recordCronSuccess,
  recordCronFailure,
} = require("../api-server/helper/cronHistory.helper");
const { cron_logs } = require("../winston/cronAutomation/logger");
let sendThrottledCronAlert = null;
try {
  const hb = require("../api-server/helper/heartbeat.helper");
  sendThrottledCronAlert = hb.sendThrottledCronAlert;
} catch (_) {}

/**
 * Higher-order runner that wraps worker tasks with standard start, success, and failure
 * telemetry into cronJobHistory. Catches errors safely to prevent worker thread crashes.
 *
 * @param {string} workerName Name of worker process (e.g. "worker-fast", "worker-heavy", "worker-report")
 * @returns {Function} (taskName: string, fn: Function) => Promise<any>
 */
function createRunJobSafely(workerName = "worker") {
  return async function runJobSafely(taskName, fn) {
    const startTime = Date.now();
    const today = new Date().toISOString().substring(0, 10);

    let startDoc = null;
    try {
      startDoc = await recordCronStart({
        cronName: taskName,
        historyDate: today,
        details: {
          worker: workerName,
          startedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      cron_logs({
        message: `[${workerName}] Failed to record start for ${taskName}: ${e.message}`,
        log_type: "warn",
      });
    }

    try {
      const result = await fn();

      const durationMs = Date.now() - startTime;
      const recordsCount = Number(result?.recordsCount) || 0;
      const details = result?.details || {};

      await recordCronSuccess({
        historyId: startDoc?._id,
        cronName: taskName,
        historyDate: today,
        recordsCount,
        durationMs,
        details: {
          worker: workerName,
          ...details,
        },
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      cron_logs({
        message: `[${workerName}] Error in ${taskName}: ${err.message}`,
        log_type: "error",
      });

      if (typeof sendThrottledCronAlert === "function") {
        await sendThrottledCronAlert(taskName, err).catch(() => {});
      }

      await recordCronFailure({
        historyId: startDoc?._id,
        cronName: taskName,
        historyDate: today,
        error: err.message,
        durationMs,
        details: {
          worker: workerName,
          errorMessage: err.message,
        },
      });

      return null;
    }
  };
}

module.exports = {
  createRunJobSafely,
};
