const { getQueues } = require("../queues/queues");
const { generateJobId, formatTimeBlock } = require("../contracts/jobId");
const { validateJobPayload } = require("../contracts/jobPayload");
const { SYNC_TASKS } = require("../queues/queueNames");
const { getActivePlanProfiles } = require("../../api-server/helper/common");

/**
 * Dispatches hourly sync jobs for all eligible profiles for an intended hour block,
 * or dispatches singleton jobs like REPORT_BATCH_WRITER.
 *
 * @param {Object} params
 * @param {string} params.task e.g. "campaign-listing", "report-batch-writer"
 * @param {Date|string} params.scheduledFor Intended cron occurrence timestamp
 * @param {'scheduled'|'manual'|'replay'} [params.trigger='scheduled']
 */
async function enqueueSyncForOccurrence({ task, scheduledFor, trigger = "scheduled" }) {
  const occurrenceDate = new Date(scheduledFor);
  const startTime = Date.now();

  // Handle singleton jobs like REPORT_BATCH_WRITER
  if (task === SYNC_TASKS.REPORT_BATCH_WRITER) {
    const timeBlock = formatTimeBlock(occurrenceDate, "minute");
    const jobId = generateJobId({
      task: SYNC_TASKS.REPORT_BATCH_WRITER,
      scheduledFor: occurrenceDate,
    });
    const data = validateJobPayload({
      schemaVersion: 1,
      task: SYNC_TASKS.REPORT_BATCH_WRITER,
      scheduledFor: occurrenceDate.toISOString(),
      timeBlock,
      trigger,
    });

    const { hourlySyncQueue } = getQueues();
    const job = await hourlySyncQueue.add(task, data, {
      jobId,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
      attempts: 2,
    });

    const durationMs = Date.now() - startTime;
    console.log(
      `[HourlySyncProducer] Enqueued singleton job for ${task} (jobId: ${job.id}, duration: ${durationMs}ms)`
    );
    return {
      task,
      scheduledFor: occurrenceDate.toISOString(),
      timeBlock,
      totalProfiles: 1,
      enqueuedCount: 1,
      durationMs,
    };
  }

  if (task === SYNC_TASKS.HOURLY_DATA_CONSOLIDATION) {
    const timeBlock = formatTimeBlock(occurrenceDate, "day");
    const jobId = generateJobId({
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      scheduledFor: occurrenceDate,
    });
    const data = validateJobPayload({
      schemaVersion: 1,
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      scheduledFor: occurrenceDate.toISOString(),
      timeBlock,
      trigger,
    });

    const { hourlySyncQueue } = getQueues();
    const job = await hourlySyncQueue.add(task, data, {
      jobId,
      removeOnComplete: { age: 86400 * 7 },
      removeOnFail: { age: 86400 * 14 },
      attempts: 2,
    });

    const durationMs = Date.now() - startTime;
    console.log(
      `[HourlySyncProducer] Enqueued singleton job for ${task} (jobId: ${job.id}, duration: ${durationMs}ms)`
    );
    return {
      task,
      scheduledFor: occurrenceDate.toISOString(),
      timeBlock,
      totalProfiles: 1,
      enqueuedCount: 1,
      durationMs,
    };
  }

  const timeBlock = formatTimeBlock(occurrenceDate, "hour");

  // 1. Discover active, eligible profiles
  const profiles = await getActivePlanProfiles("ALL", "ads");
  if (!profiles || profiles.length === 0) {
    return {
      task,
      scheduledFor: occurrenceDate.toISOString(),
      timeBlock,
      totalProfiles: 0,
      enqueuedCount: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Build bulk jobs with deterministic job IDs
  const jobsToEnqueue = profiles.map((profile) => {
    const configId = String(profile.configId);
    const profileId = Number(profile.profileId);

    const jobId = generateJobId({
      task,
      configId,
      profileId,
      scheduledFor: occurrenceDate,
    });

    const data = validateJobPayload({
      schemaVersion: 1,
      task,
      configId,
      profileId,
      scheduledFor: occurrenceDate.toISOString(),
      timeBlock,
      trigger,
    });

    return {
      name: task,
      data,
      opts: {
        jobId,
      },
    };
  });

  // 3. Add to BullMQ via addBulk
  const { hourlySyncQueue } = getQueues();
  const enqueued = await hourlySyncQueue.addBulk(jobsToEnqueue);

  const durationMs = Date.now() - startTime;
  console.log(
    `[HourlySyncProducer] Enqueued ${enqueued.length}/${profiles.length} jobs for ${task} (timeBlock: ${timeBlock}, duration: ${durationMs}ms)`
  );

  return {
    task,
    scheduledFor: occurrenceDate.toISOString(),
    timeBlock,
    totalProfiles: profiles.length,
    enqueuedCount: enqueued.length,
    durationMs,
  };
}

async function enqueueReportBatchWriter({ scheduledFor = new Date(), trigger = "scheduled" } = {}) {
  return enqueueSyncForOccurrence({
    task: SYNC_TASKS.REPORT_BATCH_WRITER,
    scheduledFor,
    trigger,
  });
}

async function enqueueHourlyDataConsolidation({ scheduledFor = new Date(), trigger = "scheduled" } = {}) {
  return enqueueSyncForOccurrence({
    task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
    scheduledFor,
    trigger,
  });
}

module.exports = {
  enqueueSyncForOccurrence,
  enqueueReportBatchWriter,
  enqueueHourlyDataConsolidation,
};
