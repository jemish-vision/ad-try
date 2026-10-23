const { getQueues } = require("../queues/queues");
const { generateJobId, formatTimeBlock } = require("../contracts/jobId");
const { validateJobPayload } = require("../contracts/jobPayload");
const { getActivePlanProfiles } = require("../../api-server/helper/common");

/**
 * Dispatches rule evaluation jobs for all eligible profiles for an intended occurrence.
 *
 * @param {Object} params
 * @param {string} params.task e.g. "budget-rules"
 * @param {Date|string} params.scheduledFor Intended cron occurrence timestamp
 * @param {'scheduled'|'manual'|'replay'} [params.trigger='scheduled']
 */
async function enqueueRulesForOccurrence({ task, scheduledFor, trigger = "scheduled" }) {
  const occurrenceDate = new Date(scheduledFor);
  const timeBlock = formatTimeBlock(occurrenceDate, "minute");
  const startTime = Date.now();

  // 1. Discover all active, eligible profiles
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
  const { rulesQueue } = getQueues();
  const enqueued = await rulesQueue.addBulk(jobsToEnqueue);

  const durationMs = Date.now() - startTime;
  console.log(
    `[RulesProducer] Enqueued ${enqueued.length}/${profiles.length} jobs for ${task} (timeBlock: ${timeBlock}, duration: ${durationMs}ms)`
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

module.exports = {
  enqueueRulesForOccurrence,
};
