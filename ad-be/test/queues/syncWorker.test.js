const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
require("dotenv").config();
const mongoose = require("mongoose");
const SyncRun = require("../../api-server/models/syncRun.model");
const {
  checkPrerequisiteStatus,
  claimSyncRun,
  recordProviderReportId,
  markSyncRunCompleted,
  markSyncRunFailed,
} = require("../../api-server/services/automation/syncRun.service");
const { SYNC_TASKS } = require("../../queue-service/queues/queueNames");

describe("1. Hourly Sync Prerequisite & State Transitions", () => {
  const configId = new mongoose.Types.ObjectId().toString();
  const profileId = 987654321;
  const timeBlock = "20261009T05Z";
  const scheduledFor = new Date("2026-10-09T05:00:00.000Z");

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    await SyncRun.deleteMany({ configId, profileId, timeBlock });
  });

  after(async () => {
    await SyncRun.deleteMany({ configId, profileId, timeBlock });
    await mongoose.connection.close();
  });

  test("AdGroup listing prerequisite is not ready when Campaign listing has not run", async () => {
    const status = await checkPrerequisiteStatus({
      task: SYNC_TASKS.ADGROUP_LISTING,
      configId,
      profileId,
      timeBlock,
    });

    assert.strictEqual(status.ready, false);
    assert.strictEqual(status.prerequisiteTask, SYNC_TASKS.CAMPAIGN_LISTING);
    assert.strictEqual(status.prerequisiteState, "NOT_FOUND");
  });

  test("Claims new sync run and marks completed", async () => {
    const claim1 = await claimSyncRun({
      task: SYNC_TASKS.CAMPAIGN_LISTING,
      configId,
      profileId,
      timeBlock,
      scheduledFor,
      jobId: "sync-campaign-test-1",
    });

    assert.strictEqual(claim1.shouldExecute, true);
    assert.strictEqual(claim1.reason, "NEW");
    assert.strictEqual(claim1.record.state, "RUNNING");

    // Record Amazon provider report ID
    const updated = await recordProviderReportId(claim1.record._id, "amzn-rep-12345");
    assert.strictEqual(updated.providerReportId, "amzn-rep-12345");

    // Mark completed
    const completed = await markSyncRunCompleted(claim1.record._id, { rowCount: 150 });
    assert.strictEqual(completed.state, "COMPLETED");

    // Now AdGroup listing prerequisite check succeeds!
    const status = await checkPrerequisiteStatus({
      task: SYNC_TASKS.ADGROUP_LISTING,
      configId,
      profileId,
      timeBlock,
    });
    assert.strictEqual(status.ready, true);
    assert.strictEqual(status.prerequisiteTask, SYNC_TASKS.CAMPAIGN_LISTING);
  });

  test("Subsequent claim for completed sync run skips execution (idempotency)", async () => {
    const claimDuplicate = await claimSyncRun({
      task: SYNC_TASKS.CAMPAIGN_LISTING,
      configId,
      profileId,
      timeBlock,
      scheduledFor,
      jobId: "sync-campaign-test-2",
    });

    assert.strictEqual(claimDuplicate.shouldExecute, false);
    assert.strictEqual(claimDuplicate.reason, "ALREADY_COMPLETED");
  });
});
