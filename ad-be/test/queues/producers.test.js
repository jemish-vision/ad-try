const { test, describe } = require("node:test");
const assert = require("node:assert");
const { resolveMigratedSchedule, CRON_NAME_MAP } = require("../../queue-service/scheduler/scheduleRegistry");
const { toMinuteBoundary, toHourBoundary, getBoundedLookbackHours } = require("../../queue-service/scheduler/timeBucket");
const { rulesJobOptions, syncJobOptions } = require("../../queue-service/queues/jobOptions");
const { QUEUES, RULE_TASKS, SYNC_TASKS } = require("../../queue-service/queues/queueNames");

describe("1. Schedule Registry Mapping", () => {
  test("Resolves all 4 rule families from various spacing formats", () => {
    const budget1 = resolveMigratedSchedule("Budget Rule Schedules");
    const budget2 = resolveMigratedSchedule("BudgetRuleSchedules");
    assert.deepStrictEqual(budget1, { queue: QUEUES.RULES, task: RULE_TASKS.BUDGET, family: "rules" });
    assert.deepStrictEqual(budget2, { queue: QUEUES.RULES, task: RULE_TASKS.BUDGET, family: "rules" });

    const targeting = resolveMigratedSchedule("Targeting Rule Schedules");
    assert.strictEqual(targeting.task, RULE_TASKS.TARGETING);

    const placement = resolveMigratedSchedule("Placement Rule Schedules");
    assert.strictEqual(placement.task, RULE_TASKS.PLACEMENT);

    const dayparting = resolveMigratedSchedule("Dayparting Rule Schedules");
    assert.strictEqual(dayparting.task, RULE_TASKS.DAYPARTING);
  });

  test("Resolves all hourly sync tasks", () => {
    const campaignList = resolveMigratedSchedule("Campaign Listing");
    assert.deepStrictEqual(campaignList, { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.CAMPAIGN_LISTING, family: "sync" });

    const searchReport = resolveMigratedSchedule("Search Term Report");
    assert.deepStrictEqual(searchReport, { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.SEARCH_TERM_REPORT, family: "sync" });
  });

  test("Resolves SP-API tasks", () => {
    const syncOrder = resolveMigratedSchedule("Sync Order");
    assert.deepStrictEqual(syncOrder, { queue: QUEUES.SP_API, task: "sync-order", family: "sp-api" });

    const syncInventory = resolveMigratedSchedule("Sync Inventory");
    assert.deepStrictEqual(syncInventory, { queue: QUEUES.SP_API, task: "sync-inventory", family: "sp-api" });

    const brandAnalytics = resolveMigratedSchedule("Brand Analytics Report");
    assert.deepStrictEqual(brandAnalytics, { queue: QUEUES.SP_API, task: "brand-analytics-report", family: "sp-api" });
  });

  test("Returns null for unmigrated tasks", () => {
    assert.strictEqual(resolveMigratedSchedule("NonExistentTask123"), null);
    assert.strictEqual(resolveMigratedSchedule("Random Unknown Cron"), null);
  });
});

describe("2. Time Bucket & Bounded Lookback Calculation", () => {
  test("Rounds down to minute boundary", () => {
    const date = new Date("2026-10-09T10:25:47.890Z");
    const rounded = toMinuteBoundary(date);
    assert.strictEqual(rounded.toISOString(), "2026-10-09T10:25:00.000Z");
  });

  test("Rounds down to hour boundary", () => {
    const date = new Date("2026-10-09T10:25:47.890Z");
    const rounded = toHourBoundary(date);
    assert.strictEqual(rounded.toISOString(), "2026-10-09T10:00:00.000Z");
  });

  test("Generates bounded lookback hours", () => {
    const lookback = getBoundedLookbackHours(2);
    assert.strictEqual(lookback.length, 2);
    assert.ok(lookback[0].getTime() < lookback[1].getTime());
  });
});

describe("3. Job Options & Size Limits", () => {
  test("Rules size limit keeps up to 100 completed jobs", () => {
    assert.strictEqual(rulesJobOptions.removeOnComplete, 100);
    assert.strictEqual(rulesJobOptions.removeOnFail, 100);
    assert.strictEqual(rulesJobOptions.attempts, 3);
  });

  test("Hourly sync size limit keeps up to 500 completed jobs", () => {
    assert.strictEqual(syncJobOptions.removeOnComplete, 500);
    assert.strictEqual(syncJobOptions.removeOnFail, 200);
    assert.strictEqual(syncJobOptions.attempts, 5);
  });
});
