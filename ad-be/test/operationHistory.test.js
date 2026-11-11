const { test } = require("node:test");
const assert = require("node:assert/strict");
const { historyDocumentId, insertOperationHistory, historyPersistenceError } = require("../api-server/helper/operationHistory");

const base = { configId: "config", profileId: 1, changeLevel: 2, targetId: "T-3",
  adGroupId: 4, type: "SP", changeType: "Update Targeting Bid", source: "RECOMMENDATION",
  oldValue: "1", newValue: "2" };

function memoryModel() {
  const records = new Map();
  return { records, async bulkWrite(operations) {
    for (const { updateOne } of operations) {
      const id = String(updateOne.filter._id);
      if (!records.has(id)) records.set(id, updateOne.update.$setOnInsert);
    }
  } };
}

test("concurrent replays of an operation retain one event", async () => {
  const model = memoryModel();
  await Promise.all(Array.from({ length: 20 }, () => insertOperationHistory(model, [base], "operation")));
  assert.equal(model.records.size, 1);
});

test("separate operations and intervening reversals are retained", async () => {
  const model = memoryModel();
  await insertOperationHistory(model, [base], "apply-1");
  await insertOperationHistory(model, [{ ...base, oldValue: "2", newValue: "1" }], "revert-1");
  await insertOperationHistory(model, [base], "apply-2");
  assert.equal(model.records.size, 3);
});

test("partial failure surfaces and replay repairs only missing events", async () => {
  const model = memoryModel();
  const normalWrite = model.bulkWrite;
  let fail = true;
  model.bulkWrite = async operations => {
    if (fail) {
      fail = false;
      await normalWrite.call(model, operations.slice(0, 1));
      throw new Error("partial write");
    }
    return normalWrite.call(model, operations);
  };
  const docs = [base, { ...base, targetId: "T-5" }];
  await assert.rejects(insertOperationHistory(model, docs, "operation"), /partial write/);
  assert.equal(model.records.size, 1);
  await insertOperationHistory(model, docs, "operation");
  assert.equal(model.records.size, 2);
});

test("entity dimensions, transitions and placements have independent identity", () => {
  const id = String(historyDocumentId("operation", base));
  for (const different of [
    { type: "SB" }, { profileId: 2 }, { configId: "other" }, { changeLevel: 3 },
    { adGroupId: 5 }, { targetId: "T-4" }, { newValue: "3" }, { oldValue: "0" },
    { placement: "PLACEMENT_TOP" }, { matchType: "EXACT" }, { targetId: "K-3" },
  ]) assert.notEqual(String(historyDocumentId("operation", { ...base, ...different })), id);
});

test("no-op changes are omitted and errors never trigger an unscoped insert", async () => {
  const model = memoryModel();
  await insertOperationHistory(model, [{ ...base, oldValue: "2" }], "operation");
  assert.equal(model.records.size, 0);
  let writes = 0;
  await assert.rejects(insertOperationHistory({ bulkWrite: async () => {
    writes++;
    throw new Error("write unavailable");
  } }, [base], "operation"), /write unavailable/);
  assert.equal(writes, 1);
});

test("dayparting persistence failure prevents run and DB state advancing", async () => {
  const source = require("node:fs").readFileSync(require.resolve("../api-server/controllers/daypartingstretegy.controller"), "utf8");
  const start = source.indexOf("const updateSPCampaignBudgetInternal =");
  const end = source.indexOf("async function sponsoredProductBudgetDayparting", start);
  let stateWrites = 0;
  const failure = Object.assign(new Error("history unavailable"), { historyPersistenceFailure: true });
  const update = new Function("getAccessToken", "processBatchUpdates", "campaignSchema", "safeInsertHistoryDocs", "cron_logs",
    source.slice(start, end) + "; return updateSPCampaignBudgetInternal;")(
    async () => ({}), async () => ({ successfulItems: [{ campaignId: "2" }] }),
    { find: () => ({ lean: async () => [{ campaignId: 2, budget: 1 }] }), bulkWrite: async () => stateWrites++ },
    async () => { throw failure; }, () => {});
  await assert.rejects(update({ configId: "config", profileId: 1 }, { configId: "config" },
    [{ campaignId: 2 }], { 2: 3 }, "2026-11-04", "operation"), error => error === failure);
  assert.equal(stateWrites, 0);
});

