const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
require("dotenv").config();
require("../../shared/connection");
const mongoose = require("mongoose");

const { resolveMigratedSchedule } = require("../../queue-service/scheduler/scheduleRegistry");
const { generateJobId, formatTimeBlock } = require("../../queue-service/contracts/jobId");
const { validateJobPayload } = require("../../queue-service/contracts/jobPayload");
const { QUEUES, SYNC_TASKS } = require("../../queue-service/queues/queueNames");
const { isMigratedTask, shouldLegacyExecute } = require("../../shared/automationMode");
const { createHourlySyncProcessor } = require("../../queue-service/processors/hourlySync.processor");
const { enqueueSyncForOccurrence, enqueueHourlyDataConsolidation } = require("../../queue-service/producers/hourlySync.producer");
const { getQueues } = require("../../queue-service/queues/queues");

describe("Hourly Data Consolidation Queue Integration", () => {
  const sampleOccurrence = new Date("2026-10-15T02:30:00.000Z");

  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once("open", resolve));
    }
  });

  after(async () => {
    const { closeQueues } = require("../../queue-service/queues/queues");
    await closeQueues().catch(() => {});
    const { redisClient } = require("../../api-server/services/redis.service");
    if (redisClient?.isOpen) {
      await redisClient.quit().catch(() => {});
    }
    const { closeMongoConnection } = require("../../shared/connection");
    await closeMongoConnection().catch(() => {});
  });

  test("1. Schedule Registry resolves Hourly Data Consolidation variants", () => {
    const target1 = resolveMigratedSchedule("Hourly Data Consolidation");
    const target2 = resolveMigratedSchedule("HourlyDataConsolidation");
    const target3 = resolveMigratedSchedule("hourly-data-consolidation");

    assert.deepStrictEqual(target1, {
      queue: QUEUES.HOURLY_SYNC,
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      family: "sync",
    });
    assert.strictEqual(target2.task, SYNC_TASKS.HOURLY_DATA_CONSOLIDATION);
    assert.strictEqual(target3.task, SYNC_TASKS.HOURLY_DATA_CONSOLIDATION);
  });

  test("2. Automation Mode recognizes HourlyDataConsolidation as migrated", () => {
    assert.strictEqual(isMigratedTask("HourlyDataConsolidation"), true);
    assert.strictEqual(isMigratedTask("Hourly Data Consolidation"), true);

    const originalMode = process.env.AUTOMATION_EXECUTION_MODE;
    try {
      process.env.AUTOMATION_EXECUTION_MODE = "queue";
      assert.strictEqual(shouldLegacyExecute("HourlyDataConsolidation"), false);
      assert.strictEqual(shouldLegacyExecute("Hourly Data Consolidation"), false);

      process.env.AUTOMATION_EXECUTION_MODE = "legacy";
      assert.strictEqual(shouldLegacyExecute("HourlyDataConsolidation"), true);
      assert.strictEqual(shouldLegacyExecute("Hourly Data Consolidation"), true);
    } finally {
      process.env.AUTOMATION_EXECUTION_MODE = originalMode;
    }
  });

  test("3. Deterministic Job ID generation for Hourly Data Consolidation", () => {
    const jobId = generateJobId({
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      scheduledFor: sampleOccurrence,
    });

    const expectedDay = formatTimeBlock(sampleOccurrence, "day");
    assert.strictEqual(jobId, `sync-hourly-data-consolidation-${expectedDay}`);
    assert.strictEqual(jobId.includes(":"), false);

    const replayJobId = generateJobId({
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      scheduledFor: sampleOccurrence,
      replayId: "manual123",
    });
    assert.strictEqual(replayJobId, `sync-hourly-data-consolidation-${expectedDay}-replay-manual123`);
    assert.strictEqual(replayJobId.includes(":"), false);
  });

  test("4. Job Payload validation supports singleton Hourly Data Consolidation", () => {
    const timeBlock = formatTimeBlock(sampleOccurrence, "day");
    const payload = validateJobPayload({
      schemaVersion: 1,
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      scheduledFor: sampleOccurrence.toISOString(),
      timeBlock,
    });

    assert.strictEqual(payload.task, SYNC_TASKS.HOURLY_DATA_CONSOLIDATION);
    assert.strictEqual(payload.configId, "000000000000000000000000");
    assert.strictEqual(payload.profileId, 0);
    assert.strictEqual(payload.timeBlock, timeBlock);
  });

  test("5. HourlySyncProcessor handles HOURLY_DATA_CONSOLIDATION in shadow mode safely", async () => {
    const originalMode = process.env.AUTOMATION_EXECUTION_MODE;
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";

    try {
      const processor = createHourlySyncProcessor();
      const fakeJob = {
        id: "test-consolidation-shadow-1",
        data: {
          schemaVersion: 1,
          task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
          scheduledFor: sampleOccurrence.toISOString(),
          timeBlock: formatTimeBlock(sampleOccurrence, "day"),
        },
      };

      const result = await processor(fakeJob);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.task, SYNC_TASKS.HOURLY_DATA_CONSOLIDATION);
      assert.strictEqual(result.dryRun, true);
    } finally {
      process.env.AUTOMATION_EXECUTION_MODE = originalMode;
    }
  });

  test("6. Producer enqueues HOURLY_DATA_CONSOLIDATION as singleton into BullMQ", async () => {
    const { hourlySyncQueue } = getQueues();

    const enqResult = await enqueueHourlyDataConsolidation({
      scheduledFor: sampleOccurrence,
    });

    assert.strictEqual(enqResult.task, SYNC_TASKS.HOURLY_DATA_CONSOLIDATION);
    assert.strictEqual(enqResult.enqueuedCount, 1);
    assert.strictEqual(enqResult.totalProfiles, 1);

    const expectedJobId = generateJobId({
      task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION,
      scheduledFor: sampleOccurrence,
    });

    const job = await hourlySyncQueue.getJob(expectedJobId);
    assert.ok(job, "Hourly data consolidation singleton job must exist in BullMQ");
    assert.strictEqual(job.data.task, SYNC_TASKS.HOURLY_DATA_CONSOLIDATION);

    // Clean up enqueued test job
    await job.remove();
  });
});
