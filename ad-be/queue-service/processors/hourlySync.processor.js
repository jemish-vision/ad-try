const { DelayedError } = require("bullmq");
const moment = require("moment-timezone");
const { validateJobPayload } = require("../contracts/jobPayload");
const { SYNC_TASKS } = require("../queues/queueNames");
const { runHourlySyncForProfile } = require("../../api-server/services/automation/hourlySync.service");
const {
  DependencyNotReadyError,
  ProfileInactiveError,
  ReportImportPendingError,
} = require("../contracts/errors");
const { cron_logs } = require("../../winston/cronAutomation/logger");

const PREREQ_RETRY_DELAY_MS =
  parseInt(process.env.PREREQ_RETRY_DELAY_MS, 10) ||
  (process.env.AUTOMATION_EXECUTION_MODE === "shadow" ? 3000 : 60000);

function createHourlySyncProcessor() {
  return async function hourlySyncProcessor(job, token) {
    const validated = validateJobPayload(job.data);
    const { task, configId, profileId, scheduledFor, timeBlock } = validated;

    if (task === SYNC_TASKS.REPORT_BATCH_WRITER) {
      cron_logs({
        message: `[HourlySyncProcessor] [REPORT_BATCH_WRITER] Starting staged report batch draining (jobId: ${job.id})...`,
        log_type: "info",
      });
      const startTime = Date.now();
      try {
        const { processStagedReportBatches } = require("../../api-server/services/reportBatchWriter.service");
        const writeResult = await processStagedReportBatches();
        const duration = Date.now() - startTime;
        cron_logs({
          message: `[HourlySyncProcessor] [REPORT_BATCH_WRITER] Drained ${writeResult.totalBatchesProcessed} batch(es) to MongoDB in ${duration}ms`,
          log_type: "info",
        });
        return {
          success: true,
          task,
          result: writeResult,
        };
      } catch (err) {
        cron_logs({
          message: `[HourlySyncProcessor] [REPORT_BATCH_WRITER] Batch writer error: ${err?.stack || err?.message || err}`,
          log_type: "error",
        });
        throw err;
      }
    }

    if (task === SYNC_TASKS.HOURLY_DATA_CONSOLIDATION) {
      const { isShadowModeEnabled } = require("../../shared/automationMode");
      if (isShadowModeEnabled()) {
        cron_logs({
          message: `[HourlySyncProcessor] [HOURLY_DATA_CONSOLIDATION] Shadow mode enabled: skipped consolidation (jobId: ${job.id})`,
          log_type: "info",
        });
        return {
          success: true,
          task,
          dryRun: true,
          message: "Shadow mode enabled: skipped hourly data consolidation",
        };
      }

      cron_logs({
        message: `[HourlySyncProcessor] [HOURLY_DATA_CONSOLIDATION] Starting hourly data consolidation (jobId: ${job.id})...`,
        log_type: "info",
      });
      const startTime = Date.now();
      try {
        const { cronConsolidateHourlyData } = require("../../api-server/services/hourlyDataConsolidation.service");
        const consolidationResult = await cronConsolidateHourlyData();
        const duration = Date.now() - startTime;
        if (!consolidationResult.success) {
          const errMsg = consolidationResult.errors?.join("; ") || "Unknown error";
          cron_logs({
            message: `[HourlySyncProcessor] [HOURLY_DATA_CONSOLIDATION] Failed in ${duration}ms: ${errMsg}`,
            log_type: "error",
          });
          throw new Error(`Hourly data consolidation failed: ${errMsg}`);
        }
        cron_logs({
          message: `[HourlySyncProcessor] [HOURLY_DATA_CONSOLIDATION] Successfully completed in ${duration}ms`,
          log_type: "info",
        });
        return {
          success: true,
          task,
          result: consolidationResult,
        };
      } catch (err) {
        cron_logs({
          message: `[HourlySyncProcessor] [HOURLY_DATA_CONSOLIDATION] Error: ${err?.stack || err?.message || err}`,
          log_type: "error",
        });
        throw err;
      }
    }

    // Proactively discard stale sync jobs scheduled more than 6 hours ago
    const rawTimeBlock = (timeBlock || "").replace(/^shadow-/, "");
    const jobTime = moment.utc(rawTimeBlock, "YYYYMMDDTHHZ").isValid()
      ? moment.utc(rawTimeBlock, "YYYYMMDDTHHZ")
      : moment.utc(scheduledFor);

    if (jobTime.isValid() && moment.utc().diff(jobTime, "hours") >= 6) {
      const ageHours = moment.utc().diff(jobTime, "hours");
      cron_logs({
        message: `[HourlySyncProcessor] Stale job ${job.id} for ${task} (Profile: ${profileId}, timeBlock: ${timeBlock}, age: ${ageHours}h > 6h threshold). Gracefully skipping.`,
        log_type: "warn",
      });
      return {
        skipped: true,
        reason: "JOB_STALE_EXPIRED",
        timeBlock,
        task,
        profileId,
      };
    }

    try {
      cron_logs({
        message: `[HourlySyncProcessor] Starting task "${task}" for Profile: ${profileId} (Config: ${configId}, timeBlock: ${timeBlock}, jobId: ${job.id})`,
        log_type: "info",
      });
      const startTime = Date.now();
      const result = await runHourlySyncForProfile({
        task,
        configId,
        profileId,
        timeBlock,
        scheduledFor,
        jobId: job.id,
      });
      const duration = Date.now() - startTime;
      cron_logs({
        message: `[HourlySyncProcessor] Finished task "${task}" for Profile: ${profileId} in ${duration}ms | State: ${result?.state || (result?.success ? "COMPLETED" : "DONE")}`,
        log_type: "info",
      });

      return result;
    } catch (err) {
      if (err instanceof ReportImportPendingError) {
        cron_logs({
          message: `[HourlySyncProcessor] ${task} for Profile: ${profileId} is waiting for report import; polling again in ${Math.round(PREREQ_RETRY_DELAY_MS / 1000)}s.`,
          log_type: "info",
        });
        await job.moveToDelayed(Date.now() + PREREQ_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }
      if (err instanceof DependencyNotReadyError) {
        const rawTimeBlock = (timeBlock || "").replace(/^shadow-/, "");
        const jobTime = moment.utc(rawTimeBlock, "YYYYMMDDTHHZ");
        const isStale = jobTime.isValid() && moment.utc().diff(jobTime, "hours") >= 6;
        const prereqRetries = (job.data._prereqRetries || 0) + 1;

        // These report tasks depend directly or transitively on targeting's
        // verified import. Amazon processing can legitimately exceed ten polls.
        const waitsForTargetingImport = [
          SYNC_TASKS.PRODUCT_ADS_REPORT,
          SYNC_TASKS.PLACEMENT_REPORT,
          SYNC_TASKS.SEARCH_TERM_REPORT,
        ].includes(task);
        const retryProgress = waitsForTargetingImport
          ? `check #${prereqRetries}; six-hour expiry applies`
          : `check ${prereqRetries}/10`;
        if (isStale || (!waitsForTargetingImport && prereqRetries > 10)) {
          cron_logs({
            message: `[HourlySyncProcessor] Prerequisite expired for job ${job.id} (${task}, Profile: ${profileId}, ${retryProgress}): ${isStale ? "six-hour expiry reached" : "retry limit reached"}. Gracefully skipping.`,
            log_type: "warn",
          });
          return {
            skipped: true,
            reason: "PREREQUISITE_EXPIRED",
            timeBlock,
            task,
            profileId,
            prerequisiteTask: err.details?.prereqCheck?.prerequisiteTask,
          };
        }

        job.data._prereqRetries = prereqRetries;
        if (typeof job.updateData === "function") {
          await job.updateData(job.data);
        }

        cron_logs({
          message: `[HourlySyncProcessor] Prerequisite not ready for job ${job.id} (${task}, Profile: ${profileId}): ${err.message}. Rescheduling in ${Math.round(PREREQ_RETRY_DELAY_MS / 1000)}s (${retryProgress})...`,
          log_type: "warn",
        });
        await job.moveToDelayed(Date.now() + PREREQ_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }

      if (err instanceof ProfileInactiveError) {
        cron_logs({
          message: `[HourlySyncProcessor] Profile ${profileId} is inactive for task "${task}". Gracefully skipping: ${err.message}`,
          log_type: "info",
        });
        return {
          skipped: true,
          reason: "PROFILE_INACTIVE",
          message: err.message,
        };
      }

      cron_logs({
        message: `[HourlySyncProcessor] Error executing "${task}" for Profile: ${profileId} (jobId: ${job.id}): ${err?.stack || err?.message || err}`,
        log_type: "error",
      });
      throw err;
    }
  };
}

module.exports = {
  createHourlySyncProcessor,
};
