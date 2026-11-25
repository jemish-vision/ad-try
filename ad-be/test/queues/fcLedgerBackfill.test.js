const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs, planBackfill, executeBackfill } = require("../../scripts/backfill-fc-inventory-ledger");

const configId = "111111111111111111111111";
const dates = ["2026-11-15", "2026-11-16", "2026-11-17"];
const profile = { configId, profileId: 123, timezone: "Asia/Kolkata", marketplaceStringId: "market", isActive: true, isSpSyncEnabled: true };
const flags = ["--env-file=fixture.env", `--config=${configId}`, "--profiles=123,124,123", "--start=2026-11-15", "--end=2026-11-17"];

test("backfill defaults to a read-only plan and requires bounded explicit dates and account scope", () => {
  assert.deepEqual(parseArgs(flags), { envFile: "fixture.env", configId, profileIds: [123, 124], dates, execute: false });
  assert.equal(parseArgs([...flags, "--execute"]).execute, true);
  for (const input of [
    flags.slice(1), flags.filter(flag => !flag.startsWith("--profiles=")),
    flags.map(flag => flag.startsWith("--profiles=") ? "--profiles=9007199254740993" : flag),
    [...flags.slice(0, -2), "--start=2026-02-29", "--end=2026-03-01"],
    [...flags.slice(0, -1), "--end=2026-11-14"],
    [...flags.slice(0, -1), "--end=2026-12-16"],
  ]) {
    assert.throws(() => parseArgs(input), { code: "INVALID_BACKFILL_INPUT" });
  }
});

test("plan checks each exact date and retries a partially imported day whose backfill failed", async () => {
  const reads = [];
  const db = { collection: collection => ({
    async findOne(filter) {
      reads.push({ collection, filter });
      if (collection === "profiles") return profile;
      if (collection === "reports") return filter.startDate === dates[1] ? { status: "FAILED" } : null;
      return { _id: 1 };
    },
    async countDocuments(filter) {
      reads.push({ collection, filter });
      return filter.reportDate === dates[2] ? 0 : 12;
    },
  }) };
  const plan = await planBackfill(db, { configId, profileIds: [profile.profileId], dates }, new Date("2026-11-18T06:00:00Z"));
  assert.deepEqual(plan.map(({ date, rowsBefore, status }) => [date, rowsBefore, status]), [
    [dates[0], 12, "already_present"], [dates[1], 12, "planned"], [dates[2], 0, "planned"],
  ]);
  assert.deepEqual(reads.filter(read => read.collection === "fcinventoryledgers").map(({ filter }) => filter),
    dates.map(reportDate => ({ configId, profileId: 123, reportDate })));
  assert.ok(reads.some(({ collection, filter }) => collection === "synchronizedetails"
    && filter.requestStatus === "COMPLETED" && filter.groupId === "SELLER_CATALOG" && filter.type === "seller"));
  assert.ok(reads.some(({ collection, filter }) => collection === "reports" && filter.startDate === dates[1]
    && filter.endDate === dates[1] && filter.reportName === "FC_INVENTORY_LEDGER_BACKFILL"));
});

test("plan rejects a non-approved account and rejects today in the selected profile's timezone", async () => {
  const db = { collection: name => ({
    findOne: async () => {
      if (name === "profiles") return profile;
      return name === "synchronizedetails" ? null : { _id: 1 };
    },
  }) };
  const input = { configId, profileIds: [profile.profileId], dates };
  await assert.rejects(planBackfill(db, input), /completed Seller Catalog approval/);
  const approvedDb = { collection: name => ({ findOne: async () => name === "profiles" ? profile : { _id: 1 } }) };
  await assert.rejects(planBackfill(approvedDb, input, new Date("2026-11-16T20:00:00Z")), /completed days only/);
});

test("execution polls pending work in passes, verifies exact dates and distinguishes zero-data completion", async () => {
  const plan = [
    { profile, date: dates[0], rowsBefore: 4, rowsAfter: 4, status: "already_present" },
    { profile, date: dates[1], rowsBefore: 0, rowsAfter: 0, status: "planned" },
    { profile, date: dates[2], rowsBefore: 0, rowsAfter: 0, status: "planned" },
    { profile: { ...profile, profileId: 124 }, date: dates[2], rowsBefore: 0, rowsAfter: 0, status: "planned" },
  ];
  const calls = [];
  const checks = [];
  const waits = [];
  const results = await executeBackfill(plan, {
    async runDay(p, day) {
      calls.push([p.profileId, day]);
      if (p.profileId === 124) return "PENDING";
      if (day === dates[2]) return "COMPLETED";
      return calls.filter(([, date]) => date === day).length === 1 ? "PENDING" : "COMPLETED";
    },
    async countDayRows(p, day) {
      checks.push([p.profileId, day]);
      return p.profileId === 123 && day === dates[1] && calls.filter(([, date]) => date === day).length === 2 ? 8 : 0;
    },
    wait: async delay => { waits.push(delay); },
    maxPasses: 2,
    pollMs: 25,
  });
  assert.deepEqual(calls, [[123, dates[1]], [123, dates[2]], [124, dates[2]], [123, dates[1]], [124, dates[2]]]);
  assert.deepEqual(checks, calls);
  assert.deepEqual(waits, [25]);
  assert.deepEqual(results.map(({ status, rowsAfter, attempts }) => [status, rowsAfter, attempts]), [
    ["already_present", 4, undefined], ["verified", 8, 2], ["completed_without_rows", 0, 1], ["pending", 0, 2],
  ]);
  assert.equal(plan[1].status, "planned");
});

test("execution reads the stored date even if the import throws after a partial write", async () => {
  const plan = [{ profile, date: dates[0], rowsBefore: 0, rowsAfter: 0, status: "planned" }];
  const [result] = await executeBackfill(plan, {
    runDay: async () => { throw new Error("fixture partial write"); },
    countDayRows: async (checkedProfile, date) => {
      assert.deepEqual(checkedProfile, profile);
      assert.equal(date, dates[0]);
      return 2;
    },
  });
  assert.deepEqual({ rowsAfter: result.rowsAfter, status: result.status }, { rowsAfter: 2, status: "failed" });
});
