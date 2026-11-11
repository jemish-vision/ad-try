const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const sift = require("sift").default;

const configId = "69809498df1b0ea4ae334fc5";
const profileId = 123;
const today = "2026-11-04";
const fixedNow = "2026-11-04T12:00:00Z";
const conditions = [{ conditionType: "OutOfBudget", oobDays: 3 }];
const baseRule = {
  _id: "69809498df1b0ea4ae334fc6", configId, profileId, timezone: "UTC",
  gridName: "Campaign", reportDate: "LAST_7_DAYS", conditions, actions: [],
};
const campaign = (campaignId, reportDate = today, extra = {}) => ({
  configId, profileId, campaignId, reportDate, status: "ENABLED",
  campaignStatus: "ENABLED", budget: 100, spend: 10, ...extra,
});

function fixture({ campaigns = [], helper = {}, rule = baseRule, reportRows = [] } = {}) {
  const calls = [];
  function fixedMoment(...args) { return args.length ? moment(...args) : moment(fixedNow); }
  Object.assign(fixedMoment, moment);
  fixedMoment.tz = (...args) => args.length === 1 ? moment(fixedNow).tz(args[0]) : moment.tz(...args);
  const campaignModel = {
    find(filter) {
      calls.push({ method: "find", filter });
      const rows = campaigns.filter(sift(filter));
      const query = {
        sort(sort) {
          rows.sort((a, b) => {
            for (const [field, direction] of Object.entries(sort)) {
              if (a[field] < b[field]) return -direction;
              if (a[field] > b[field]) return direction;
            }
            return 0;
          });
          return query;
        },
        lean: async () => rows,
      };
      return query;
    },
    aggregate(pipeline) {
      calls.push({ method: "aggregate", pipeline });
      if (!pipeline.some(stage => stage.$replaceRoot)) {
        const output = pipeline.some(stage => stage.$facet)
          ? [{ data: reportRows, newCount: [{ count: reportRows.filter(row => row.isNew).length }] }]
          : reportRows;
        const result = {
          allowDiskUse() { return result; },
          then(resolve, reject) { return Promise.resolve(output).then(resolve, reject); },
          cursor() {
            return { async *[Symbol.asyncIterator]() { yield* reportRows; }, async close() {} };
          },
        };
        return result;
      }
      const filter = pipeline.find(stage => stage.$match)?.$match || {};
      const rows = campaigns.filter(sift(filter)).sort((a, b) =>
        b.reportDate.localeCompare(a.reportDate) || +new Date(b.updatedAt || 0) - +new Date(a.updatedAt || 0));
      const latest = new Map();
      for (const row of rows) if (!latest.has(Number(row.campaignId))) latest.set(Number(row.campaignId), row);
      const result = {
        allowDiskUse() { return result; },
        then(resolve, reject) { return Promise.resolve([...latest.values()]).then(resolve, reject); },
      };
      return result;
    },
  };
  const mockedRequire = name => {
    if (name === "moment") return fixedMoment;
    if (name === "mongoose") return mongoose;
    if (name === "p-limit") return { default: () => callback => callback() };
    if (name === "../helper/common") return {
      getRuleDate: () => ({ fromDate: "2026-10-28", toDate: "2026-11-03" }),
      safeJsonParse: value => typeof value === "string" ? JSON.parse(value) : value,
    };
    if (name === "../models/recomandationRules.model") return { findOne: () => ({ lean: async () => rule }) };
    if (name === "../models/recommandationStatus.model") return { exists: async () => false, bulkWrite: async () => ({}) };
    if (name.includes("logger")) return { recommendation_logs: () => {} };
    if (name === "../helper/targetingMetricsPipeline") return require("../api-server/helper/targetingMetricsPipeline");
    if (name === "../helper/sanitizeQuery") return require("../api-server/helper/sanitizeQuery");
    if (name === "../helper/adTypeCollections") return { SP: { campaign: "campaigns", adGroup: "adgroups" } };
    if (/BudgetHistory/i.test(name)) return {
      getCampaignBudgetHistoryDays: async () => new Map(),
      getLatestCampaignBudgetEvents: async () => new Map(),
      ...helper,
    };
    return {};
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return +new Date(fixedNow); }
  }
  const context = { exports: {}, require: mockedRequire, process, console, Date: FixedDate };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api-server/controllers/recommendation.controller.js"), "utf8"), context);
  return {
    api: context.exports, calls, campaignModel,
    eligible: rule => context.exports.getOutOfBudgetCampaignMap({
      configId, profileId, rule: { ...baseRule, ...rule }, adType: "SP", adTypeCampaignSchema: campaignModel,
    }),
  };
}

