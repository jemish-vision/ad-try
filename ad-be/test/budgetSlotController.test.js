const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const moment = require("moment-timezone");
const { createRuleSlotExecutionService } = require("../api-server/services/automation/ruleSlotExecution.service");

const source = fs.readFileSync(require.resolve("../api-server/controllers/budgetRules.controller"), "utf8");
const extracted = source.slice(source.indexOf("const recordBudgetExecutionChange ="), source.indexOf("exports.cronBudgetRulesSchedules ="));
const profile = { configId: "config", profileId: 1, timezone: "Asia/Kolkata" };
const scheduledFor = new Date("2026-11-03T04:30:00Z");
const baseRule = { _id: "rule", configId: "config", profileId: 1, userId: "user", ruleName: "budget",
  ruleType: "A", days: ["Tuesday"], times: ["10:00"], timezone: profile.timezone,
  actionType: { actionName: "Increase", actionValue: 10, actionValueType: "Percentage" } };
const campaign = { campaignId: 22, configId: "config", profileId: 1, budget: 100, budgetType: "DAILY", status: "ENABLED" };

function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (value instanceof Date) return +row[key] === +value;
    if (value && typeof value === "object") return Object.entries(value).every(([op, expected]) =>
      op === "$ne" ? row[key] !== expected : op === "$exists" ? (row[key] !== undefined) === expected : op === "$gt" ? row[key] > expected : false);
    return value === null ? row[key] == null : row[key] === value;
  });
}

function harness(options = {}) {
  const records = [], sends = [], histories = [], bulk = [];
  const key = row => JSON.stringify(["configId", "profileId", "ruleId", "ruleSchema", "ruleDate", "ruleTime"].map(field => row[field]));
  const slotModel = {
    collection: { indexes: async () => [{ unique: true, key: { configId: 1, profileId: 1, ruleId: 1, ruleSchema: 1, ruleDate: 1, ruleTime: 1 } }] },
    findOne: query => ({ lean: async () => structuredClone(records.find(row => matches(row, query)) || null) }),
    async findOneAndUpdate(query, update, settings = {}) {
      let row = records.find(item => matches(item, query));
      if (!row && settings.upsert) {
        row = Object.fromEntries(Object.entries(query).filter(([, value]) => value == null || typeof value !== "object"));
        Object.assign(row, structuredClone(update.$set));
        if (records.some(item => key(item) === key(row))) throw Object.assign(new Error("duplicate slot"), { code: 11000 });
        records.push(row);
      } else if (row) Object.assign(row, structuredClone(update.$set));
      return structuredClone(row || null);
    },
  };
  const service = createRuleSlotExecutionService({ model: slotModel });
  const query = value => ({ lean: async () => value, then(resolve) { return Promise.resolve(value).then(resolve); } });
  const model = { find: () => query([]), findOne: () => query(null),
    findOneAndUpdate: (filter, update) => { histories.push({ filter, update }); return query({ _id: "history" }); },
    findByIdAndUpdate: () => query({}), bulkWrite: async operations => bulk.push(...operations) };
  const sandbox = { exports: {}, moment, global: {}, process: { env: { AUTOMATION_EXECUTION_MODE: options.mode || "queue" } },
    cron_logs() {}, ruleLimit: work => work(), runWithRuleSlot: service.runWithRuleSlot,
    budgetRulesSchema: { ...model, find: () => query(options.rules || [structuredClone(baseRule)]) },
    ruleRunHistorySchema: { find: () => query(records.filter(row => row.isRun)) },
    budgetRulesHistorySchema: model, cronJobHistorySchema: model, affectedCampaignByRuleSchema: model,
    campaignsSchema: model, sbCampaignsSchema: model, sdCampaignsSchema: model, campaignProductEligibleStatusByRuleSchema: model,
    getTypeBasedRuleData: async (rule, type) => options.rows?.[type] || [],
    getActiveSlot: slots => slots[0], getAccessToken: async () => options.noToken ? null : { adsAccessToken: "mock" },
    checkCampaignProductAvailability: async () => ({ lowStockCampaigns: [] }), getRuleSettings: async () => ({}),
    updateSnapshotHistory: async () => {}, createHistory: async () => {},
    recordRuleExecutionChange: async () => options.lifecycleFailure ? null : { _id: "lifecycle" },
    processBatchUpdates: async args => {
      await args.beforeRequest?.();
      sends.push(args);
      if (options.hold) await options.hold;
      if (options.ownershipLost) records[0].slotOwnerToken = "lost-owner";
      const successfulItems = options.partial ? args.updates.slice(0, 1) : args.updates;
      return { successfulItems, failedCount: options.partial ? 1 : 0, failedItems: options.partial ? [{}] : [] };
    },
  };
  vm.runInNewContext(extracted, sandbox);
  return { api: sandbox.exports, records, sends, histories, bulk, sandbox };
}

