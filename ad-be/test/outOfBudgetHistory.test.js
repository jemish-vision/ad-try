const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBudgetState, buildCampaignBudgetHistoryDays, getCampaignBudgetHistoryDays,
  getLatestCampaignBudgetEvents, getLatestCampaignBudgetStates } = require("../api-server/services/outOfBudgetHistory.service");

const scope = { configId: "000000000000000000000001", profileId: 123, adType: "SP", campaignIds: [55] };
const window = { fromDate: "2026-11-01", toDate: "2026-11-03", timezone: "Asia/Kolkata" };
const event = (createdAt, oldValue, newValue, extra = {}) => ({
  configId: scope.configId, profileId: scope.profileId, type: "SP", changeLevel: 55,
  changeType: "Update Campaign Budget Status", createdAt: new Date(createdAt), oldValue, newValue, ...extra,
});
const days = input => Object.fromEntries(buildCampaignBudgetHistoryDays({ ...window, ...input }).get("55") || []);

test("boolean IN_BUDGET values and explicit budget states normalize consistently", () => {
  for (const value of [true, "true", "TRUE", "IN_BUDGET", " in_budget "]) assert.equal(normalizeBudgetState(value), false);
  for (const value of [false, "false", "FALSE", "OUT_OF_BUDGET"]) assert.equal(normalizeBudgetState(value), true);
  for (const value of [null, undefined, "", "ENABLED", "PAUSED", "—"]) assert.equal(normalizeBudgetState(value), null);
});

test("an OUT to IN recovery does not qualify its event day", () => {
  assert.deepEqual(days({ events: [event("2026-11-02T06:00:00Z", false, true)] }), {
    "2026-11-02": false,
  });
});

test("pre-window exhaustion cannot qualify later days through carry-over", () => {
  assert.deepEqual(days({
    previousEvents: [event("2026-10-30T00:00:00Z", true, false)],
    events: [event("2026-11-02T06:00:00Z", false, true)],
  }), { "2026-11-02": false });
});

test("explicit IN observations provide negative evidence against stale current snapshots", () => {
  assert.deepEqual(days({ events: [event("2026-11-01T06:00:00Z", true, true)] }), {
    "2026-11-01": false,
  });
});

test("midnight recovery never marks the new day OOB from its old state", () => {
  assert.deepEqual(days({
    previousEvents: [event("2026-10-30T00:00:00Z", true, false)],
    events: [event("2026-11-01T18:30:00Z", false, true)],
  }), { "2026-11-02": false });
});

test("out then recovered on one day remains OOB for that day", () => {
  assert.deepEqual(days({ events: [
    event("2026-11-01T02:00:00Z", true, false),
    event("2026-11-01T12:00:00Z", false, true),
  ] }), { "2026-11-01": true });
});

test("a fresh exhaustion is required on each local day despite overnight recovery", () => {
  assert.deepEqual(days({ fromDate: "2026-11-02", toDate: "2026-11-03", events: [
    event("2026-11-02T08:34:56Z", "IN_BUDGET", "OUT_OF_BUDGET"),
    event("2026-11-02T18:35:00Z", "OUT_OF_BUDGET", "IN_BUDGET"),
  ] }), { "2026-11-02": true, "2026-11-03": false });
  assert.deepEqual(days({ fromDate: "2026-11-02", toDate: "2026-11-03", events: [
    event("2026-11-02T08:34:56Z", "IN_BUDGET", "OUT_OF_BUDGET"),
    event("2026-11-02T18:35:00Z", "OUT_OF_BUDGET", "IN_BUDGET"),
    event("2026-11-03T07:43:32Z", "IN_BUDGET", "OUT_OF_BUDGET"),
  ] }), { "2026-11-02": true, "2026-11-03": true });
});

test("duplicate observations and unchanged OUT state cannot create another exhaustion", () => {
  assert.deepEqual(days({ events: [
    event("2026-11-01T02:00:00Z", "IN_BUDGET", "OUT_OF_BUDGET"),
    event("2026-11-01T02:00:01Z", "IN_BUDGET", "OUT_OF_BUDGET"),
    event("2026-11-02T02:00:00Z", "OUT_OF_BUDGET", "OUT_OF_BUDGET"),
    event("2026-11-03T02:00:00Z", "—", "OUT_OF_BUDGET"),
  ] }), { "2026-11-01": true, "2026-11-02": false });
});

