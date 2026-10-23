const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const { resolveMigratedSchedule } = require("../../queue-service/scheduler/scheduleRegistry");
const { generateJobId } = require("../../queue-service/contracts/jobId");
const { validateJobPayload } = require("../../queue-service/contracts/jobPayload");
const { QUEUES, SP_API_TASKS } = require("../../queue-service/queues/queueNames");
const { spApiJobOptions } = require("../../queue-service/queues/jobOptions");
const { createSpApiProcessor } = require("../../queue-service/processors/spApi.processor");
const { getQueues, closeQueues } = require("../../queue-service/queues/queues");
const { enqueueSpApiForOccurrence } = require("../../queue-service/producers/spApi.producer");

describe("1. SP-API Schedule Registry Mapping", () => {
  test("Resolves core SP-API order, inventory, and analytics tasks", () => {
    const syncOrder = resolveMigratedSchedule("Sync Order");
    assert.deepStrictEqual(syncOrder, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.SYNC_ORDER,
      family: "sp-api",
    });

    const syncInventory = resolveMigratedSchedule("Sync Inventory");
    assert.deepStrictEqual(syncInventory, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.SYNC_INVENTORY,
      family: "sp-api",
    });

    const deadInv = resolveMigratedSchedule("Detect Dead Inventory");
    assert.deepStrictEqual(deadInv, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.DETECT_DEAD_INVENTORY,
      family: "sp-api",
    });

    const brandAnalytics = resolveMigratedSchedule("Brand Analytics Report");
    assert.deepStrictEqual(brandAnalytics, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.BRAND_ANALYTICS_REPORT,
      family: "sp-api",
    });

    const competitors = resolveMigratedSchedule("Competitor Analysis");
    assert.deepStrictEqual(competitors, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.COMPETITOR_ANALYSIS,
      family: "sp-api",
    });

    const deals = resolveMigratedSchedule("Deals Dashboard");
    assert.deepStrictEqual(deals, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.SYNC_DEALS_DASHBOARD,
      family: "sp-api",
    });

    const coupons = resolveMigratedSchedule("Sync Coupons");
    assert.deepStrictEqual(coupons, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.SYNC_COUPONS,
      family: "sp-api",
    });

    const reimp = resolveMigratedSchedule("Reimbursement Report");
    assert.deepStrictEqual(reimp, {
      queue: QUEUES.SP_API,
      task: SP_API_TASKS.REIMBURSEMENT_REPORT,
      family: "sp-api",
    });
  });

  test("Handles naming variations and casing gracefully", () => {
    assert.strictEqual(resolveMigratedSchedule("syncorder")?.task, SP_API_TASKS.SYNC_ORDER);
    assert.strictEqual(resolveMigratedSchedule("SyncInventory")?.task, SP_API_TASKS.SYNC_INVENTORY);
    assert.strictEqual(resolveMigratedSchedule("Brand Analytics Report ")?.task, SP_API_TASKS.BRAND_ANALYTICS_REPORT);
  });
});

describe("2. SP-API Job ID Generation & Job Options", () => {
  const sampleOccurrence = "2026-10-16T04:00:00.000Z";

  test("Generates deterministic singleton job ID with minute block", () => {
    const id1 = generateJobId({
      task: SP_API_TASKS.SYNC_ORDER,
      scheduledFor: sampleOccurrence,
    });
    const id2 = generateJobId({
      task: SP_API_TASKS.SYNC_ORDER,
      scheduledFor: sampleOccurrence,
    });

    assert.strictEqual(id1, "sp-sync-order-20261016T0400Z");
    assert.strictEqual(id1, id2, "Must be strictly deterministic");
    assert.strictEqual(id1.includes(":"), false, "BullMQ job IDs must not contain colons");
  });

  test("Generates deterministic profile-scoped job ID when configId & profileId are provided", () => {
    const id = generateJobId({
      task: SP_API_TASKS.SYNC_ORDER,
      configId: "507f1f77bcf86cd799439011",
      profileId: 987654321,
      scheduledFor: sampleOccurrence,
    });

    assert.strictEqual(id, "sp-sync-order-507f1f77bcf86cd799439011-987654321-20261016T0400Z");
  });

  test("Job options have appropriate size limits and retry policy for heavy tasks", () => {
    assert.strictEqual(spApiJobOptions.attempts, 3);
    assert.strictEqual(spApiJobOptions.backoff.delay, 60000);
    assert.strictEqual(spApiJobOptions.removeOnComplete, 200);
    assert.strictEqual(spApiJobOptions.removeOnFail, 100);
  });
});

