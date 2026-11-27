const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const moment = require("moment-timezone");

const source = fs.readFileSync(require.resolve("../../api-server/controllers/order.controller"), "utf8");
const start = source.indexOf("exports.cronRequestReview =");
const end = source.indexOf("\nexports.", start + 1);
assert.ok(start >= 0 && end > start);

test("Review Request skips missing credentials, waits for eligible orders, and propagates unexpected errors", async () => {
  const exports = {};
  const logs = [];
  const completed = [];
  let releaseOrder;
  let orderStarted;
  const pendingOrder = new Promise(resolve => { releaseOrder = resolve; });
  const orderReached = new Promise(resolve => { orderStarted = resolve; });
  vm.runInNewContext(source.slice(start, end), {
    exports, moment, limit: task => task(),
    cron_logs: entry => logs.push(entry),
    cronJobSchema: { findOne: () => ({ lean: async () => null }) },
    getActivePlanProfiles: async (...args) => {
      assert.deepEqual(args, ["ALL", "sp"]);
      return [1, 2, 3].map(profileId => ({ profileId, configId: "test", timezone: "UTC" }));
    },
    getSPAccessToken: async (_config, profileId) => {
      if (profileId === 1) {
        throw Object.assign(new Error("Credentials or refresh token missing/inactive for sp:test"), { status: 404 });
      }
      if (profileId === 3) throw new Error("Unexpected token failure");
      return { spAccessToken: "fixture" };
    },
    orderSchema: { aggregate: async () => [{ marketplaceId: "test", amazonOrderId: "order-1" }] },
    marketPlaceConfigSchema: { findOne: () => ({ lean: async () => ({ endPoint: "https://example.invalid" }) }) },
    retryWithBackoff: task => task(),
    amazonAxios: async () => {
      orderStarted();
      await pendingOrder;
      return { status: 200, data: {} };
    },
    cronJobHistorySchema: class {
      constructor({ profileId }) { this.profileId = profileId; }
      async save() { completed.push(this.profileId); }
    },
  });
  const run = exports.cronRequestReview();
  const failure = assert.rejects(run, /1 profile\(s\) failed Review Request.*Unexpected token failure/);
  await Promise.race([orderReached, run]);
  assert.deepEqual(completed, []);
  assert.ok(logs.some(entry => entry.message.includes("Skipping profile 1")));
  releaseOrder();
  await failure;
  assert.deepEqual(completed, [2]);
});
