const { test, describe } = require("node:test");
const assert = require("node:assert");
const { generateJobId, formatTimeBlock } = require("../../../queue-service/contracts/jobId");
const { validateJobPayload } = require("../../../queue-service/contracts/jobPayload");
const { RULE_TASKS, SYNC_TASKS, SP_API_TASKS } = require("../../../queue-service/queues/queueNames");

describe("BullMQ Contracts: Job IDs & Payloads", () => {
  const sampleParams = {
    task: RULE_TASKS.BUDGET,
    configId: "507f1f77bcf86cd799439011",
    profileId: 123456789,
    scheduledFor: "2026-11-03T10:00:00.000Z",
  };

  test("Job ID generation is completely deterministic", () => {
    const id1 = generateJobId(sampleParams);
    const id2 = generateJobId(sampleParams);
    assert.strictEqual(id1, id2);
    assert.strictEqual(typeof id1, "string");
  });

  test("Job ID safety rules: never contains colons and never purely digits", () => {
    const id = generateJobId(sampleParams);
    // BullMQ requires no colons to prevent redis namespace corruption
    assert.strictEqual(id.includes(":"), false);
    // Must not be digits-only (BullMQ internal ID collision)
    assert.strictEqual(/^\d+$/.test(id), false);
  });

  test("Different tasks or times produce distinct job IDs", () => {
    const idBudget = generateJobId(sampleParams);
    const idTargeting = generateJobId({ ...sampleParams, task: RULE_TASKS.TARGETING });
    const idOtherTime = generateJobId({ ...sampleParams, scheduledFor: "2026-11-03T11:00:00.000Z" });

    assert.notStrictEqual(idBudget, idTargeting);
    assert.notStrictEqual(idBudget, idOtherTime);
  });

  test("Payload validation: passes valid rules payload", () => {
    const payload = {
      task: RULE_TASKS.BUDGET,
      configId: "507f1f77bcf86cd799439011",
      profileId: 123456789,
      scheduledFor: "2026-11-03T10:00:00.000Z",
      timeBlock: "20261103T1000Z",
      trigger: "scheduled",
    };
    const validated = validateJobPayload(payload);
    assert.strictEqual(validated.task, RULE_TASKS.BUDGET);
    assert.strictEqual(validated.profileId, 123456789);
    assert.strictEqual(validated.timeBlock, "20261103T1000Z");
  });

  test("Payload validation: passes valid hourly sync payload", () => {
    const payload = {
      task: SYNC_TASKS.CAMPAIGN_REPORT,
      configId: "507f1f77bcf86cd799439011",
      profileId: 123456789,
      scheduledFor: "2026-11-03T10:00:00.000Z",
      timeBlock: "20261103T1000Z",
      trigger: "scheduled",
    };
    const validated = validateJobPayload(payload);
    assert.strictEqual(validated.task, SYNC_TASKS.CAMPAIGN_REPORT);
  });

  test("Payload validation: throws error when mandatory fields are missing or invalid", () => {
    assert.throws(() => validateJobPayload(null), /Job payload must be a non-null object/);
    assert.throws(() => validateJobPayload({}), /Invalid or unrecognized task/);
    assert.throws(() => validateJobPayload({ task: "UNKNOWN" }), /Invalid or unrecognized task/);
    assert.throws(
      () => validateJobPayload({ task: RULE_TASKS.BUDGET, configId: "invalid-id" }),
      /Invalid configId/
    );
    assert.throws(
      () => validateJobPayload({ task: RULE_TASKS.BUDGET, configId: "507f1f77bcf86cd799439011", profileId: -5 }),
      /Invalid profileId/
    );
    assert.throws(
      () => validateJobPayload({
        task: RULE_TASKS.BUDGET,
        configId: "507f1f77bcf86cd799439011",
        profileId: 12345,
        scheduledFor: "2026-11-03T10:00:00.000Z",
        timeBlock: "invalid:with:colons",
      }),
      /Invalid timeBlock/
    );
  });
});
