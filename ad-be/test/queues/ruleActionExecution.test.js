const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
require("dotenv").config();
const mongoose = require("mongoose");
const RuleActionExecution = require("../../api-server/models/ruleActionExecution.model");
const {
  claimAction,
  markActionApplied,
  markActionFailed,
} = require("../../api-server/services/automation/ruleActionExecution.service");

describe("1. Rule Action Idempotency & Compounding Protection", () => {
  const configId = new mongoose.Types.ObjectId().toString();
  const profileId = 555666777;
  const ruleFamily = "budget-rules";
  const ruleId = new mongoose.Types.ObjectId().toString();
  const scheduledSlot = "20261009T0530Z";
  const amazonEntityType = "campaign";
  const amazonEntityId = "camp-12345";
  const actionType = "BUDGET_UPDATE";

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    await RuleActionExecution.deleteMany({ configId, profileId, ruleId });
  });

  after(async () => {
    await RuleActionExecution.deleteMany({ configId, profileId, ruleId });
    await mongoose.connection.close();
  });

  test("New action claim freezes absolute desiredValue before Amazon mutation", async () => {
    const claim = await claimAction({
      configId,
      profileId,
      ruleFamily,
      ruleId,
      scheduledSlot,
      amazonEntityType,
      amazonEntityId,
      actionType,
      previousValue: 10.0,
      desiredValue: 11.0, // Frozen +10% target
      jobId: "rules-job-test-1",
      owner: "worker-A",
      leaseMs: 5000,
    });

    assert.strictEqual(claim.shouldExecute, true);
    assert.strictEqual(claim.reason, "CLAIMED_NEW");
    assert.strictEqual(claim.frozenDesiredValue, 11.0);
    assert.strictEqual(claim.record.state, "CLAIMED");
  });

  test("Active claim by another worker is blocked", async () => {
    const secondClaim = await claimAction({
      configId,
      profileId,
      ruleFamily,
      ruleId,
      scheduledSlot,
      amazonEntityType,
      amazonEntityId,
      actionType,
      previousValue: 10.0,
      desiredValue: 12.1,
      jobId: "rules-job-test-2",
      owner: "worker-B",
    });

    assert.strictEqual(secondClaim.shouldExecute, false);
    assert.strictEqual(secondClaim.reason, "ACTIVE_CLAIM");
  });

  test("Marks action APPLIED and blocks all subsequent claims", async () => {
    const existing = await RuleActionExecution.findOne({
      configId,
      profileId,
      ruleId,
      scheduledSlot,
    });

    const applied = await markActionApplied(existing._id, {
      amazonRequestId: "amzn-req-abc",
    });
    assert.strictEqual(applied.state, "APPLIED");

    const claimAfterApply = await claimAction({
      configId,
      profileId,
      ruleFamily,
      ruleId,
      scheduledSlot,
      amazonEntityType,
      amazonEntityId,
      actionType,
      previousValue: 11.0,
      desiredValue: 12.1, // If code attempted to compound +10% from 11.00
      jobId: "rules-job-test-3",
      owner: "worker-C",
    });

    assert.strictEqual(claimAfterApply.shouldExecute, false);
    assert.strictEqual(claimAfterApply.reason, "ALREADY_APPLIED");
    assert.strictEqual(claimAfterApply.frozenDesiredValue, 11.0, "Must return original frozen 11.00!");
  });
});
