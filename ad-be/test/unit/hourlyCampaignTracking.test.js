const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const mongoose = require("mongoose");
const moment = require("moment-timezone");

const controller = fs.readFileSync(require.resolve("../../api-server/controllers/campaign.controller"), "utf8");
const from = controller.indexOf("exports.hourlyCampaignTracking =");
const to = controller.indexOf("\nexports.", from + 1);
assert.ok(from >= 0 && to > from);
const configId = new mongoose.Types.ObjectId("111111111111111111111111");
const profileId = 1234;

function run(body, rowsForAds = () => []) {
  const adsMatches = [];
  const ordersMatches = [];
  const exports = {};
  const aggregate = (matches, rowsFor) => pipeline => ({
    allowDiskUse: async () => {
      const filter = JSON.parse(JSON.stringify(pipeline[0].$match));
      matches.push(filter);
      return rowsFor(filter);
    },
  });
  vm.runInNewContext(controller.slice(from, to), {
    exports, mongoose, moment,
    getProfile: async () => ({ timezone: "America/New_York" }),
    keywordsHourlyPerformanceSchema: { aggregate: aggregate(adsMatches, rowsForAds) },
    orderSchema: { aggregate: aggregate(ordersMatches, () => []) },
    write_logs({ message }) { throw new Error(message); },
  });
  const res = {
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  const done = exports.hourlyCampaignTracking({ config: { configId }, body: { profileId, ...body } }, res);
  return { res, adsMatches, ordersMatches, done };
}

test("long all-campaign ranges run disjoint indexed reads and return slots in date order", async () => {
  let finishFirst;
  const h = run({ startDate: "2026-10-21", endDate: "2026-11-11", campaignId: [] }, filter => {
    const row = { _id: { date: filter.reportDate.$gte, startTime: "00:00", endTime: "01:00" } };
    if (filter.reportDate.$lt) return new Promise(resolve => { finishFirst = () => resolve([row]); });
    return [row];
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.ordersMatches.length, 1);
  assert.deepEqual(h.adsMatches, [
    { configId: String(configId), profileId, reportDate: { $gte: "2026-10-21", $lt: "2026-11-01" } },
    { configId: String(configId), profileId, reportDate: { $gte: "2026-11-01", $lte: "2026-11-11" } },
  ]);
  finishFirst();
  await h.done;
  assert.equal(h.res.code, 200);
  const dates = Array.from(h.res.payload.result.hourlyData, row => row._id.date);
  assert.deepEqual(dates, ["2026-10-21", "2026-11-01"]);
});

test("short or campaign-filtered requests keep one ads query", async () => {
  for (const body of [
    { startDate: "2026-11-02", endDate: "2026-11-21" },
    { startDate: "2026-11-01", endDate: "2026-11-30", campaignId: ["987"] },
  ]) {
    const h = run(body);
    await h.done;
    assert.equal(h.res.code, 200);
    assert.equal(h.ordersMatches.length, 1);
    assert.deepEqual(h.adsMatches, [{
      configId: String(configId), profileId,
      ...(body.campaignId ? { campaignId: { $in: [987] } } : {}),
      reportDate: { $gte: body.startDate, $lte: body.endDate },
    }]);
  }
});
