const { test, describe, mock, afterEach } = require("node:test");
const assert = require("node:assert");
const {
  toMinuteBoundary,
  toHourBoundary,
  getBoundedLookbackHours,
  formatTimeBlock,
} = require("../../../queue-service/scheduler/timeBucket");

const iso = (d) => d.toISOString();

describe("Transformers: toMinuteBoundary / toHourBoundary", () => {
  test("minute boundary zeroes seconds and milliseconds", () => {
    assert.strictEqual(iso(toMinuteBoundary("2026-10-09T05:30:45.123Z")), "2026-10-09T05:30:00.000Z");
  });

  test("hour boundary zeroes minutes, seconds and milliseconds", () => {
    assert.strictEqual(iso(toHourBoundary("2026-10-09T05:59:59.999Z")), "2026-10-09T05:00:00.000Z");
  });

  test("a value already on the boundary is unchanged", () => {
    assert.strictEqual(iso(toMinuteBoundary("2026-10-09T05:30:00.000Z")), "2026-10-09T05:30:00.000Z");
    assert.strictEqual(iso(toHourBoundary("2026-10-09T05:00:00.000Z")), "2026-10-09T05:00:00.000Z");
  });

  test("one millisecond before the next minute stays in the same minute", () => {
    assert.strictEqual(iso(toMinuteBoundary("2026-10-09T05:30:59.999Z")), "2026-10-09T05:30:00.000Z");
  });

  test("uses UTC, so a +05:30 offset input is converted first", () => {
    // 05:30:45 IST == 00:00:45 UTC
    assert.strictEqual(iso(toMinuteBoundary("2026-10-09T05:30:45+05:30")), "2026-10-09T00:00:00.000Z");
    // 05:30 IST == 00:00 UTC, hour boundary is midnight UTC
    assert.strictEqual(iso(toHourBoundary("2026-10-09T05:30:00+05:30")), "2026-10-09T00:00:00.000Z");
  });

  test("midnight and year rollover", () => {
    assert.strictEqual(iso(toHourBoundary("2025-12-31T23:59:59.999Z")), "2025-12-31T23:00:00.000Z");
    assert.strictEqual(iso(toHourBoundary("2026-01-01T00:00:00.000Z")), "2026-01-01T00:00:00.000Z");
  });

  test("does not mutate a Date passed in", () => {
    const input = new Date("2026-10-09T05:30:45.123Z");
    toMinuteBoundary(input);
    toHourBoundary(input);
    assert.strictEqual(iso(input), "2026-10-09T05:30:45.123Z");
  });

  test("accepts a timestamp number", () => {
    const ms = Date.UTC(2026, 9, 9, 5, 30, 45, 500);
    assert.strictEqual(iso(toMinuteBoundary(ms)), "2026-10-09T05:30:00.000Z");
  });

  test("invalid input gives an Invalid Date instead of a wrong date", () => {
    assert.ok(Number.isNaN(toMinuteBoundary("not-a-date").getTime()));
    assert.ok(Number.isNaN(toHourBoundary("not-a-date").getTime()));
  });
});

describe("Transformers: getBoundedLookbackHours", () => {
  afterEach(() => mock.timers.reset());

  const freezeAt = (value) => mock.timers.enable({ apis: ["Date"], now: new Date(value).getTime() });

  test("returns the previous hours, oldest first, excluding the current hour", () => {
    freezeAt("2026-10-09T05:30:00.000Z");
    assert.deepStrictEqual(getBoundedLookbackHours(2).map(iso), ["2026-10-09T03:00:00.000Z", "2026-10-09T04:00:00.000Z"]);
  });

  test("default lookback is 2 hours", () => {
    freezeAt("2026-10-09T05:30:00.000Z");
    assert.strictEqual(getBoundedLookbackHours().length, 2);
  });

  test("lookback 0 returns an empty list", () => {
    freezeAt("2026-10-09T05:30:00.000Z");
    assert.deepStrictEqual(getBoundedLookbackHours(0), []);
  });

  test("crosses midnight and year boundary correctly", () => {
    freezeAt("2026-01-01T00:20:00.000Z");
    assert.deepStrictEqual(getBoundedLookbackHours(2).map(iso), ["2025-12-31T22:00:00.000Z", "2025-12-31T23:00:00.000Z"]);
  });

  test("exactly on the hour still excludes the current hour", () => {
    freezeAt("2026-10-09T05:00:00.000Z");
    assert.deepStrictEqual(getBoundedLookbackHours(1).map(iso), ["2026-10-09T04:00:00.000Z"]);
  });

  test("leap day crossing", () => {
    freezeAt("2028-03-01T00:30:00.000Z");
    assert.deepStrictEqual(getBoundedLookbackHours(1).map(iso), ["2028-02-29T23:00:00.000Z"]);
  });
});

describe("Transformers: formatTimeBlock", () => {
  test("minute (default), hour and day granularity", () => {
    const t = "2026-10-09T05:30:00.000Z";
    assert.strictEqual(formatTimeBlock(t), "20261009T0530Z");
    assert.strictEqual(formatTimeBlock(t, "minute"), "20261009T0530Z");
    assert.strictEqual(formatTimeBlock(t, "hour"), "20261009T05Z");
    assert.strictEqual(formatTimeBlock(t, "day"), "20261009");
  });

  test("zero-pads single digit month, day, hour and minute", () => {
    assert.strictEqual(formatTimeBlock("2026-01-02T03:04:00.000Z"), "20260102T0304Z");
  });

  test("is always UTC, regardless of the offset in the input", () => {
    // 2026-10-10 02:30 IST == 2026-10-09 21:00 UTC
    assert.strictEqual(formatTimeBlock("2026-10-10T02:30:00+05:30", "hour"), "20261009T21Z");
    assert.strictEqual(formatTimeBlock("2026-10-10T02:30:00+05:30", "day"), "20261009");
  });

  test("two instants in the same minute give the same block", () => {
    assert.strictEqual(formatTimeBlock("2026-10-09T05:30:01Z"), formatTimeBlock("2026-10-09T05:30:59Z"));
  });

  test("the next minute gives a different block", () => {
    assert.notStrictEqual(formatTimeBlock("2026-10-09T05:30:59Z"), formatTimeBlock("2026-10-09T05:31:00Z"));
  });

  test("output never contains a colon (BullMQ job ID rule)", () => {
    assert.ok(!formatTimeBlock(new Date()).includes(":"));
  });

  test("year and leap-day boundaries", () => {
    assert.strictEqual(formatTimeBlock("2025-12-31T23:59:00Z"), "20251231T2359Z");
    assert.strictEqual(formatTimeBlock("2028-02-29T12:00:00Z", "day"), "20280229");
  });

  test("accepts Date objects and timestamps", () => {
    assert.strictEqual(formatTimeBlock(new Date("2026-10-09T05:30:00Z"), "hour"), "20261009T05Z");
    assert.strictEqual(formatTimeBlock(Date.UTC(2026, 9, 9, 5), "hour"), "20261009T05Z");
  });

  test("invalid date throws a clear error", () => {
    assert.throws(() => formatTimeBlock("garbage"), /Invalid date/);
  });
});
