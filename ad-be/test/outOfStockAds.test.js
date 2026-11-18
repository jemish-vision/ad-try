const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe } = require("node:test");

const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};
stub("api-server/services/redis.service.js", { redisClient: {} });
stub("api-server/helper/common.js", { getActivePlanProfiles: async () => [], getAccessToken: async () => null });
stub("api-server/helper/amazonAxios.js", async () => ({}));
stub("winston/cronAutomation/logger.js", { cron_logs: () => {} });

const { buildOutOfStockList, ELIGIBLE_PROFILE_TYPES } = require("../api-server/services/automation/outOfStockAds.service");
const { resolveMigratedSchedule } = require("../queue-service/scheduler/scheduleRegistry");

const ad = (o) => ({ adType: "SP", campaignStatus: "ENABLED", campaignName: `Camp ${o.campaignId}`, ...o });

describe("out-of-stock ads list", () => {
  const ads = [
    ad({ asin: "B0OOS00001", adId: 1, adGroupId: 10, campaignId: 100 }),
    ad({ asin: "B0OOS00001", adId: 2, adGroupId: 11, campaignId: 100 }), // same campaign, second ad group
    ad({ asin: "B0OOS00001", adId: 3, adGroupId: 20, campaignId: 200, adType: "SD" }),
    ad({ asin: "B0OOS00002", adId: 4, adGroupId: 30, campaignId: 300 }),
    ad({ asin: "B0INSTOCK1", adId: 5, adGroupId: 40, campaignId: 400 }),
  ];
  const availability = new Map([
    ["B0OOS00001", { availability: "OUT_OF_STOCK", title: "Bottle" }],
    ["B0OOS00002", { availability: "OUT_OF_STOCK", title: "Cup" }],
    ["B0INSTOCK1", { availability: "IN_STOCK", title: "Plate" }],
  ]);
  const spend = new Map([[1, 10], [2, 5.5], [3, 2], [4, 30], [5, 99]]);

  test("keeps only OUT_OF_STOCK ASINs, one row per ASIN with each running campaign once", () => {
    const list = buildOutOfStockList(ads, availability, spend);
    assert.deepEqual(list.map((r) => r.asin), ["B0OOS00002", "B0OOS00001"]); // sorted by 7-day spend
    const bottle = list.find((r) => r.asin === "B0OOS00001");
    assert.equal(bottle.campaignCount, 2);
    assert.deepEqual(bottle.campaigns.map((c) => [c.adType, c.campaignId, c.spend7d]), [["SP", 100, 15.5], ["SD", 200, 2]]);
    assert.equal(bottle.spend7d, 17.5);
    assert.equal(bottle.title, "Bottle");
  });

  test("unknown availability is not treated as out of stock", () => {
    assert.equal(buildOutOfStockList(ads, new Map(), spend).length, 0);
  });

  test("seller and vendor profiles only", () => {
    assert.ok(ELIGIBLE_PROFILE_TYPES.has("seller"));
    assert.ok(ELIGIBLE_PROFILE_TYPES.has("vendor"));
    assert.ok(!ELIGIBLE_PROFILE_TYPES.has("agency"));
  });

  test("the Mongo cron name maps to its own queue (not the shared sp-api-queue)", () => {
    assert.deepEqual(resolveMigratedSchedule("Out Of Stock Ads"), { queue: "out-of-stock-ads-queue", task: "out-of-stock-ads", family: "sp-api" });
  });

  test("the producer puts the job on the dedicated queue; other SP-API tasks stay on sp-api-queue", async () => {
    const added = [];
    const fakeQueue = (name) => ({ add: async (task, data, { jobId }) => (added.push({ name, task }), { id: jobId }) });
    stub("queue-service/queues/queues.js", {
      getQueues: () => ({ spApiQueue: fakeQueue("sp-api"), asinSnapshotQueue: fakeQueue("snapshot"), outOfStockAdsQueue: fakeQueue("oos") }),
    });
    delete require.cache[require.resolve("../queue-service/producers/spApi.producer")];
    const { enqueueSpApiForOccurrence } = require("../queue-service/producers/spApi.producer");
    const scheduledFor = "2026-11-18T03:00:00.000Z";
    await enqueueSpApiForOccurrence({ task: "out-of-stock-ads", scheduledFor });
    await enqueueSpApiForOccurrence({ task: "sync-past-data", scheduledFor });
    await enqueueSpApiForOccurrence({ task: "asin-snapshot", scheduledFor });
    assert.deepEqual(added.map((a) => [a.task, a.name]), [["out-of-stock-ads", "oos"], ["sync-past-data", "sp-api"], ["asin-snapshot", "snapshot"]]);
  });
});