function firstMatch(pipeline) { return pipeline.find(stage => stage.$match)?.$match; }
function constantExpression(value) {
  if (value === null || typeof value !== "object") {
    assert.ok(typeof value !== "string" || !value.startsWith("$"), "Qualified result must not depend on current campaign fields");
    return value;
  }
  if ("$literal" in value) return value.$literal;
  if (value.$cond) return constantExpression(value.$cond[constantExpression(value.$cond[0]) ? 1 : 2]);
  assert.fail("Qualified result must be independent of current campaign fields");
}

const historyDays = values => new Map(Object.entries(values).map(([id, days]) => [id, new Map(Object.entries(days))]));
const allDays = { "2026-11-01": true, "2026-11-02": true, "2026-11-03": true };
const eligibleIds = result => [...result.oobCampIds].sort((a, b) => a - b);

test("all completed dates must qualify and history-only campaigns use current metadata", async () => {
  const { eligible } = fixture({
    campaigns: [campaign(1), campaign(2), campaign(3)],
    helper: { getCampaignBudgetHistoryDays: async () => historyDays({
      1: allDays, 2: { ...allDays, "2026-11-02": false }, 3: { "2026-11-01": true, "2026-11-03": true },
    }) },
  });
  assert.deepEqual(eligibleIds(await eligible()), [1]);
});

test("recoveries and missing exhaustion events cannot qualify through stale daily snapshots", async () => {
  const snapshots = ["2026-11-01", "2026-11-02", "2026-11-03"].flatMap(date =>
    [campaign(1, date, { budgetTracking: { lastUsagePercentage: 100 } }),
      campaign(2, date, { budgetTracking: { lastUsagePercentage: 100 } })]);
  const { eligible } = fixture({
    campaigns: [campaign(1), campaign(2), ...snapshots],
    helper: { getCampaignBudgetHistoryDays: async () => historyDays({ 1: { ...allDays, "2026-11-02": false } }) },
  });
  assert.deepEqual(eligibleIds(await eligible()), []);
});

test("a two-day rule excludes a midnight recovery without a new exhaustion that day", async () => {
  const { buildCampaignBudgetHistoryDays } = require("../api-server/services/outOfBudgetHistory.service");
  const events = [
    { changeLevel: 1, createdAt: "2026-11-02T08:00:00Z", oldValue: "IN_BUDGET", newValue: "OUT_OF_BUDGET" },
    { changeLevel: 1, createdAt: "2026-11-02T18:35:00Z", oldValue: "OUT_OF_BUDGET", newValue: "IN_BUDGET" },
    { changeLevel: 2, createdAt: "2026-11-02T08:00:00Z", oldValue: "IN_BUDGET", newValue: "OUT_OF_BUDGET" },
    { changeLevel: 2, createdAt: "2026-11-03T08:00:00Z", oldValue: "IN_BUDGET", newValue: "OUT_OF_BUDGET" },
  ];
  const { eligible } = fixture({
    campaigns: [campaign(1), campaign(2)],
    helper: { getCampaignBudgetHistoryDays: async params =>
      buildCampaignBudgetHistoryDays({ ...params, events }) },
  });
  assert.deepEqual(eligibleIds(await eligible({
    conditions: [{ conditionType: "Out of Budget", oobPeriod: "CUSTOM", oobDays: 2 }],
  })), [2]);
});

