const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

process.env.ASIN_SNAPSHOT_OFFERS_INTERVAL_MS = "300";
const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

const offerCallTimes = [];
const asins = Array.from({ length: 45 }, (_, i) => `B0PACE${String(i).padStart(4, "0")}`); // 3 batches of ≤20

stub("api-server/helper/common.js", { getActivePlanProfiles: async () => [], getSPAccessToken: async () => ({ spAccessToken: "t", sellerId: "ME" }) });
stub("api-server/models/marketPlaceConfig.model.js", { findOne: () => ({ lean: async () => ({ endPoint: "https://sp", marketPlaceId: "A21TJRUUN4KGV" }) }) });
stub("api-server/models/productListing.model.js", { distinct: async () => asins });
stub("api-server/models/competitor.model.js", { find: () => ({ select: () => ({ lean: async () => [] }) }) });
stub("api-server/models/asinSnapshot.model.js", { bulkWrite: async () => {} });
stub("api-server/helper/retryHelper.js", { retryWithBackoff: (fn) => fn() });
stub("winston/cronAutomation/logger.js", { cron_logs: () => {} });
stub("api-server/helper/amazonAxios.js", async (cfg) => {
  if (cfg.url.includes("/batches/")) {
    offerCallTimes.push(Date.now());
    return { data: { responses: [] } };
  }
  return { data: { items: [] } };
});

const { runAsinSnapshotForProfile } = require("../api-server/services/automation/asinSnapshot.service");

test("batch offer calls are paced to the configured interval (Amazon allows 1 per 10s)", async () => {
  await runAsinSnapshotForProfile({
    profile: { configId: "c1", profileId: 9, marketplaceStringId: "A21TJRUUN4KGV", organization: { _id: "o1", historyRetentionDays: 7 } },
    date: "2026-11-12",
  });
  assert.equal(offerCallTimes.length, 3);
  for (let i = 1; i < offerCallTimes.length; i++) {
    assert.ok(offerCallTimes[i] - offerCallTimes[i - 1] >= 290, `gap ${i} was ${offerCallTimes[i] - offerCallTimes[i - 1]}ms`);
  }
});
