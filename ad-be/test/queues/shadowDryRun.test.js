const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
require("../../shared/connection");

const {
  isShadowModeEnabled,
  isQueueModeEnabled,
  shouldLegacyExecute,
} = require("../../shared/automationMode");
const { getBullMQPrefix } = require("../../queue-service/config/bullmq.config");
const RuleActionExecution = require("../../api-server/models/ruleActionExecution.model");
const SyncRun = require("../../api-server/models/syncRun.model");
const budgetRulesSchema = require("../../api-server/models/budgetRules.model");
const { processBudgetRulesForProfile } = require("../../api-server/services/automation/ruleAutomation.service");
const { runHourlySyncForProfile } = require("../../api-server/services/automation/hourlySync.service");
const { SYNC_TASKS } = require("../../queue-service/queues/queueNames");

describe("Shadow Dry-Run Verification Mode", () => {
  const originalEnv = process.env.AUTOMATION_EXECUTION_MODE;
  const originalPrefix = process.env.BULLMQ_PREFIX;

  // Use real active plan profile from database
  let testConfigId = "694120f451f2bf9640c4b27f";
  let testProfileId = 1451708219889308;
  let testRuleId = null;

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

    // Seed temporary shadow test budget rule
    const ruleDoc = await budgetRulesSchema.create({
      configId: new mongoose.Types.ObjectId(testConfigId),
      profileId: testProfileId,
      ruleName: "Shadow Dry-Run Verification Rule",
      isActive: true,
      isRunning: false,
      isHourlyBudget: true,
      hourlyConfig: {
        frequency: "DAILY",
        slots: [
          { startTime: "00:00", endTime: "24:00", enabled: true, value: 75 },
        ],
      },
      actionType: {
        actionName: "BudgetUpdate",
        actionValueType: "Number",
        actionValue: 75,
      },
    });
    testRuleId = ruleDoc._id;
  });

  after(async () => {
    process.env.AUTOMATION_EXECUTION_MODE = originalEnv;
    if (originalPrefix !== undefined) {
      process.env.BULLMQ_PREFIX = originalPrefix;
    } else {
      delete process.env.BULLMQ_PREFIX;
    }

    // Cleanup shadow test artifacts
    if (testRuleId) await budgetRulesSchema.deleteOne({ _id: testRuleId });
    await RuleActionExecution.deleteMany({
      profileId: testProfileId,
      scheduledSlot: { $regex: /^shadow-/ },
    });
    await SyncRun.deleteMany({
      profileId: testProfileId,
      timeBlock: { $regex: /^shadow-/ },
    });
    await mongoose.connection.close();
  });

  it("1. Mode flags coordinate shadow dry-run without blocking legacy crons", () => {
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";
    delete process.env.BULLMQ_PREFIX;

    assert.equal(isShadowModeEnabled(), true);
    assert.equal(isQueueModeEnabled(), false);

    // Legacy crons MUST still execute during shadow dry-run
    assert.equal(shouldLegacyExecute("BudgetRuleSchedules"), true);
    assert.equal(shouldLegacyExecute("CampaignListing"), true);

    // BullMQ prefix automatically isolates to shadow prefix
    assert.equal(getBullMQPrefix(), "advertiseiq:bull:shadow:v1");
  });

  it("2. Rule dry-run calculates desiredValue and records shadow claim without Amazon mutation", async () => {
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";

    const scheduledFor = new Date("2026-10-09T10:00:00.000Z");
    const jobId = `shadow-rules-budget-${testConfigId}-${testProfileId}-20261009T1000Z`;

    const result = await processBudgetRulesForProfile({
      configId: testConfigId,
      profileId: testProfileId,
      scheduledFor,
      jobId,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.family, "budget-rules");
    assert.ok(result.matchingRulesCount >= 1, "Should identify matching hourly slot rule");

    // Verify RuleActionExecution ledger record created with isDryRun: true
    const claim = await RuleActionExecution.findOne({
      profileId: testProfileId,
      ruleId: testRuleId,
      isDryRun: true,
    });

    assert.ok(claim, "Shadow dry-run claim must exist in ledger");
    assert.equal(claim.state, "CLAIMED");
    assert.equal(claim.desiredValue, 75, "Desired value must freeze target value 75");
    assert.equal(claim.isDryRun, true);
    assert.ok(claim.scheduledSlot.startsWith("shadow-"));
  });

  it("3. Hourly sync dry-run records shadow SyncRun without calling external Amazon API", async () => {
    process.env.AUTOMATION_EXECUTION_MODE = "shadow";

    const scheduledFor = new Date("2026-10-09T10:00:00.000Z");
    const timeBlock = "20261009T10Z";
    const jobId = `shadow-sync-campaign-listing-${testConfigId}-${testProfileId}-${timeBlock}`;

    const result = await runHourlySyncForProfile({
      task: SYNC_TASKS.CAMPAIGN_LISTING,
      configId: testConfigId,
      profileId: testProfileId,
      timeBlock,
      scheduledFor,
      jobId,
    });

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.task, SYNC_TASKS.CAMPAIGN_LISTING);

    // Verify SyncRun ledger record created with isDryRun: true and state COMPLETED
    const syncRun = await SyncRun.findById(result.syncRunId);
    assert.ok(syncRun, "Shadow SyncRun must exist");
    assert.equal(syncRun.state, "COMPLETED");
    assert.equal(syncRun.isDryRun, true);
    assert.equal(syncRun.timeBlock, `shadow-${timeBlock}`);
  });
});
