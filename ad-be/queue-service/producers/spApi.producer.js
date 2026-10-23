const { getQueues } = require("../queues/queues");
const { generateJobId, formatTimeBlock } = require("../contracts/jobId");
const { validateJobPayload } = require("../contracts/jobPayload");
const { SP_API_TASKS } = require("../queues/queueNames");

/**
 * Dispatches SP-API scheduled batch jobs into the dedicated BullMQ sp-api-queue.
 *
 * @param {Object} params
 * @param {string} params.task e.g. "sync-order", "sync-inventory", "brand-analytics-report"
 * @param {Date|string} [params.scheduledFor=new Date()] Intended cron occurrence timestamp
 * @param {'scheduled'|'manual'|'replay'} [params.trigger='scheduled']
 */
async function enqueueSpApiForOccurrence({ task, scheduledFor = new Date(), trigger = "scheduled" }) {
  const occurrenceDate = new Date(scheduledFor);
  const startTime = Date.now();
  const timeBlock = formatTimeBlock(occurrenceDate, "minute");

  const jobId = generateJobId({
    task,
    scheduledFor: occurrenceDate,
  });

  const data = validateJobPayload({
    schemaVersion: 1,
    task,
    scheduledFor: occurrenceDate.toISOString(),
    timeBlock,
    trigger,
  });

  const { spApiQueue } = getQueues();
  const job = await spApiQueue.add(task, data, {
    jobId,
  });

  const durationMs = Date.now() - startTime;
  console.log(
    `[SpApiProducer] Enqueued job for ${task} (jobId: ${job.id}, duration: ${durationMs}ms)`
  );

  return {
    task,
    scheduledFor: occurrenceDate.toISOString(),
    timeBlock,
    jobId: job.id,
    enqueuedCount: 1,
    durationMs,
  };
}

module.exports = {
  enqueueSpApiForOccurrence,
};
