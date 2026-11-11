const { test, describe, mock, afterEach } = require("node:test");
const assert = require("node:assert");
const RuleActionExecution = require("../../../api-server/models/ruleActionExecution.model");
const {
  claimAction,
  markActionApplied,
  markActionFailed,
  hashPayload,
} = require("../../../api-server/services/automation/ruleActionExecution.service");

describe("Rule Engine: Action Execution & Idempotency", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const baseParams = {
    configId: "507f1f77bcf86cd799439011",
    profileId: 123456789,
    ruleFamily: "targeting-rules",
    ruleId: "507f1f77bcf86cd799439022",
    scheduledSlot: "20261030T1000Z",
    amazonEntityType: "target",
    amazonEntityId: "target-999",
    actionType: "BID_UPDATE",
    previousValue: 1.0,
    desiredValue: 1.25,
    jobId: "job-rule-100",
    owner: "worker-pid-1",
    isDryRun: false,
  };

  test("hashPayload returns deterministic sha256 hex string", () => {
    const payload = { bid: 1.25, targetId: "target-999" };
    const hash1 = hashPayload(payload);
    const hash2 = hashPayload(payload);
    assert.strictEqual(typeof hash1, "string");
    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hashPayload(null), null);
    assert.strictEqual(hashPayload(undefined), null);
  });

  test("New action claims cleanly with CLAIMED_NEW and freezes desiredValue", async () => {
    mock.method(RuleActionExecution, "findOne", async () => null);
    mock.method(RuleActionExecution, "create", async (doc) => ({
      ...doc,
      _id: "record-123",
      save: async () => {},
    }));

    const result = await claimAction(baseParams);
    assert.strictEqual(result.shouldExecute, true);
    assert.strictEqual(result.reason, "CLAIMED_NEW");
    assert.strictEqual(result.frozenDesiredValue, 1.25);
    assert.strictEqual(result.record.state, "CLAIMED");
  });

  test("Idempotency: already APPLIED action rejects execution with ALREADY_APPLIED", async () => {
    mock.method(RuleActionExecution, "findOne", async () => ({
      state: "APPLIED",
      desiredValue: 1.25,
      _id: "record-123",
    }));

    const result = await claimAction(baseParams);
    assert.strictEqual(result.shouldExecute, false);
    assert.strictEqual(result.reason, "ALREADY_APPLIED");
    assert.strictEqual(result.frozenDesiredValue, 1.25);
  });

  test("Active claim by another worker rejects with ACTIVE_CLAIM", async () => {
    const futureDate = new Date(Date.now() + 60000);
    mock.method(RuleActionExecution, "findOne", async () => ({
      state: "CLAIMED",
      claimExpiresAt: futureDate,
      owner: "another-worker-pid-9",
      desiredValue: 1.25,
      _id: "record-123",
    }));

    const result = await claimAction(baseParams);
    assert.strictEqual(result.shouldExecute, false);
    assert.strictEqual(result.reason, "ACTIVE_CLAIM");
    assert.strictEqual(result.frozenDesiredValue, 1.25);
  });

  test("Reclaim expired claim preserves original frozenDesiredValue (prevents compounding)", async () => {
    const pastDate = new Date(Date.now() - 60000);
    let saved = false;
    const existingRecord = {
      state: "CLAIMED",
      claimExpiresAt: pastDate,
      owner: "dead-worker",
      desiredValue: 1.15, // original frozen value was 1.15
      attempts: 1,
      _id: "record-123",
      save: async () => { saved = true; },
    };

    mock.method(RuleActionExecution, "findOne", async () => existingRecord);

    // Caller attempts a new desiredValue of 1.30 (from re-evaluation)
    const result = await claimAction({ ...baseParams, desiredValue: 1.30 });
    assert.strictEqual(result.shouldExecute, true);
    assert.strictEqual(result.reason, "RECLAIMED");
    // Crucial: Must preserve 1.15 so bid adjustments do not compound on retry
    assert.strictEqual(result.frozenDesiredValue, 1.15);
    assert.strictEqual(existingRecord.owner, "worker-pid-1");
    assert.strictEqual(existingRecord.attempts, 2);
    assert.strictEqual(saved, true);
  });

  test("Dry-run claim flags record with isDryRun: true", async () => {
    let createdDoc = null;
    mock.method(RuleActionExecution, "findOne", async () => null);
    mock.method(RuleActionExecution, "create", async (doc) => {
      createdDoc = doc;
      return { ...doc, _id: "rec-dry" };
    });

    const result = await claimAction({ ...baseParams, isDryRun: true });
    assert.strictEqual(result.shouldExecute, true);
    assert.strictEqual(createdDoc.isDryRun, true);
  });

  test("markActionApplied updates state to APPLIED and clears claim expiry", async () => {
    let updatePayload = null;
    mock.method(RuleActionExecution, "findByIdAndUpdate", async (id, update) => {
      updatePayload = update;
      return { _id: id, state: "APPLIED" };
    });

    await markActionApplied("rec-123", { amazonRequestId: "req-xyz-456" });
    assert.strictEqual(updatePayload.$set.state, "APPLIED");
    assert.strictEqual(updatePayload.$set.amazonRequestId, "req-xyz-456");
    assert.strictEqual(updatePayload.$set.claimExpiresAt, null);
  });

  test("markActionFailed updates state to FAILED with error payload", async () => {
    let updatePayload = null;
    mock.method(RuleActionExecution, "findByIdAndUpdate", async (id, update) => {
      updatePayload = update;
      return { _id: id, state: "FAILED" };
    });

    const error = new Error("Amazon 429 Too Many Requests");
    await markActionFailed("rec-123", error);
    assert.strictEqual(updatePayload.$set.state, "FAILED");
    assert.strictEqual(updatePayload.$set.lastError.message, "Amazon 429 Too Many Requests");
  });
});