test("exhaustion exactly at midnight qualifies the new local day", () => {
  assert.deepEqual(days({ events: [
    event("2026-11-01T18:30:00Z", "IN_BUDGET", "OUT_OF_BUDGET"),
  ] }), { "2026-11-02": true });
});

test("unknown and invalid events do not fabricate positive evidence", () => {
  assert.deepEqual(days({ events: [
    event("2026-11-02T12:00:00Z", "—", "ENABLED"),
    event("invalid", false, false),
    event("2026-11-04T00:00:00Z", false, false),
  ] }), {});
});

function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date) && key !== "configId") {
      return Object.entries(value).every(([operator, operand]) =>
        operator === "$in" ? operand.map(String).includes(String(row[key]))
          : operator === "$gte" ? +row[key] >= +operand : operator === "$lt" ? +row[key] < +operand
            : operator === "$lte" ? +row[key] <= +operand : false);
    }
    return String(row[key]) === String(value);
  });
}

function modelFor(rows) {
  const queries = [];
  return {
    queries,
    find(query) {
      queries.push(query);
      return { select() { return this; }, sort() { return this; }, lean: async () => rows.filter(row => matches(row, query)) };
    },
    aggregate(pipeline) {
      const query = pipeline[0].$match;
      queries.push(query);
      const sorted = rows.filter(row => matches(row, query)).sort((a, b) => +b.createdAt - +a.createdAt);
      const latest = new Map();
      for (const row of sorted) {
        if (!latest.has(row.changeLevel)) latest.set(row.changeLevel, { events: [row] });
        else if (+latest.get(row.changeLevel).events[0].createdAt === +row.createdAt) latest.get(row.changeLevel).events.push(row);
      }
      return { allowDiskUse: async () => [...latest.values()] };
    },
  };
}

test("database queries strictly isolate account, profile, product, campaign and budget dimension", async () => {
  const model = modelFor([
    event("2026-11-01T02:00:00Z", true, true),
    ...[
      { configId: "000000000000000000000002" }, { profileId: 999 }, { type: "SB" }, { changeLevel: 66 },
      { changeType: "Update Campaign Status" },
    ].map(extra => event("2026-11-01T03:00:00Z", true, false, extra)),
  ]);
  const result = await getCampaignBudgetHistoryDays({ ...scope, ...window }, { historyModel: model });
  assert.deepEqual(Object.fromEntries(result.get("55")), {
    "2026-11-01": false,
  });
  assert.equal(result.size, 1);
  assert(model.queries.every(query => query.changeType === "Update Campaign Budget Status"));
});

for (const [day, hours] of [["2026-03-08", 23], ["2026-11-01", 25]]) test("local day DST query spans " + hours + " hours", async () => {
  const model = modelFor([]);
  await getCampaignBudgetHistoryDays({ ...scope, fromDate: day, toDate: day, timezone: "America/New_York" }, { historyModel: model });
  const range = model.queries.find(query => query.createdAt.$gte).createdAt;
  assert.equal((+range.$lt - +range.$gte) / 3600000, hours);
});

test("latest current budget status distinguishes recovery from historical OOB days", async () => {
  const model = modelFor([
    event("2026-11-03T01:00:00Z", true, false),
    event("2026-11-04T01:00:00Z", false, true),
    event("2026-11-05T01:00:00Z", true, false),
  ]);
  const current = await getLatestCampaignBudgetStates(scope, { historyModel: model, now: new Date("2026-11-04T02:00:00Z") });
  assert.equal(current.get("55"), false);
  const historical = await getCampaignBudgetHistoryDays({ ...scope, ...window }, { historyModel: model });
  assert.equal(historical.get("55").get("2026-11-03"), true);
});

test("latest current event retains source timestamp for recency comparison", async () => {
  const timestamp = new Date("2026-10-03T01:00:00Z");
  const model = modelFor([event(timestamp, true, false)]);
  const latest = await getLatestCampaignBudgetEvents(scope, { historyModel: model, now: new Date("2026-11-04T02:00:00Z") });
  assert.equal(latest.get("55").outOfBudget, true);
  assert.equal(+latest.get("55").createdAt, +timestamp);
});

