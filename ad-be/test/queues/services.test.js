const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  isMigratedTask,
  shouldLegacyExecute,
  MIGRATED_TASKS,
} = require("../../shared/automationMode");
const {
  SYNC_PREREQUISITES,
} = require("../../api-server/services/automation/syncRun.service");
const { SYNC_TASKS, RULE_TASKS } = require("../../queue-service/queues/queueNames");
const { hashPayload } = require("../../api-server/services/automation/ruleActionExecution.service");
const { getLeaseKey } = require("../../queue-service/utils/profileLease");

describe("1. Automation Execution Mode Coordination", () => {
  test("Identifies migrated tasks correctly", () => {
    assert.strictEqual(MIGRATED_TASKS.size, 42);
    assert.strictEqual(isMigratedTask("BudgetRuleSchedules"), true);
    assert.strictEqual(isMigratedTask("DaypartingRuleSchedules"), true);
    assert.strictEqual(isMigratedTask("CampaignListing"), true);
    assert.strictEqual(isMigratedTask("SearchTermReport"), true);
    assert.strictEqual(isMigratedTask("SyncOrder"), true);
    assert.strictEqual(isMigratedTask("SyncInventory"), true);
    assert.strictEqual(isMigratedTask("UnmigratedCustomTask"), false);
  });

  test("Legacy execution allowed when mode is legacy", () => {
    const originalEnv = process.env.AUTOMATION_EXECUTION_MODE;
    process.env.AUTOMATION_EXECUTION_MODE = "legacy";

    assert.strictEqual(shouldLegacyExecute("BudgetRuleSchedules"), true);
    assert.strictEqual(shouldLegacyExecute("CampaignListing"), true);
    assert.strictEqual(shouldLegacyExecute("SyncOrder"), true);

    process.env.AUTOMATION_EXECUTION_MODE = originalEnv;
  });

  test("Legacy execution suppressed for migrated tasks when mode is queue", () => {
    const originalEnv = process.env.AUTOMATION_EXECUTION_MODE;
    process.env.AUTOMATION_EXECUTION_MODE = "queue";

    assert.strictEqual(shouldLegacyExecute("BudgetRuleSchedules"), false);
    assert.strictEqual(shouldLegacyExecute("CampaignListing"), false);
    assert.strictEqual(shouldLegacyExecute("SyncOrder"), false);
    assert.strictEqual(shouldLegacyExecute("SyncInventory"), false);
    // Truly unmigrated tasks still execute in legacy workers
    assert.strictEqual(shouldLegacyExecute("UnmigratedCustomTask"), true);

    process.env.AUTOMATION_EXECUTION_MODE = originalEnv;
  });
});

describe("2. Sync Prerequisite Chain Matrix", () => {
  test("Campaign listing has no prerequisites", () => {
    assert.strictEqual(SYNC_PREREQUISITES[SYNC_TASKS.CAMPAIGN_LISTING], null);
  });

  test("AdGroup listing requires Campaign listing", () => {
    assert.strictEqual(
      SYNC_PREREQUISITES[SYNC_TASKS.ADGROUP_LISTING],
      SYNC_TASKS.CAMPAIGN_LISTING
    );
  });

  test("Reports follow explicit predecessor chain", () => {
    assert.strictEqual(
      SYNC_PREREQUISITES[SYNC_TASKS.SEARCH_TERM_REPORT],
      SYNC_TASKS.PLACEMENT_REPORT
    );
    assert.strictEqual(
      SYNC_PREREQUISITES[SYNC_TASKS.PLACEMENT_REPORT],
      SYNC_TASKS.PRODUCT_ADS_REPORT
    );
    assert.strictEqual(
      SYNC_PREREQUISITES[SYNC_TASKS.PRODUCT_ADS_REPORT],
      SYNC_TASKS.TARGETING_REPORT
    );
  });
});

describe("3. Rule Action Payload Hashing and Profile Lease Keys", () => {
  test("Deterministic payload hash", () => {
    const payload1 = { bid: 1.5, state: "ENABLED" };
    const payload2 = { bid: 1.5, state: "ENABLED" };
    assert.strictEqual(hashPayload(payload1), hashPayload(payload2));
    assert.strictEqual(typeof hashPayload(payload1), "string");
  });

  test("Profile lease key format matches specification", () => {
    const key = getLeaseKey("64f1234567890abcdef12345", 123456789);
    assert.strictEqual(
      key,
      "automation:rules:64f1234567890abcdef12345:123456789:lease"
    );
  });
});