test("current archived status excludes otherwise historically eligible campaigns", async () => {
  const { eligible } = fixture({
    campaigns: [campaign(1), campaign(2, today, { status: "ARCHIVED" }),
      campaign(2, "2026-11-03", { status: "ENABLED" })],
    helper: { getCampaignBudgetHistoryDays: async () => historyDays({ 1: allDays, 2: allDays }) },
  });
  assert.deepEqual(eligibleIds(await eligible()), [1]);
});

test("historical eligibility normalizes IDs and applies INCLUDE or EXCLUDE without broadening", async () => {
  const { eligible } = fixture({
    campaigns: [campaign("1"), campaign(2), campaign(3)],
    helper: { getCampaignBudgetHistoryDays: async () => historyDays({ 1: allDays, 2: allDays }) },
  });
  assert.deepEqual(eligibleIds(await eligible({ campaignSelectionType: "INCLUDE", campaignIds: { SP: ["1", "3"] } })), [1]);
  assert.deepEqual(eligibleIds(await eligible({ campaignSelectionType: "EXCLUDE", campaignIds: { SP: ["1"] } })), [2]);
  assert.deepEqual(eligibleIds(await eligible({ campaignSelectionType: "INCLUDE", campaignIds: { SP: [] } })), []);
});

test("current eligibility trusts latest history over stale usage and implements EXCLUDE", async () => {
  const { eligible } = fixture({
    campaigns: [campaign(1, today, { budgetTracking: { lastUsagePercentage: 100 } }),
      campaign("2", today, { budgetTracking: { lastUsagePercentage: 100 } }),
      campaign(3, today, { budgetTracking: { lastUsagePercentage: 100 } })],
    helper: { getLatestCampaignBudgetEvents: async () => new Map([
      ["1", { outOfBudget: false, createdAt: fixedNow }],
      ["2", { outOfBudget: true, createdAt: fixedNow }],
      ["3", { outOfBudget: true, createdAt: fixedNow }],
    ]) },
  });
  const current = { conditions: [{ conditionType: "OutOfBudget" }] };
  assert.deepEqual(eligibleIds(await eligible(current)), [2, 3]);
  assert.deepEqual(eligibleIds(await eligible({ ...current, campaignSelectionType: "EXCLUDE", campaignIds: { SP: ["3"] } })), [2]);
});

test("newer current tracking overrides an old OUT_OF_BUDGET event", async () => {
  const { eligible } = fixture({
    campaigns: [campaign(1, today, { budgetTracking: { lastUsagePercentage: 20, lastUpdated: "2026-11-04T11:00:00Z" } })],
    helper: { getLatestCampaignBudgetEvents: async () => new Map([
      ["1", { outOfBudget: true, createdAt: "2026-11-03T15:00:00Z" }],
    ]) },
  });
  assert.deepEqual(eligibleIds(await eligible({ conditions: [{ conditionType: "OutOfBudget" }] })), []);
});

test("pipeline selection intersects prequalified campaign IDs", () => {
  const { api } = fixture();
  for (const [selection, ids, expected] of [
    ["INCLUDE", [1, 3], [1]], ["EXCLUDE", [1], [2]], ["INCLUDE", [], []],
  ]) {
    const pipeline = api.recommendationPipeline(
      { configId, profileId, campaignId: { $in: [1, 2] } }, "2026-11-03",
      { ...baseRule, campaignSelectionType: selection, campaignIds: { SP: ids } }, "SP",
      { outOfBudgetQualified: true });
    const match = firstMatch(pipeline);
    assert.deepEqual([1, 2, 3, 4].filter(id => sift(match)({ configId: new mongoose.Types.ObjectId(configId), profileId, campaignId: id })), expected);
  }
});