test("an unknown latest observation leaves current budget state unknown", async () => {
  const model = modelFor([
    event("2026-11-03T01:00:00Z", true, false),
    event("2026-11-04T01:00:00Z", false, "unrecognized"),
  ]);
  const latest = await getLatestCampaignBudgetEvents(scope, { historyModel: model, now: new Date("2026-11-04T02:00:00Z") });
  assert.equal(latest.has("55"), false);
});

test("opposite same-time transitions preserve the event day and leave later carry unknown in either order", () => {
  const rows = [
    event("2026-11-01T06:00:00Z", "IN_BUDGET", "OUT_OF_BUDGET"),
    event("2026-11-01T06:00:00Z", "OUT_OF_BUDGET", "IN_BUDGET"),
  ];
  for (const events of [rows, [...rows].reverse()]) assert.deepEqual(days({ events }), { "2026-11-01": true });
});

test("recovery at window-end midnight does not prove a new exhaustion on the preceding day", async () => {
  const model = modelFor([event("2026-11-03T18:30:00Z", "OUT_OF_BUDGET", "IN_BUDGET")]);
  const historical = await getCampaignBudgetHistoryDays({ ...scope, ...window }, { historyModel: model });
  assert.equal(historical.has("55"), false);
  assert.deepEqual(days({ fromDate: "2026-11-03", toDate: "2026-11-03",
    events: [event("2026-11-03T18:30:00Z", false, true)] }), {});
});

test("becoming OOB at the next midnight does not invent an OOB previous day", () => {
  assert.deepEqual(days({ fromDate: "2026-11-03", toDate: "2026-11-03",
    events: [event("2026-11-03T18:30:00Z", "IN_BUDGET", "OUT_OF_BUDGET")] }), {});
});

test("conflicting latest pre-window observations do not manufacture carried days", async () => {
  const model = modelFor([
    event("2026-10-31T06:00:00Z", "IN_BUDGET", "OUT_OF_BUDGET"),
    event("2026-10-31T06:00:00Z", "OUT_OF_BUDGET", "IN_BUDGET"),
  ]);
  const historical = await getCampaignBudgetHistoryDays({ ...scope, ...window }, { historyModel: model });
  assert.equal(historical.has("55"), false);
  const current = await getLatestCampaignBudgetEvents(scope, { historyModel: model });
  assert.equal(current.has("55"), false);
});

test("duplicate API and stream observations agree and preserve known state", async () => {
  const model = modelFor([
    event("2026-10-31T06:00:00Z", true, false, { source: "AMAZON_API" }),
    event("2026-10-31T06:00:00Z", true, false, { source: "AMAZON_SQS" }),
  ]);
  const historical = await getCampaignBudgetHistoryDays({ ...scope, ...window }, { historyModel: model });
  assert.equal(historical.has("55"), false);
  assert.equal((await getLatestCampaignBudgetEvents(scope, { historyModel: model })).get("55").outOfBudget, true);
});

test("unknown same-time duplicate does not erase an explicit known observation", async () => {
  const model = modelFor([
    event("2026-10-31T06:00:00Z", true, "unknown"),
    event("2026-10-31T06:00:00Z", true, false),
  ]);
  assert.equal((await getLatestCampaignBudgetEvents(scope, { historyModel: model })).get("55").outOfBudget, true);
});

test("invalid scope or window fails before querying data", async () => {
  for (const change of [{ configId: null }, { profileId: null }, { adType: "All" }, { campaignIds: ["invalid"] },
    { timezone: "invalid" }, { fromDate: "2026-11-04" }, { toDate: "2026-02-30" }]) {
    const model = modelFor([]);
    await assert.rejects(getCampaignBudgetHistoryDays({ ...scope, ...window, ...change }, { historyModel: model }));
    assert.equal(model.queries.length, 0);
  }
});

test("history read failures propagate and cannot silently trigger snapshot fallback", async () => {
  const model = modelFor([]);
  model.find = () => ({ select() { return this; }, lean: async () => { throw new Error("history unavailable"); } });
  await assert.rejects(getCampaignBudgetHistoryDays({ ...scope, ...window }, { historyModel: model }), /history unavailable/);
});
