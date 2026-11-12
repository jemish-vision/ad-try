const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe } = require("node:test");

const root = path.join(__dirname, "..");

/** Replace a module in require.cache before it is loaded by the code under test. */
function stubModule(relPath, exportsObj) {
  const resolved = require.resolve(path.join(root, relPath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

describe("cronJobHistory: FAILED rows always carry a reason", () => {
  const CronJobHistory = require("../api-server/models/cronJobHistory.model");
  const runPre = (op, query) =>
    new Promise((resolve, reject) => CronJobHistory.schema.s.hooks.execPre(op, query, [], (err) => (err ? reject(err) : resolve())));

  test("findByIdAndUpdate(id, { status: FAILED }) gets a generic error", async () => {
    const q = CronJobHistory.findOneAndUpdate({ _id: "64b000000000000000000001" }, { status: "FAILED" });
    await runPre("findOneAndUpdate", q);
    assert.match(q.getUpdate().$set.error, /Failed without a recorded reason/);
  });

  test("an explicit error is kept", async () => {
    const q = CronJobHistory.updateOne({ _id: "64b000000000000000000001" }, { $set: { status: "FAILED", error: "SB: ERROR" } });
    await runPre("updateOne", q);
    assert.equal(q.getUpdate().$set.error, "SB: ERROR");
  });

  test("non-FAILED updates are untouched", async () => {
    const q = CronJobHistory.findOneAndUpdate({ _id: "64b000000000000000000001" }, { status: "COMPLETED" });
    await runPre("findOneAndUpdate", q);
    assert.equal(q.getUpdate().$set?.error, undefined);
  });

  test("new documents saved as FAILED get a reason", async () => {
    const doc = new CronJobHistory({ cronName: "Campaign Report", status: "FAILED" });
    await new Promise((resolve, reject) => CronJobHistory.schema.s.hooks.execPre("save", doc, [], (e) => (e ? reject(e) : resolve())));
    assert.match(doc.error, /Failed without a recorded reason/);
  });
});

describe("SP-API report terminal statuses", () => {
  const { settleTerminalReportStatus, SETTLED_REPORT_STATUSES } = require("../api-server/helpers/spReportStatus.helper");
  const fakeModel = () => {
    const calls = [];
    return { calls, updateOne: async (filter, update) => calls.push({ filter, update }) };
  };

  test("CANCELLED -> row CANCELLED, run treated as COMPLETED", async () => {
    const m = fakeModel();
    assert.equal(await settleTerminalReportStatus(m, { _id: 1 }, "CANCELLED"), "COMPLETED");
    assert.equal(m.calls[0].update.$set.status, "CANCELLED");
    assert.match(m.calls[0].update.$set.errorMessage, /no data/);
  });

  test("FATAL -> row FATAL, run treated as ERROR", async () => {
    const m = fakeModel();
    assert.equal(await settleTerminalReportStatus(m, { _id: 1 }, "FATAL"), "ERROR");
    assert.equal(m.calls[0].update.$set.status, "FATAL");
  });

  test("IN_QUEUE / IN_PROGRESS / DONE are not terminal here", async () => {
    const m = fakeModel();
    for (const s of ["IN_QUEUE", "IN_PROGRESS", "DONE", undefined]) {
      assert.equal(await settleTerminalReportStatus(m, { _id: 1 }, s), null);
    }
    assert.equal(m.calls.length, 0);
  });

  test("CANCELLED counts as settled so initial sync does not re-request it forever", () => {
    assert.ok(SETTLED_REPORT_STATUSES.includes("CANCELLED"));
    assert.ok(!SETTLED_REPORT_STATUSES.includes("FATAL"));
  });
});

describe("cron history reason messages", () => {
  const { reportRequestFailureReason, syncNotCompletedReason } = require("../api-server/helpers/cronHistoryError.helper");
  test("lists the failed ad types", () => {
    const msg = reportRequestFailureReason({ SP: "COMPLETED", SB: "ERROR", SD: "ERROR" });
    assert.match(msg, /failed for SB, SD/);
    assert.match(msg, /SP: COMPLETED/);
  });
  test("names the sync group", () => {
    assert.match(syncNotCompletedReason("TARGETING", "ads"), /group TARGETING \(ads\)/);
  });
});

describe("hourly sync: profiles without a COMPLETED sync group are SKIPPED, not COMPLETED", () => {
  // Stub everything heavy that hourlySync.service pulls in (controllers, Redis-backed helpers).
  let syncRows = [];
  const skipped = [];
  const controllerCalls = [];
  const noop = (name) => async () => { controllerCalls.push(name); return "COMPLETED"; };

  stubModule("api-server/models/synchronizeDetails.model.js", {
    findOne: (q) => ({
      select: () => ({
        lean: async () =>
          syncRows.find((r) => q.groupId.$in.includes(r.groupId) && r.type === q.type && r.requestStatus === q.requestStatus && r.profileId === q.profileId && String(r.configId) === String(q.configId)) || null,
      }),
    }),
  });
  stubModule("api-server/services/automation/profileEligibility.service.js", {
    getEligibleProfile: async ({ profileId }) => ({ profileId, name: "Test Profile", timezone: "Asia/Kolkata" }),
  });
  stubModule("api-server/services/automation/syncRun.service.js", {
    checkPrerequisiteStatus: async () => ({ ready: true }),
    claimSyncRun: async () => ({ shouldExecute: true, record: { _id: "run1" } }),
    markSyncRunCompleted: async () => {},
    markSyncRunFailed: async () => {},
    markSyncRunWaiting: async () => {},
    markSyncRunSkipped: async (args) => { skipped.push(args); return { _id: "skip1" }; },
  });
  stubModule("winston/cronAutomation/logger.js", { cron_logs: () => {} });
  stubModule("api-server/controllers/campaign.controller.js", { cronListCampaignsFromAmazon: noop("campaignListing"), cronGenerateCampaignReport: noop("campaignReport") });
  stubModule("api-server/controllers/adGroups.controller.js", { cronListAdGroupsFromAmazon: noop("adGroupListing"), cronGenerateAdGroupReport: noop("adGroupReport") });
  stubModule("api-server/controllers/targeting.controller.js", { cronListTargetingFromAmazon: noop("targetingListing"), cronGenerateTargetingReport: noop("targetingReport") });
  stubModule("api-server/controllers/productAds.controller.js", { cronListProductAdsFromAmazon: noop("productAdsListing"), cronGenerateAdProductReport: noop("productAdsReport") });
  stubModule("api-server/controllers/placement.controller.js", { cronGeneratePlacementReport: noop("placement") });
  stubModule("api-server/controllers/searchTerm.controller.js", { cronGenerateSearchTermReport: noop("searchTerm") });
  stubModule("api-server/services/automation/periodicReportSync.service.js", { runPeriodicReportSync: noop("periodic") });

  const { runHourlySyncForProfile, TASK_SYNC_GROUPS } = require("../api-server/services/automation/hourlySync.service");
  const { SYNC_TASKS } = require("../queue-service/queues/queueNames");
  const base = { configId: "64b0000000000000000000aa", profileId: 111, timeBlock: "20261112T05Z", scheduledFor: "2026-11-12T05:00:00Z", jobId: "j1" };

  test("every hourly sync task is mapped to a sync group", () => {
    for (const t of Object.values(SYNC_TASKS)) {
      if (["report-batch-writer", "hourly-data-consolidation"].includes(t)) continue;
      assert.ok(TASK_SYNC_GROUPS[t], `missing group mapping for ${t}`);
    }
  });

  test("no COMPLETED row -> SKIPPED with reason, controller never called", async () => {
    syncRows = [{ groupId: "CAMPAIGNS", type: "ads", requestStatus: "PENDING", profileId: 111, configId: base.configId }];
    const res = await runHourlySyncForProfile({ ...base, task: SYNC_TASKS.CAMPAIGN_REPORT });
    assert.equal(res.skipped, true);
    assert.equal(res.reason, "SYNC_NOT_COMPLETED:CAMPAIGNS");
    assert.equal(skipped.at(-1).task, SYNC_TASKS.CAMPAIGN_REPORT);
    assert.deepEqual(controllerCalls, []);
  });

  test("COMPLETED for CAMPAIGNS but not TARGETING -> targeting task skipped", async () => {
    syncRows = [{ groupId: "CAMPAIGNS", type: "ads", requestStatus: "COMPLETED", profileId: 111, configId: base.configId }];
    const res = await runHourlySyncForProfile({ ...base, task: SYNC_TASKS.TARGETING_LISTING });
    assert.equal(res.reason, "SYNC_NOT_COMPLETED:TARGETING");
    assert.deepEqual(controllerCalls, []);
  });

  test("COMPLETED row -> task runs normally", async () => {
    syncRows = [{ groupId: "CAMPAIGNS", type: "ads", requestStatus: "COMPLETED", profileId: 111, configId: base.configId }];
    const res = await runHourlySyncForProfile({ ...base, task: SYNC_TASKS.CAMPAIGN_REPORT });
    assert.equal(res.success, true);
    assert.equal(res.skipped, undefined);
    assert.deepEqual(controllerCalls, ["campaignReport"]);
  });

  test("weekly report runs if either group is COMPLETED", async () => {
    controllerCalls.length = 0;
    syncRows = [{ groupId: "TARGETING", type: "ads", requestStatus: "COMPLETED", profileId: 111, configId: base.configId }];
    const res = await runHourlySyncForProfile({ ...base, task: SYNC_TASKS.WEEKLY_REPORT });
    assert.equal(res.skipped, undefined);
    assert.deepEqual(controllerCalls, ["periodic"]);
  });
});