for (const mode of ["queue", "legacy"]) test(mode + " concurrent normal entry calls execute one budget slot", async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const h = harness({ mode, hold, rows: { SP: [campaign], SB: [campaign], SD: [campaign] } });
  const runs = Array.from({ length: 20 }, () => h.api.executeBudgetRulesForProfile(profile, scheduledFor));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sends.length, 1);
  release();
  const results = await Promise.all(runs);
  assert.equal(results.reduce((sum, result) => sum + result.executedCount, 0), 1);
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].slotState, "COMPLETED");
  assert.equal(h.sends.length, 3);
  assert(h.sends.every(args => typeof args.beforeRequest === "function"));
  assert(h.sends.every(args => args.updates[0].context.calculatedBudget === 110));
  await h.api.executeBudgetRulesForProfile(profile, scheduledFor);
  assert.equal(h.sends.length, 3);
});

for (const type of ["SP", "SB", "SD"]) test(type + " partial results persist confirmed updates and block automatic replay", async () => {
  const h = harness({ partial: true, rows: { [type]: [campaign, { ...campaign, campaignId: 23 }] } });
  await assert.rejects(h.api.executeBudgetRulesForProfile(profile, scheduledFor), /unconfirmed/);
  assert.equal(h.records[0].slotState, "RECOVERY_REQUIRED");
  assert.equal(h.records[0].isRun, false);
  assert.equal(h.bulk.length, 1);
  assert.equal(h.sends.length, 1);
  await assert.rejects(h.api.executeBudgetRulesForProfile(profile, scheduledFor), { code: "RULE_SLOT_RECOVERY_REQUIRED" });
  assert.equal(h.sends.length, 1);
});

for (const options of [{ noToken: true }, { lifecycleFailure: true }]) test("uncertain budget execution fails closed " + JSON.stringify(options), async () => {
  const h = harness({ ...options, rows: { SP: [campaign] } });
  await assert.rejects(h.api.executeBudgetRulesForProfile(profile, scheduledFor));
  assert.equal(h.records[0].isRun, false);
  assert(!h.histories.some(item => item.update.$set.status === "COMPLETED"));
  await assert.rejects(h.api.executeBudgetRulesForProfile(profile, scheduledFor));
});

test("ownership loss after Amazon response blocks persistence and another send", async () => {
  const h = harness({ ownershipLost: true, rows: { SP: [campaign] } });
  await assert.rejects(h.api.executeBudgetRulesForProfile(profile, scheduledFor), { code: "RULE_SLOT_OWNERSHIP_LOST" });
  assert.equal(h.records[0].isRun, false);
  assert.equal(h.bulk.length, 0);
  const result = await h.api.executeBudgetRulesForProfile(profile, scheduledFor);
  assert.equal(result.executedCount, 0);
  assert.equal(h.sends.length, 1);
});

test("out-of-window temporary rules preserve schedule exclusion", async () => {
  const h = harness({ rules: [{ ...baseRule, ruleType: "T", startDate: "2026-11-04", endDate: "2026-11-05" }] });
  const result = await h.api.executeBudgetRulesForProfile(profile, scheduledFor);
  assert.equal(result.executedCount, 0);
  assert.equal(h.records.length, 0);
});

test("hourly slot and later scheduled occurrence remain independent", async () => {
  const rule = { ...baseRule, isHourlyBudget: true, hourlyConfig: { slots: [
    { startTime: "10:00", endTime: "11:00", enabled: true, budgetPercentage: 10 },
    { startTime: "11:00", endTime: "12:00", enabled: true, budgetPercentage: 0 },
  ] } };
  const h = harness({ rules: [rule], rows: { SP: [campaign] } });
  h.sandbox.getActiveSlot = (slots, hour) => slots.find(slot => Number(slot.startTime.split(":")[0]) === hour);
  await h.api.executeBudgetRulesForProfile(profile, scheduledFor);
  await h.api.executeBudgetRulesForProfile(profile, new Date("2026-11-03T05:30:00Z"));
  assert.equal(h.records.length, 2);
  assert(h.records.every(record => record.isRun));
  assert.equal(h.sends[0].updates[0].context.calculatedBudget, 110);
  assert.equal(h.sends[1].updates[0].context.calculatedBudget, 100);
});

test("a sibling rule failure waits for remaining slot work before returning", async () => {
  let release, slowFinished = false, returned = false;
  const wait = new Promise(resolve => { release = resolve; });
  const h = harness({ rules: [{ ...baseRule, _id: "fail" }, { ...baseRule, _id: "slow" }] });
  h.sandbox.getTypeBasedRuleData = async (rule, type) => {
    if (rule._id === "fail") throw new Error("fixture failed rule");
    if (type === "SP") { await wait; slowFinished = true; }
    return [];
  };
  const run = h.api.executeBudgetRulesForProfile(profile, scheduledFor).finally(() => { returned = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, false);
  release();
  await assert.rejects(run, /fixture failed rule/);
  assert.equal(slowFinished, true);
  assert.equal(h.records.find(record => record.ruleId === "fail").slotState, "RECOVERY_REQUIRED");
  assert.equal(h.records.find(record => record.ruleId === "slow").slotState, "COMPLETED");
});