describe("3. SP-API Job Payload Validation", () => {
  test("Validates singleton SP-API payload without requiring profileId or configId", () => {
    const payload = {
      schemaVersion: 1,
      task: SP_API_TASKS.SYNC_ORDER,
      scheduledFor: "2026-10-16T04:00:00.000Z",
      timeBlock: "20261016T0400Z",
      trigger: "scheduled",
    };

    const validated = validateJobPayload(payload);
    assert.strictEqual(validated.task, SP_API_TASKS.SYNC_ORDER);
    assert.strictEqual(validated.configId, "000000000000000000000000");
    assert.strictEqual(validated.profileId, 0);
    assert.strictEqual(validated.timeBlock, "20261016T0400Z");
  });

  test("Validates SP-API payload with optional parameters", () => {
    const payload = {
      schemaVersion: 1,
      task: SP_API_TASKS.SYNC_INVENTORY,
      configId: "507f1f77bcf86cd799439011",
      profileId: 12345,
      scheduledFor: "2026-10-16T04:00:00.000Z",
      timeBlock: "20261016T0400Z",
      trigger: "manual",
    };

    const validated = validateJobPayload(payload);
    assert.strictEqual(validated.task, SP_API_TASKS.SYNC_INVENTORY);
    assert.strictEqual(validated.configId, "507f1f77bcf86cd799439011");
    assert.strictEqual(validated.profileId, 12345);
    assert.strictEqual(validated.trigger, "manual");
  });

  test("Rejects invalid task in SP-API payload", () => {
    assert.throws(
      () =>
        validateJobPayload({
          schemaVersion: 1,
          task: "completely-invalid-sp-task",
          scheduledFor: "2026-10-16T04:00:00.000Z",
          timeBlock: "20261016T0400Z",
        }),
      /Invalid or unrecognized task/
    );
  });
});

describe("4. SP-API Processor Shadow Mode", () => {
  test("Processor gracefully executes in shadow mode without throwing", async () => {
    const prevMode = process.env.AUTOMATION_EXECUTION_MODE;
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";

    try {
      const processor = createSpApiProcessor();
      const mockJob = {
        id: "sp-sync-order-20261016T0400Z",
        data: {
          schemaVersion: 1,
          task: SP_API_TASKS.SYNC_ORDER,
          scheduledFor: "2026-10-16T04:00:00.000Z",
          timeBlock: "20261016T0400Z",
          trigger: "scheduled",
        },
      };

      const result = await processor(mockJob);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.dryRun, true);
      assert.strictEqual(result.task, SP_API_TASKS.SYNC_ORDER);
    } finally {
      process.env.AUTOMATION_EXECUTION_MODE = prevMode;
    }
  });
});

describe("5. End-to-End SP-API BullMQ Enqueue & Processor Integration", () => {
  const sampleTime = new Date("2026-10-16T15:00:00.000Z");

  after(async () => {
    const { spApiQueue } = getQueues();
    try {
      const jobId = generateJobId({ task: SP_API_TASKS.SYNC_ORDER, scheduledFor: sampleTime });
      const job = await spApiQueue.getJob(jobId);
      if (job) await job.remove();
    } catch (_) {}
    await closeQueues();
  });

  test("Enqueues SP-API job to BullMQ, deduplicates identical job, and processes via processor", async () => {
    const prevMode = process.env.AUTOMATION_EXECUTION_MODE;
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";

    try {
      const { spApiQueue } = getQueues();

      // Clean up if already exists from earlier runs
      const testJobId = generateJobId({ task: SP_API_TASKS.SYNC_ORDER, scheduledFor: sampleTime });
      const existing = await spApiQueue.getJob(testJobId);
      if (existing) await existing.remove();

      // 1. Enqueue via producer
      const enqueueRes = await enqueueSpApiForOccurrence({
        task: SP_API_TASKS.SYNC_ORDER,
        scheduledFor: sampleTime,
      });

      assert.strictEqual(enqueueRes.jobId, testJobId);
      assert.strictEqual(enqueueRes.enqueuedCount, 1);

      // 2. Fetch the job from Redis
      const job = await spApiQueue.getJob(testJobId);
      assert.ok(job, "Job must exist in BullMQ sp-api-queue in Redis");
      assert.strictEqual(job.data.task, SP_API_TASKS.SYNC_ORDER);
      assert.strictEqual(job.opts.attempts, 3);
      assert.strictEqual(job.opts.removeOnComplete, 200);

      // 3. Deduplication check: Attempting to enqueue duplicate identical occurrence
      const duplicateRes = await enqueueSpApiForOccurrence({
        task: SP_API_TASKS.SYNC_ORDER,
        scheduledFor: sampleTime,
      });
      assert.strictEqual(duplicateRes.jobId, testJobId);

      // 4. Process via processor
      const processor = createSpApiProcessor();
      const processResult = await processor(job);
      assert.strictEqual(processResult.success, true);
      assert.strictEqual(processResult.dryRun, true);
      assert.strictEqual(processResult.task, SP_API_TASKS.SYNC_ORDER);

      // Cleanup
      await job.remove();
    } finally {
      process.env.AUTOMATION_EXECUTION_MODE = prevMode;
    }
  });
});
