const { getQueues } = require("../queues/queues");
const { generateJobId, formatTimeBlock } = require("../contracts/jobId");
const { validateJobPayload } = require("../contracts/jobPayload");
const { SP_API_TASKS } = require("../queues/queueNames");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Dispatches scheduled SP-API jobs to their configured BullMQ lane.
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

  const { spApiQueue, asinSnapshotQueue, outOfStockAdsQueue, fcInventoryLedgerQueue } = getQueues();
  const dedicatedQueues = {
    [SP_API_TASKS.ASIN_SNAPSHOT]: asinSnapshotQueue,
    [SP_API_TASKS.OUT_OF_STOCK_ADS]: outOfStockAdsQueue,
    [SP_API_TASKS.FC_INVENTORY_LEDGER]: fcInventoryLedgerQueue,
  };
  const queue = Object.hasOwn(dedicatedQueues, task) ? dedicatedQueues[task] : spApiQueue;
  const job = await queue.add(task, data, {
    jobId,
  });

  const durationMs = Date.now() - startTime;
  if (task === SP_API_TASKS.FC_INVENTORY_LEDGER) {
    cron_logs({
      message: `[SpApiProducer] Enqueued job for ${task} (queue: ${queue.name}, jobId: ${job.id}, scheduledFor: ${data.scheduledFor}, duration: ${durationMs}ms)`,
      log_type: "info",
    });
  } else {
    console.log(`[SpApiProducer] Enqueued job for ${task} (jobId: ${job.id}, duration: ${durationMs}ms)`);
  }

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