test("historical qualification bypasses current OOB eligibility and retains OOB label", () => {
  const { api } = fixture();
  const pipeline = api.recommendationPipeline(
    { configId, profileId, campaignId: { $in: [1] } }, "2026-11-03", baseRule, "SP",
    { outOfBudgetQualified: true });
  const qualificationMatches = pipeline.filter(stage => stage.$match &&
    JSON.stringify(stage.$match).includes("lastUsagePercentage"));
  assert.equal(qualificationMatches.length, 0);
  const projection = pipeline.findLast(stage => stage.$project)?.$project;
  assert.ok(projection);
  assert.equal(constantExpression(projection.isOutOfBudget), true);
  assert.equal(constantExpression(projection.campaignStatus), "OUT_OF_BUDGET");
});

test("Campaign and Placement export and streaming paths carry historical qualification", async () => {
  for (const gridName of ["Campaign", "Placement"]) {
    const f = fixture({
      rule: { ...baseRule, gridName },
      campaigns: [campaign(1)],
      reportRows: [{ campaignId: 1, isNew: true }],
      helper: { getCampaignBudgetHistoryDays: async () => historyDays({ 1: allDays }) },
    });
    const pipelineOptions = [];
    const actualPipeline = f.api.recommendationPipeline;
    f.api.recommendationPipeline = (...args) => {
      pipelineOptions.push(args[4]);
      return actualPipeline(...args);
    };
    const args = {
      configId, profileId, ruleId: baseRule._id, adType: "SP",
      models: { adTypeCampaignSchema: f.campaignModel, adTypePlacementSchema: f.campaignModel },
    };
    let response;
    const res = { status() { return res; }, send(body) { response = body; return res; } };
    await f.api.getRecommendationData({
      config: { configId }, body: { profileId }, params: { ruleId: baseRule._id },
      query: {}, adType: "SP", models: args.models,
    }, res);
    assert.equal(response.isSuccess, true, gridName + " modal request succeeds");
    assert.equal(response.data.length, 1);
    assert.equal((await f.api.fetchRecommendationData(args)).data.length, 1);
    const batches = [];
    const streamed = await f.api.fetchRecommendationData({ ...args, onBatch: async rows => batches.push(...rows) });
    assert.equal(streamed.count, 1);
    assert.equal(batches.length, 1);
    assert.ok(pipelineOptions.every(options => options?.outOfBudgetQualified === true), gridName + " qualified data must retain eligibility");
  }
});

test("historical OOB conditions ignore legacy current-status query while retaining metric conditions", () => {
  const { api } = fixture();
  const legacyQuery = JSON.stringify({ status: { $in: ["OUT_OF_BUDGET", "out_of_budget"] } });
  const earlyMatches = rule => {
    const pipeline = api.recommendationPipeline(
      { configId, profileId, campaignId: { $in: [1] } }, "2026-11-03",
      rule, "SP", { outOfBudgetQualified: true });
    return pipeline.slice(0, pipeline.findIndex(stage => stage.$lookup)).filter(stage => stage.$match);
  };
  const qualifiedRule = { ...baseRule, query: legacyQuery };
  const oobOnly = earlyMatches(qualifiedRule);
  assert.ok(!oobOnly.some(stage => JSON.stringify(stage.$match).includes("OUT_OF_BUDGET")));
  assert.ok(oobOnly.every(stage => !stage.$match.status));

  const mixed = earlyMatches({
    ...qualifiedRule,
    conditions: [...conditions, { conditionType: "ACOS", conditionOperator: "GREATER_THAN_OR_EQUAL_TO", conditionValue: "30" }],
  });
  const metricMatch = mixed.find(stage => stage.$match.acos)?.$match;
  assert.ok(metricMatch);
  assert.equal(sift(metricMatch)({ acos: 29 }), false);
  assert.equal(sift(metricMatch)({ acos: 30 }), true);
  assert.ok(!mixed.some(stage => stage.$match.status));

  const ordinary = earlyMatches({
    ...baseRule, conditions: [], query: JSON.stringify({ spend: { $gt: 50 } }),
  });
  const savedMatch = ordinary.find(stage => stage.$match.spend)?.$match;
  assert.ok(savedMatch);
  assert.equal(sift(savedMatch)({ spend: 49 }), false);
  assert.equal(sift(savedMatch)({ spend: 51 }), true);
});
