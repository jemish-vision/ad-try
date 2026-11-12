const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

// ── fixtures ──────────────────────────────────────────────────────────────
const NOW = new Date("2026-11-12T12:00:00Z"); // 17:30 IST (due) · 04:00 PT (not yet due)
const HISTORY_PAGE_ID = "page-history";
const plans = { enterprise: [HISTORY_PAGE_ID], pro: ["page-other"] };
const profiles = [
  { profileId: 1, configId: "c1", name: "Enterprise synced", timezone: "Asia/Kolkata", marketplaceStringId: "A21TJRUUN4KGV", organization: { _id: "o1", planId: "enterprise", historyRetentionDays: 14 } },
  { profileId: 2, configId: "c2", name: "Pro plan", timezone: "Asia/Kolkata", marketplaceStringId: "A21TJRUUN4KGV", organization: { _id: "o2", planId: "pro" } },
  { profileId: 3, configId: "c3", name: "Enterprise not synced", timezone: "Asia/Kolkata", marketplaceStringId: "A21TJRUUN4KGV", organization: { _id: "o3", planId: "enterprise" } },
  { profileId: 4, configId: "c4", name: "Enterprise already done", timezone: "Asia/Kolkata", marketplaceStringId: "A21TJRUUN4KGV", organization: { _id: "o4", planId: "enterprise" } },
  { profileId: 5, configId: "c5", name: "Enterprise US, too early", timezone: "America/Los_Angeles", marketplaceStringId: "ATVPDKIKX0DER", organization: { _id: "o5", planId: "enterprise" } },
  { profileId: 6, configId: "c6", name: "Enterprise running elsewhere", timezone: "Asia/Kolkata", marketplaceStringId: "A21TJRUUN4KGV", organization: { _id: "o6", planId: "enterprise" } },
];
const syncedProfiles = new Set([1, 4, 5, 6]);
const amazonCalls = [];
const bulkWrites = [];
const historyUpdates = [];

stub("api-server/helper/common.js", {
  getActivePlanProfiles: async () => profiles,
  getSPAccessToken: async () => ({ spAccessToken: "tok", sellerId: "ME" }),
});
stub("api-server/models/superAdmin/pages.model.js", { findOne: () => ({ select: () => ({ lean: async () => ({ _id: HISTORY_PAGE_ID }) }) }) });
stub("api-server/models/packages.model.js", { exists: async (q) => (plans[q._id] || []).includes(q["pages.pageId"]) });
stub("api-server/models/synchronizeDetails.model.js", { exists: async (q) => q.groupId === "SELLER_CATALOG" && q.type === "seller" && syncedProfiles.has(q.profileId) });
stub("api-server/models/asinSnapshot.model.js", {
  exists: async (q) => q.profileId === 4 && q.kind === "OWN" && q.date === "2026-11-12",
  bulkWrite: async (ops) => bulkWrites.push(ops),
  updateMany: async () => ({ modifiedCount: 0 }),
});
stub("api-server/models/cronJobHistory.model.js", {
  exists: async (q) => q.profileId === 6 && q.status === "PENDING",
  findOneAndUpdate: async (q) => ({ _id: `h${q.profileId}` }),
  updateOne: async (q, u) => historyUpdates.push({ q, u }),
});
stub("api-server/models/marketPlaceConfig.model.js", { findOne: () => ({ lean: async () => ({ endPoint: "https://sp", marketPlaceId: "A21TJRUUN4KGV" }) }) });
stub("api-server/models/productListing.model.js", { distinct: async () => ["B0OWN00001", "B0OWN00002"] });
stub("api-server/models/competitor.model.js", {
  find: () => ({ select: () => ({ lean: async () => [{ myAsin: "B0OWN00001", asin: "B0RIVAL001", price: 9, classificationRanks: 10 }] }) }),
});
stub("api-server/helper/amazonAxios.js", async (cfg) => {
  amazonCalls.push(cfg);
  if (cfg.url.includes("/batches/")) {
    return { data: { responses: cfg.data.requests.map((r) => ({ status: { statusCode: 200 }, request: { Asin: r.uri.split("/")[5] }, body: { payload: { ASIN: r.uri.split("/")[5], Summary: { TotalOfferCount: 1 }, Offers: [{ SellerId: "ME", MyOffer: true, ListingPrice: { Amount: 10 }, Shipping: { Amount: 0 }, IsBuyBoxWinner: true }] } } })) } };
  }
  return { data: { items: [] } };
});
stub("api-server/helper/retryHelper.js", { retryWithBackoff: (fn) => fn() });
stub("winston/cronAutomation/logger.js", { cron_logs: () => {} });

const { cronAsinSnapshot } = require("../api-server/services/automation/asinSnapshot.service");

test("hourly run: only due Enterprise profiles with completed seller sync are snapshotted", async () => {
  const stats = await cronAsinSnapshot({ now: NOW });
  assert.deepEqual(
    { notOnPlan: stats.notOnPlan, syncIncomplete: stats.syncIncomplete, notDue: stats.notDue, inProgress: stats.inProgress, completed: stats.completed, failed: stats.failed },
    { notOnPlan: 1, syncIncomplete: 1, notDue: 2, inProgress: 1, completed: 1, failed: 0 }
  );

  // Only profile 1 called Amazon: 1 offers batch + 1 ranks batch
  assert.equal(amazonCalls.length, 2);
  assert.ok(amazonCalls.every((c) => c.meta.profileId === 1));

  // 2 OWN + 1 RIVAL docs, all expiring after the org's 14-day retention
  const ops = bulkWrites.flat();
  assert.equal(ops.length, 3);
  const expires = ops.map((o) => o.updateOne.update.$set.expiresAt.toISOString());
  assert.ok(expires.every((e) => e === "2026-11-26T12:00:00.000Z"));
  const own = ops.find((o) => o.updateOne.filter.kind === "OWN").updateOne.update.$set;
  assert.equal(own.date, "2026-11-12");
  assert.equal(own.weHaveBuyBox, true);
  assert.equal(own.ourPrice, 10);

  const done = historyUpdates.find((h) => h.q._id === "h1");
  assert.equal(done.u.$set.status, "COMPLETED");
  assert.equal(done.u.$set.recordsCount, 3);
});
