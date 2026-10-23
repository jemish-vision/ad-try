const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
require("dotenv").config();

const { getQueues, closeQueues } = require("../../queue-service/queues/queues");
const { generateJobId, formatTimeBlock } = require("../../queue-service/contracts/jobId");
const { validateJobPayload } = require("../../queue-service/contracts/jobPayload");
const { RULE_TASKS } = require("../../queue-service/queues/queueNames");

describe("1. Distributed Real Redis Job Deduplication", () => {
  let rulesQueue;
  const sampleConfigId = "64f1234567890abcdef12345";
  const sampleProfileId = 888777666;
  const occurrence = new Date("2026-10-09T12:00:00.000Z");
  const timeBlock = formatTimeBlock(occurrence, "minute");

  before(async () => {
    const queues = getQueues();
    rulesQueue = queues.rulesQueue;
  });

  after(async () => {
    const jobId = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: occurrence,
    });
    try {
      const job = await rulesQueue.getJob(jobId);
      if (job) await job.remove();
    } catch (_) {}
    await closeQueues();
  });

  test("Two concurrent producers adding identical job result in exactly 1 queued job", async () => {
    const jobId = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: occurrence,
    });

    const payload = validateJobPayload({
      schemaVersion: 1,
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: occurrence.toISOString(),
      timeBlock,
      trigger: "scheduled",
    });

    // Clean up if exists from prior runs
    const existing = await rulesQueue.getJob(jobId);
    if (existing) await existing.remove();

    // Two concurrent producers enqueue simultaneously
    const [job1, job2] = await Promise.all([
      rulesQueue.add(RULE_TASKS.BUDGET, payload, { jobId }),
      rulesQueue.add(RULE_TASKS.BUDGET, payload, { jobId }),
    ]);

    assert.strictEqual(job1.id, jobId);
    assert.strictEqual(job2.id, jobId);

    // Verify only 1 job exists in the queue
    const fetchedJob = await rulesQueue.getJob(jobId);
    assert.ok(fetchedJob, "Job must exist in queue");
    assert.strictEqual(fetchedJob.id, jobId);
    assert.strictEqual(fetchedJob.data.profileId, sampleProfileId);
  });

  test("Different schedule blocks generate distinct jobs", async () => {
    const nextOccurrence = new Date("2026-10-09T12:01:00.000Z");
    const nextTimeBlock = formatTimeBlock(nextOccurrence, "minute");

    const idBlock1 = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: occurrence,
    });

    const idBlock2 = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: nextOccurrence,
    });

    assert.notStrictEqual(idBlock1, idBlock2, "Different minute blocks must generate distinct job IDs");
    assert.ok(idBlock1.endsWith("20261009T1200Z"));
    assert.ok(idBlock2.endsWith("20261009T1201Z"));
  });
});
