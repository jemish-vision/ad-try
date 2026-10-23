const { DelayedError } = require("bullmq");
const moment = require("moment-timezone");
const { validateJobPayload } = require("../contracts/jobPayload");
const { SYNC_TASKS } = require("../queues/queueNames");
const { runHourlySyncForProfile } = require("../../api-server/services/automation/hourlySync.service");
const {
  DependencyNotReadyError,
  ProfileInactiveError,
} = require("../contracts/errors");

const PREREQ_RETRY_DELAY_MS =
  parseInt(process.env.PREREQ_RETRY_DELAY_MS, 10) ||
  (process.env.AUTOMATION_EXECUTION_MODE === "shadow" ? 3000 : 60000);

function createHourlySyncProcessor() {
  return async function hourlySyncProcessor(job, token) {
    const validated = validateJobPayload(job.data);
    const { task, configId, profileId, scheduledFor, timeBlock } = validated;

    if (task === SYNC_TASKS.REPORT_BATCH_WRITER) {
      const { processStagedReportBatches } = require("../../api-server/services/reportBatchWriter.service");
      const writeResult = await processStagedReportBatches();
      return {
        success: true,
        task,
        result: writeResult,
      };
    }

    if (task === SYNC_TASKS.HOURLY_DATA_CONSOLIDATION) {
      const { isShadowModeEnabled } = require("../../shared/automationMode");
      if (isShadowModeEnabled()) {
        return {
          success: true,
          task,
          dryRun: true,
          message: "Shadow mode enabled: skipped hourly data consolidation",
        };
      }

      const { cronConsolidateHourlyData } = require("../../api-server/services/hourlyDataConsolidation.service");
      const consolidationResult = await cronConsolidateHourlyData();
      if (!consolidationResult.success) {
        throw new Error(
          `Hourly data consolidation failed: ${consolidationResult.errors?.join("; ") || "Unknown error"}`
        );
      }
      return {
        success: true,
        task,
        result: consolidationResult,
      };
    }

    try {
      const result = await runHourlySyncForProfile({
        task,
        configId,
        profileId,
        timeBlock,
        scheduledFor,
        jobId: job.id,
      });

      return result;
    } catch (err) {
      if (err instanceof DependencyNotReadyError) {
        const rawTimeBlock = (timeBlock || "").replace(/^shadow-/, "");
        const jobTime = moment.utc(rawTimeBlock, "YYYYMMDDTHHZ");
        const isStale = jobTime.isValid() && moment.utc().diff(jobTime, "hours") >= 6;
        const prereqRetries = (job.data._prereqRetries || 0) + 1;

        if (isStale || prereqRetries > 10) {
          console.warn(
            `[HourlySyncProcessor] Prerequisite timed out for stale job ${job.id} (timeBlock: ${timeBlock}, retries: ${prereqRetries}). Gracefully skipping.`
          );
          return {
            skipped: true,
            reason: "PREREQUISITE_EXPIRED",
            timeBlock,
            task,
            prerequisiteTask: err.details?.prereqCheck?.prerequisiteTask,
          };
        }

        job.data._prereqRetries = prereqRetries;
        if (typeof job.updateData === "function") {
          await job.updateData(job.data);
        }

        console.log(
          `[HourlySyncProcessor] Prerequisite not ready for job ${job.id}: ${err.message}. Rescheduling in ${PREREQ_RETRY_DELAY_MS}ms (attempt ${prereqRetries}/10).`
        );
        await job.moveToDelayed(Date.now() + PREREQ_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }

      if (err instanceof ProfileInactiveError) {
        return {
          skipped: true,
          reason: "PROFILE_INACTIVE",
          message: err.message,
        };
      }

      throw err;
    }
  };
}

module.exports = {
  createHourlySyncProcessor,
};
