const { test, describe } = require("node:test");
const assert = require("node:assert");
// Stub Redis service before loading processor to isolate environment
require("../../helpers/stubRedisService");

const { createFakeRedis } = require("../../helpers/fakeRedis");
const { createRulesProcessor } = require("../../../queue-service/processors/rules.processor");
const { RULE_TASKS } = require("../../../queue-service/queues/queueNames");
const { ProfileInactiveError } = require("../../../queue-service/contracts/errors");
const { DelayedError } = require("bullmq");

describe("Queue Worker: Rules Processor Execution", () => {
  const validJob = {
    id: "job-budget-101",
    data: {
      task: RULE_TASKS.BUDGET,
      configId: "507f1f77bcf86cd799439011",
      profileId: 123456789,
      scheduledFor: "2026-11-03T10:00:00.000Z",
      timeBlock: "20261103T1000Z",
      trigger: "scheduled",
    },
    moveToDelayed: async () => {},
  };

  test("Success path: executes rule automation and returns result cleanly", async () => {
    const redis = createFakeRedis();
    const mockBudgetRule = async () => ({
      success: true,
      appliedCount: 5,
    });

    const processor = createRulesProcessor(redis, {
      processBudgetRulesForProfile: mockBudgetRule,
    });
    const result = await processor(validJob, "token-1");

    assert.deepStrictEqual(result, { success: true, appliedCount: 5 });
    // Verify lease was released in finally block
    const leaseKey = `automation:rules:${validJob.data.configId}:${validJob.data.profileId}:lease`;
    assert.strictEqual(await redis.get(leaseKey), null);
  });

  test("Lease busy path: reschedules job via moveToDelayed and throws DelayedError", async () => {
    const redis = createFakeRedis();
    // Pre-lock profile to simulate lease conflict
    const leaseKey = `automation:rules:${validJob.data.configId}:${validJob.data.profileId}:lease`;
    await redis.set(leaseKey, "existing-worker-token", "PX", 60000, "NX");

    let movedToDelayed = false;
    const busyJob = {
      ...validJob,
      moveToDelayed: async () => { movedToDelayed = true; },
    };

    const processor = createRulesProcessor(redis);
    await assert.rejects(async () => {
      await processor(busyJob, "token-1");
    }, DelayedError);

    assert.strictEqual(movedToDelayed, true);
  });

  test("Profile inactive error: caught gracefully, skips execution without failing job", async () => {
    const redis = createFakeRedis();
    const mockBudgetRule = async () => {
      throw new ProfileInactiveError("Profile 123456789 subscription paused");
    };

    const processor = createRulesProcessor(redis, {
      processBudgetRulesForProfile: mockBudgetRule,
    });
    const result = await processor(validJob, "token-1");

    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, "PROFILE_INACTIVE");
    // Verify lease is still cleanly released
    const leaseKey = `automation:rules:${validJob.data.configId}:${validJob.data.profileId}:lease`;
    assert.strictEqual(await redis.get(leaseKey), null);
  });

  test("Transient error: rethrows so BullMQ can trigger retry with backoff", async () => {
    const redis = createFakeRedis();
    const mockBudgetRule = async () => {
      throw new Error("Amazon SP-API 503 Service Unavailable");
    };

    const processor = createRulesProcessor(redis, {
      processBudgetRulesForProfile: mockBudgetRule,
    });
    await assert.rejects(async () => {
      await processor(validJob, "token-1");
    }, /Amazon SP-API 503/);

    // Verify lease is released even on error!
    const leaseKey = `automation:rules:${validJob.data.configId}:${validJob.data.profileId}:lease`;
    assert.strictEqual(await redis.get(leaseKey), null);
  });
});