test("recommendation chunk persistence failure reaches the request boundary", async () => {
  const source = require("node:fs").readFileSync(require.resolve("../api-server/controllers/recommendation.controller"), "utf8");
  const start = source.indexOf("const applyCampaignRecommendation =");
  const end = source.indexOf("const computeBidValue =", start);
  const failure = Object.assign(new Error("history unavailable"), { historyPersistenceFailure: true });
  const apply = new Function("getRuleSettings", "moment", "chunkArray", "retryWithBackoff", "amazonAxios",
    "recommandationCampaignByRuleSchema", "safeInsertRecommendationHistory",
    source.slice(start, end) + "; return applyCampaignRecommendation;")(
    async () => ({}), require("moment-timezone"), rows => [rows], callback => callback(),
    async () => ({ status: 200 }), { bulkWrite: async () => {} }, async () => { throw failure; });
  await assert.rejects(apply({ actions: [{ actionName: "SetBudget", actionValue: 3 }] },
    [{ campaignId: 2, budget: 1 }], { profileId: 1 }, {}, "SP", "operation"), error => error === failure);
});

test("slot identity ignores scheduler progress and retains actual action configuration", () => {
  const source = require("node:fs").readFileSync(require.resolve("../api-server/controllers/daypartingstretegy.controller"), "utf8");
  const start = source.indexOf("const daypartingHistoryOperation =");
  const end = source.indexOf("exports.getAllDayparting", start);
  const operation = new Function("historyPersistenceError", source.slice(start, end) + "; return daypartingHistoryOperation;")(historyPersistenceError);
  const rule = { _id: "rule", bidChangeType: "MULTIPLIER", updatedAt: new Date(0) };
  const now = require("moment-timezone")("2026-11-04T10:00:00Z");
  const slot = { slotIndex: 1, startTime: 10, endTime: 12, multiplier: 1.5 };
  const id = operation(rule, now, slot, null, "apply");
  assert.equal(operation({ ...rule, updatedAt: new Date(), isRunning: true }, now, slot, null, "apply"), id);
  assert.equal(operation(rule, now, { ...slot, slotIndex: undefined }, null, "apply"), id);
  assert.notEqual(operation(rule, now, { ...slot, multiplier: 2 }, null, "apply"), id);
  assert.notEqual(operation(rule, now.clone().add(1, "day"), slot, null, "apply"), id);
  assert.notEqual(operation(rule, now, slot, { _id: "run" }, "revert"), id);
  assert.throws(() => operation(rule, now, { startTime: 10 }, null, "apply"),
    error => error.historyPersistenceFailure === true);
  assert.throws(() => operation(rule, now, slot, null, "revert"),
    error => error.historyPersistenceFailure === true);
  const commonSource = require("node:fs").readFileSync(require.resolve("../api-server/helper/common"), "utf8");
  const getSlotStart = commonSource.indexOf("const getActiveSlot =");
  const getSlotEnd = commonSource.indexOf("const getBidThreshold =", getSlotStart);
  const getActiveSlot = new Function(commonSource.slice(getSlotStart, getSlotEnd) + "; return getActiveSlot;")();
  const legacySlot = getActiveSlot([{ enabled: true, startTime: "10:00", endTime: "12:00", multiplier: 1.5 }], 10);
  assert.equal(legacySlot.slotIndex, undefined);
  assert.equal(typeof operation(rule, now, legacySlot, null, "apply"), "string");
});

test("history identity and document construction failures propagate as persistence failures", async () => {
  const model = { bulkWrite: async () => assert.fail("Invalid identity must not write") };
  await assert.rejects(insertOperationHistory(model, [base], ""),
    error => error.historyPersistenceFailure === true);
  await assert.rejects(insertOperationHistory(model, [null], "operation"),
    error => error.historyPersistenceFailure === true);
});

test("malformed legacy slot cannot advance dayparting execution lifecycle", async () => {
  const source = require("node:fs").readFileSync(require.resolve("../api-server/controllers/daypartingstretegy.controller"), "utf8");
  const operationSource = source.slice(source.indexOf("const daypartingHistoryOperation ="), source.indexOf("exports.getAllDayparting"));
  const operation = new Function("historyPersistenceError", operationSource + "; return daypartingHistoryOperation;")(historyPersistenceError);
  const start = source.indexOf("async function handleBudgetDayparting");
  const end = source.indexOf("const updateSPPlacementModifierInternal", start);
  let lifecycleWrites = 0;
  const run = new Function("daypartingRuleHistorySchema", "sponsoredProductBudgetDayparting",
    "sponsoredBrandBudgetDayparting", "sponsoredDisplayBudgetDayparting",
    source.slice(start, end) + "; return handleBudgetDayparting;")(
    { findOne: async () => null, create: async () => lifecycleWrites++ },
    async ({ rule, now, activeSlot, history }) => operation(rule, now, activeSlot, history, "apply"),
    async () => ({}), async () => ({}));
  await assert.rejects(run({ rule: { _id: "rule", campaignIds: { SP: [], SB: [], SD: [] } },
    now: require("moment-timezone")(), activeSlot: { multiplier: 1.5 } }),
  error => error.historyPersistenceFailure === true);
  assert.equal(lifecycleWrites, 0);
});
