const { test, describe } = require("node:test");
const assert = require("node:assert");
const moment = require("moment-timezone");
const { getTargetingRuleDate } = require("../../../api-server/helper/targetingRuleDate");

const at = (iso, tz = "UTC") => moment.tz(iso, tz);
const FALLBACK = { fromDate: "FB", toDate: "FB" };

describe("Transformers: getTargetingRuleDate", () => {
  test("YESTERDAY is one day back for both dates", () => {
    assert.deepStrictEqual(getTargetingRuleDate(at("2026-03-01T10:00"), "YESTERDAY", FALLBACK), {
      fromDate: "2026-02-28",
      toDate: "2026-02-28",
    });
  });

  test("rolling presets are completed days only (end at yesterday, never today)", () => {
    const r = getTargetingRuleDate(at("2026-03-01T10:00"), "LAST_7_DAYS", FALLBACK);
    assert.deepStrictEqual(r, { fromDate: "2026-02-22", toDate: "2026-02-28" });
  });

  test("LAST_14_DAYS and LAST_30_DAYS", () => {
    assert.deepStrictEqual(getTargetingRuleDate(at("2026-03-15T10:00"), "LAST_14_DAYS", FALLBACK), {
      fromDate: "2026-03-01",
      toDate: "2026-03-14",
    });
    assert.deepStrictEqual(getTargetingRuleDate(at("2026-03-31T10:00"), "LAST_30_DAYS", FALLBACK), {
      fromDate: "2026-03-01",
      toDate: "2026-03-30",
    });
  });

  test("non-preset LAST_N_DAYS includes today (N days ending today)", () => {
    assert.deepStrictEqual(getTargetingRuleDate(at("2026-03-01T10:00"), "LAST_3_DAYS", FALLBACK), {
      fromDate: "2026-02-27",
      toDate: "2026-03-01",
    });
  });

  test("non-preset LAST_N_DAYS_1 ends yesterday", () => {
    assert.deepStrictEqual(getTargetingRuleDate(at("2026-03-01T10:00"), "LAST_3_DAYS_1", FALLBACK), {
      fromDate: "2026-02-26",
      toDate: "2026-02-28",
    });
  });

  test("LAST_1_DAYS is a single day (today)", () => {
    assert.deepStrictEqual(getTargetingRuleDate(at("2026-03-01T10:00"), "LAST_1_DAYS", FALLBACK), {
      fromDate: "2026-03-01",
      toDate: "2026-03-01",
    });
  });

  test("returns the fallback for unknown, zero, empty and missing filters", () => {
    for (const f of ["CUSTOM", "LAST_0_DAYS", "", undefined, null, "last_7_days", "LAST_X_DAYS"]) {
      assert.strictEqual(getTargetingRuleDate(at("2026-03-01T10:00"), f, FALLBACK), FALLBACK, String(f));
    }
  });

  test("does not mutate the moment passed in", () => {
    const now = at("2026-03-01T10:00");
    getTargetingRuleDate(now, "LAST_7_DAYS", FALLBACK);
    getTargetingRuleDate(now, "YESTERDAY", FALLBACK);
    assert.strictEqual(now.format("YYYY-MM-DD HH:mm"), "2026-03-01 10:00");
  });

  test("month, year and leap-day boundaries", () => {
    assert.strictEqual(getTargetingRuleDate(at("2026-01-01T10:00"), "YESTERDAY", FALLBACK).toDate, "2025-12-31");
    assert.strictEqual(getTargetingRuleDate(at("2028-03-01T10:00"), "YESTERDAY", FALLBACK).toDate, "2028-02-29");
    assert.strictEqual(getTargetingRuleDate(at("2027-03-01T10:00"), "YESTERDAY", FALLBACK).toDate, "2027-02-28");
    assert.deepStrictEqual(getTargetingRuleDate(at("2028-03-01T10:00"), "LAST_7_DAYS", FALLBACK), {
      fromDate: "2028-02-23",
      toDate: "2028-02-29",
    });
  });

  test("just after midnight still counts as the new day", () => {
    assert.strictEqual(getTargetingRuleDate(at("2026-03-02T00:00:01"), "YESTERDAY", FALLBACK).toDate, "2026-03-01");
    assert.strictEqual(getTargetingRuleDate(at("2026-03-01T23:59:59"), "YESTERDAY", FALLBACK).toDate, "2026-02-28");
  });

  test("same instant gives different dates in IST and Los Angeles", () => {
    const instant = "2026-10-29T20:00:00Z"; // IST: 30 Oct 01:30, LA: 29 Oct 13:00
    const ist = moment.tz(instant, "Asia/Kolkata");
    const la = moment.tz(instant, "America/Los_Angeles");
    assert.strictEqual(getTargetingRuleDate(ist, "YESTERDAY", FALLBACK).toDate, "2026-10-29");
    assert.strictEqual(getTargetingRuleDate(la, "YESTERDAY", FALLBACK).toDate, "2026-10-28");
  });

  test("DST change day: windows are calendar dates, not 24h blocks", () => {
    const now = moment.tz("2026-03-09T10:00", "America/Los_Angeles");
    assert.strictEqual(getTargetingRuleDate(now, "YESTERDAY", FALLBACK).toDate, "2026-03-08");
    assert.deepStrictEqual(getTargetingRuleDate(now, "LAST_7_DAYS", FALLBACK), {
      fromDate: "2026-03-02",
      toDate: "2026-03-08",
    });
  });
});
