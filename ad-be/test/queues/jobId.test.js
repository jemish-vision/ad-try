const { test, describe } = require("node:test");
const assert = require("node:assert");
const { generateJobId, formatTimeBlock } = require("../../queue-service/contracts/jobId");
const { validateJobPayload } = require("../../queue-service/contracts/jobPayload");
const { RULE_TASKS, SYNC_TASKS } = require("../../queue-service/queues/queueNames");

describe("1. Deterministic Job ID Generation", () => {
  const sampleConfigId = "64f1234567890abcdef12345";
  const sampleProfileId = 123456789;
  const sampleOccurrence = "2026-10-09T05:30:00.000Z";

  test("Generates deterministic rules job ID with minute block", () => {
    const id1 = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: sampleOccurrence,
    });
    const id2 = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: sampleOccurrence,
    });

    assert.strictEqual(id1, `rules-budget-${sampleConfigId}-${sampleProfileId}-20261009T0530Z`);
    assert.strictEqual(id1, id2, "Two calls with identical inputs must produce the exact same ID");
  });

  test("Generates deterministic hourly sync job ID with hour block", () => {
    const id = generateJobId({
      task: SYNC_TASKS.CAMPAIGN_LISTING,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: sampleOccurrence,
    });

    assert.strictEqual(id, `sync-campaign-listing-${sampleConfigId}-${sampleProfileId}-20261009T05Z`);
  });

  test("Job ID never contains colons (BullMQ requirement)", () => {
    const id = generateJobId({
      task: RULE_TASKS.DAYPARTING,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: "2026-12-31T23:59:59.999Z",
    });

    assert.strictEqual(id.includes(":"), false, "BullMQ job IDs cannot contain colons");
  });

  test("Job ID is never digits-only", () => {
    const id = generateJobId({
      task: RULE_TASKS.TARGETING,
      configId: "123456789012345678901234",
      profileId: 999999,
      scheduledFor: sampleOccurrence,
    });

    assert.strictEqual(/^\d+$/.test(id), false, "BullMQ job IDs must not be digits-only");
  });

  test("Replay trigger appends audit suffix", () => {
    const id = generateJobId({
      task: RULE_TASKS.BUDGET,
      configId: sampleConfigId,
      profileId: sampleProfileId,
      scheduledFor: sampleOccurrence,
      replayId: "req9876",
    });

    assert.strictEqual(id, `rules-budget-${sampleConfigId}-${sampleProfileId}-20261009T0530Z-replay-req9876`);
  });

  test("Stable across UTC boundaries and different time representations", () => {
    const block1 = formatTimeBlock("2026-01-01T00:00:00.000Z", "hour");
    assert.strictEqual(block1, "20260101T00Z");

    const block2 = formatTimeBlock("2026-12-31T23:59:00.000Z", "minute");
    assert.strictEqual(block2, "20261231T2359Z");
  });
});

describe("2. Job Payload Validation Contract", () => {
  const validPayload = {
    schemaVersion: 1,
    task: "budget-rules",
    configId: "64f1234567890abcdef12345",
    profileId: 123456789,
    scheduledFor: "2026-10-09T05:30:00.000Z",
    timeBlock: "20261009T0530Z",
    trigger: "scheduled",
  };

  test("Accepts valid payload", () => {
    const validated = validateJobPayload(validPayload);
    assert.strictEqual(validated.task, "budget-rules");
    assert.strictEqual(validated.configId, "64f1234567890abcdef12345");
    assert.strictEqual(validated.profileId, 123456789);
  });

  test("Rejects invalid ObjectId configId", () => {
    assert.throws(() => {
      validateJobPayload({ ...validPayload, configId: "invalid-id" });
    }, /Invalid configId/);
  });

  test("Rejects missing profileId", () => {
    assert.throws(() => {
      validateJobPayload({ ...validPayload, profileId: null });
    }, /Invalid profileId/);
  });

  test("Rejects colons in timeBlock", () => {
    assert.throws(() => {
      validateJobPayload({ ...validPayload, timeBlock: "20261009T05:30Z" });
    }, /Invalid timeBlock/);
  });

  test("Rejects payloads containing sensitive tokens", () => {
    assert.throws(() => {
      validateJobPayload({ ...validPayload, accessToken: "secret123" });
    }, /Security violation/);
  });
});
