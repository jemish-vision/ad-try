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
const { runHourlySyncForProfile } = require("../../api-server/services/automation/hourlySync.service");
const SyncRun = require("../../api-server/models/syncRun.model");

describe("BiWeekly Report and ReportBatchWriter Queue Integration", () => {
  let testConfigId = "694120f451f2bf9640c4b27f";
  let testProfileId = 1451708219889308;
  const sampleOccurrence = new Date("2026-10-14T08:00:00.000Z");

  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => mongoose.connection.once("open", resolve));
    }
    const { getActivePlanProfiles } = require("../../api-server/helper/common");
    const profiles = await getActivePlanProfiles("ALL", "ads").catch(() => []);
    if (profiles && profiles.length > 0) {
      testConfigId = profiles[0].configId?.toString();
      testProfileId = profiles[0].profileId;
    }
  });

  after(async () => {
    await SyncRun.deleteMany({
      configId: testConfigId,
      profileId: testProfileId,
    });
    const { closeQueues } = require("../../queue-service/queues/queues");
    await closeQueues().catch(() => {});
    const { redisClient } = require("../../api-server/services/redis.service");
    if (redisClient?.isOpen) {
      await redisClient.quit().catch(() => {});
    }
    const { closeMongoConnection } = require("../../shared/connection");
    await closeMongoConnection().catch(() => {});
  });

  test("1. Schedule Registry resolves BiWeeklyReport, WeeklyReport, and ReportBatchWriter", () => {
    const biweekly1 = resolveMigratedSchedule("BiWeekly Report");
    const biweekly2 = resolveMigratedSchedule("BiWeeklyReport");
    assert.deepStrictEqual(biweekly1, {
      queue: QUEUES.HOURLY_SYNC,
      task: SYNC_TASKS.BIWEEKLY_REPORT,
      family: "sync",
    });
    assert.strictEqual(biweekly2.task, SYNC_TASKS.BIWEEKLY_REPORT);

    const weekly = resolveMigratedSchedule("Weekly Report");
    assert.deepStrictEqual(weekly, {
      queue: QUEUES.HOURLY_SYNC,
      task: SYNC_TASKS.WEEKLY_REPORT,
      family: "sync",
    });

    const writer1 = resolveMigratedSchedule("Report Batch Writer");
    const writer2 = resolveMigratedSchedule("ReportBatchWriter");
    assert.deepStrictEqual(writer1, {
      queue: QUEUES.HOURLY_SYNC,
      task: SYNC_TASKS.REPORT_BATCH_WRITER,
      family: "sync",
    });
    assert.strictEqual(writer2.task, SYNC_TASKS.REPORT_BATCH_WRITER);
  });

  test("2. Automation Mode recognizes new tasks as migrated", () => {
    assert.strictEqual(isMigratedTask("BiWeeklyReport"), true);
    assert.strictEqual(isMigratedTask("BiWeekly Report"), true);
    assert.strictEqual(isMigratedTask("WeeklyReport"), true);
    assert.strictEqual(isMigratedTask("ReportBatchWriter"), true);
    assert.strictEqual(isMigratedTask("Report Batch Writer"), true);

    const originalMode = process.env.AUTOMATION_EXECUTION_MODE;
    try {
      process.env.AUTOMATION_EXECUTION_MODE = "queue";
      assert.strictEqual(shouldLegacyExecute("BiWeeklyReport"), false);
      assert.strictEqual(shouldLegacyExecute("WeeklyReport"), false);
      assert.strictEqual(shouldLegacyExecute("ReportBatchWriter"), false);

      process.env.AUTOMATION_EXECUTION_MODE = "legacy";
      assert.strictEqual(shouldLegacyExecute("BiWeeklyReport"), true);
      assert.strictEqual(shouldLegacyExecute("WeeklyReport"), true);
      assert.strictEqual(shouldLegacyExecute("ReportBatchWriter"), true);
    } finally {
      process.env.AUTOMATION_EXECUTION_MODE = originalMode;
    }
  });

  test("3. Deterministic Job ID generation for BiWeekly and ReportBatchWriter", () => {
    // BiWeekly report uses hourly block and profile identity
    const biweeklyJobId = generateJobId({
      task: SYNC_TASKS.BIWEEKLY_REPORT,
      configId: testConfigId,
      profileId: testProfileId,
      scheduledFor: sampleOccurrence,
    });
    assert.strictEqual(
      biweeklyJobId,
      `sync-biweekly-report-${testConfigId}-${testProfileId}-20261014T08Z`
    );
    assert.strictEqual(biweeklyJobId.includes(":"), false);

    // ReportBatchWriter is singleton with minute block
    const writerJobId = generateJobId({
      task: SYNC_TASKS.REPORT_BATCH_WRITER,
      scheduledFor: sampleOccurrence,
    });
    assert.strictEqual(writerJobId, "sync-report-batch-writer-20261014T0800Z");
    assert.strictEqual(writerJobId.includes(":"), false);
  });

  test("4. Job Payload validation supports singleton ReportBatchWriter and BiWeekly", () => {
    // BiWeekly validation
    const biweeklyPayload = validateJobPayload({
      schemaVersion: 1,
      task: SYNC_TASKS.BIWEEKLY_REPORT,
      configId: testConfigId,
      profileId: testProfileId,
      scheduledFor: sampleOccurrence.toISOString(),
      timeBlock: "20261014T08Z",
    });
    assert.strictEqual(biweeklyPayload.task, SYNC_TASKS.BIWEEKLY_REPORT);
    assert.strictEqual(biweeklyPayload.profileId, testProfileId);

    // Singleton ReportBatchWriter validation defaults configId and profileId
    const writerPayload = validateJobPayload({
      schemaVersion: 1,
      task: SYNC_TASKS.REPORT_BATCH_WRITER,
      scheduledFor: sampleOccurrence.toISOString(),
      timeBlock: "20261014T0800Z",
    });
    assert.strictEqual(writerPayload.task, SYNC_TASKS.REPORT_BATCH_WRITER);
    assert.strictEqual(writerPayload.configId, "000000000000000000000000");
    assert.strictEqual(writerPayload.profileId, 0);
  });

  test("5. HourlySyncProcessor executes REPORT_BATCH_WRITER without profile prerequisites", async () => {
    const processor = createHourlySyncProcessor();
    const fakeJob = {
      id: "test-writer-job-1",
      data: {
        schemaVersion: 1,
        task: SYNC_TASKS.REPORT_BATCH_WRITER,
        scheduledFor: sampleOccurrence.toISOString(),
        timeBlock: "20261014T0800Z",
      },
    };

    const result = await processor(fakeJob);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.task, SYNC_TASKS.REPORT_BATCH_WRITER);
    assert.ok(result.result !== undefined);
  });

  test("6. HourlySyncService executes BIWEEKLY_REPORT in shadow mode", async () => {
    const originalMode = process.env.AUTOMATION_EXECUTION_MODE;
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";

    try {
      const result = await runHourlySyncForProfile({
        task: SYNC_TASKS.BIWEEKLY_REPORT,
        configId: testConfigId,
        profileId: testProfileId,
        timeBlock: "20261014T08Z",
        scheduledFor: sampleOccurrence.toISOString(),
        jobId: "test-biweekly-shadow-1",
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.dryRun, true);
      assert.strictEqual(result.task, SYNC_TASKS.BIWEEKLY_REPORT);

      // Verify SyncRun document was recorded
      const runRecord = await SyncRun.findById(result.syncRunId);
      assert.strictEqual(runRecord.state, "COMPLETED");
      assert.strictEqual(runRecord.isDryRun, true);
    } finally {
      process.env.AUTOMATION_EXECUTION_MODE = originalMode;
    }
  });

  test("7. Producer enqueues REPORT_BATCH_WRITER as singleton and BIWEEKLY_REPORT per profile", async () => {
    const { enqueueSyncForOccurrence } = require("../../queue-service/producers/hourlySync.producer");
    const { getQueues } = require("../../queue-service/queues/queues");
    const { hourlySyncQueue } = getQueues();

    // Enqueue REPORT_BATCH_WRITER singleton
    const writerRes = await enqueueSyncForOccurrence({
      task: SYNC_TASKS.REPORT_BATCH_WRITER,
      scheduledFor: sampleOccurrence,
    });
    assert.strictEqual(writerRes.task, SYNC_TASKS.REPORT_BATCH_WRITER);
    assert.strictEqual(writerRes.enqueuedCount, 1);

    // Verify job exists in BullMQ
    const expectedWriterJobId = `sync-report-batch-writer-${formatTimeBlock(sampleOccurrence, "minute")}`;
    const writerJob = await hourlySyncQueue.getJob(expectedWriterJobId);
    assert.ok(writerJob, "Singleton writer job must exist in BullMQ");
    assert.strictEqual(writerJob.data.task, SYNC_TASKS.REPORT_BATCH_WRITER);
    await writerJob.remove();

    // Enqueue BIWEEKLY_REPORT
    const biweeklyRes = await enqueueSyncForOccurrence({
      task: SYNC_TASKS.BIWEEKLY_REPORT,
      scheduledFor: sampleOccurrence,
    });
    assert.strictEqual(biweeklyRes.task, SYNC_TASKS.BIWEEKLY_REPORT);
    assert.ok(biweeklyRes.enqueuedCount > 0);

    // Clean up enqueued test jobs
    const expectedBiweeklyJobId = generateJobId({
      task: SYNC_TASKS.BIWEEKLY_REPORT,
      configId: testConfigId,
      profileId: testProfileId,
      scheduledFor: sampleOccurrence,
    });
    const biweeklyJob = await hourlySyncQueue.getJob(expectedBiweeklyJobId);
    if (biweeklyJob) await biweeklyJob.remove();
  });
});
