const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const moment = require("moment-timezone");
const { randomUUID } = require("node:crypto");
const { insertOperationHistory } = require("../api-server/helper/operationHistory");
const { normalizeCampaignAdType } = require("../api-server/services/campaignStatusHistory.service");

const source = fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"), "utf8");
const handler = source.slice(source.indexOf("exports.updateCampaignStatus ="), source.indexOf("// Sync Historical Status"));

function harness(options = {}) {
  let report = { _id: "report", status: options.status || "ENABLED", updatedAt: new Date("2026-11-03T00:00:00Z") };
  if (options.missingSnapshotIdentity) report = { status: report.status };
  const writes = [], history = new Map();
  let revision = 0;
  const schema = {
    findOne() {
      const snapshot = structuredClone(report);
      return { sort() { return this; }, lean: async () => snapshot };
    },
    async updateMany(filter, update) {
      writes.push("status");
      report = { ...report, ...update.$set, updatedAt: options.fixedTimestamp
        ? new Date("2026-11-03T00:00:00Z")
        : new Date(Date.UTC(2026, 10, 3, 0, 0, ++revision)) };
    },
  };
  const historyModel = {
    async countDocuments(filter) {
      if (options.countFailure) throw new Error("history read unavailable");
      return [...history.values()].filter(row =>
        Object.entries(filter).every(([field, value]) => String(row[field]) === String(value))).length;
    },
    async bulkWrite(operations) {
      if (options.historyFailure) throw new Error("history unavailable");
      for (const operation of operations) {
        const { filter, update } = operation.updateOne;
        const id = String(filter._id);
        if (!history.has(id)) {
          history.set(id, update.$setOnInsert);
          writes.push(update.$setOnInsert);
        }
      }
    },
  };
  const context = {
    exports: {}, normalizeCampaignAdType, insertOperationHistory, randomUUID,
    getAccessToken: async () => ({ adsAccessToken: "mock", adsClientId: "mock" }),
    getProfile: async () => ({ amazonUrl: "https://example.invalid", timezone: "UTC" }),
    campaignsSchema: schema, sbCampaignsSchema: schema, sdCampaignsSchema: schema,
    campaignChangeHistorySchema: historyModel,
    amazonAxios: async () => {
      writes.push("amazon");
      if (options.hold) await options.hold;
      return { status: 207, data: { campaigns: { success: [{ campaignId: 55 }], error: [] } } };
    },
    retryWithBackoff: work => work(), moment, write_logs() {},
  };
  vm.runInNewContext(handler, context);
  return {
    writes, history,
    async run(status = "PAUSED", adType = "SP") {
      const response = { status() { return this; }, send(body) { this.body = body; return this; } };
      await context.exports.updateCampaignStatus({
        config: { configId: "config" }, user: { _id: "user" },
        body: { profileId: 123, campaignId: 55, status, adType },
      }, response);
      return response.body;
    },
  };
}

for (const previousStatus of ["PAUSED", "ENABLED"]) test("manual status audit from " + previousStatus, async () => {
  const h = harness({ status: previousStatus });
  assert.equal((await h.run()).isSuccess, true);
  assert.equal(h.writes[0], "amazon");
  assert.equal(h.writes.at(-1), "status");
  assert.equal(h.history.size, previousStatus === "PAUSED" ? 0 : 1);
  if (previousStatus === "ENABLED") {
    assert.equal([...h.history.values()][0].oldValue, "ENABLED");
    assert.equal([...h.history.values()][0].newValue, "PAUSED");
  }
});

test("concurrent requests sharing one report snapshot create one transition", async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const h = harness({ hold });
  const requests = Array.from({ length: 20 }, () => h.run());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.writes.filter(write => write === "amazon").length, 20);
  release();
  const results = await Promise.all(requests);
  assert(results.every(result => result.isSuccess));
  assert.equal(h.history.size, 1);
});

test("the same numeric campaign identity in different ad types retains separate transitions", async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const h = harness({ hold });
  const requests = ["SP", "SB", "SD"].map(type => h.run("PAUSED", type));
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all(requests);
  assert.equal(h.history.size, 3);
  assert.deepEqual([...h.history.values()].map(row => row.type).sort(), ["SB", "SD", "SP"]);
});

test("later reversal and repeated transition each retain their own history", async () => {
  const h = harness();
  for (const status of ["PAUSED", "ENABLED", "PAUSED"]) assert.equal((await h.run(status)).isSuccess, true);
  assert.equal(h.history.size, 3);
  assert.deepEqual([...h.history.values()].map(row => [row.oldValue, row.newValue]), [
    ["ENABLED", "PAUSED"], ["PAUSED", "ENABLED"], ["ENABLED", "PAUSED"],
  ]);
});

test("repeated reversals in the same timestamp retain every completed transition", async () => {
  const h = harness({ fixedTimestamp: true });
  for (let cycle = 0; cycle < 10; cycle++) {
    assert.equal((await h.run("PAUSED")).isSuccess, true);
    assert.equal((await h.run("ENABLED")).isSuccess, true);
  }
  assert.equal(h.history.size, 20);
});

test("missing baseline identity uses independent history operations", async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const h = harness({ hold, missingSnapshotIdentity: true });
  const requests = [h.run(), h.run()];
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all(requests);
  assert.equal(h.history.size, 2);
});

test("history write failure keeps old cache and retry repairs one audit before updating cache", async () => {
  const options = { historyFailure: true };
  const h = harness(options);
  const response = await h.run();
  assert.equal(response.isSuccess, false);
  assert.equal(h.history.size, 0);
  assert.deepEqual(h.writes, ["amazon"]);
  options.historyFailure = false;
  assert.equal((await h.run()).isSuccess, true);
  assert.equal(h.history.size, 1);
  assert.equal([...h.history.values()][0].oldValue, "ENABLED");
  assert.equal(h.writes.at(-1), "status");
  await h.run();
  assert.equal(h.history.size, 1);
});

test("generation read failure blocks external send", async () => {
  const h = harness({ countFailure: true });
  assert.equal((await h.run()).isSuccess, false);
  assert.equal(h.writes.length, 0);
});
