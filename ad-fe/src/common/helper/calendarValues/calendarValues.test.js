import differenceInCalendarDays from "date-fns/differenceInCalendarDays";
import format from "date-fns/format";
import { getCompletedDaysRange, predefinedRanges } from "./calendarValues";

const ymd = (date) => format(date, "yyyy-MM-dd");
const resolve = (label) => {
  const { value } = predefinedRanges.find((range) => range.label === label);
  return typeof value === "function" ? value() : value;
};

describe("completed-day reporting presets", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 26, 12));
  });

  afterEach(() => jest.useRealTimers());

  test.each([
    ["Last 7 Days", 7, "2026-10-19"],
    ["Last 14 Days", 14, "2026-10-12"],
    ["Last 30 Days", 30, "2026-09-26"],
    ["Last 65 Days", 65, "2026-08-22"],
    ["Last 6 Months", 180, "2026-04-29"],
  ])("%s excludes today and contains exactly %i days", (label, days, start) => {
    const dates = resolve(label);
    expect(dates.map(ymd)).toEqual([start, "2026-10-25"]);
    expect(differenceInCalendarDays(dates[1], dates[0]) + 1).toBe(days);
  });

  test("presets advance after midnight without reloading the module", () => {
    expect(resolve("Last 7 Days").map(ymd)).toEqual(["2026-10-19", "2026-10-25"]);
    jest.setSystemTime(new Date(2026, 9, 27, 0, 1));
    expect(resolve("Last 7 Days").map(ymd)).toEqual(["2026-10-20", "2026-10-26"]);
  });

  test.each([
    [new Date(2026, 0, 1, 12), "2025-12-25", "2025-12-31"],
    [new Date(2024, 2, 1, 12), "2024-02-23", "2024-02-29"],
    [new Date(2026, 2, 9, 12), "2026-03-02", "2026-03-08"],
    [new Date(2026, 10, 2, 12), "2026-10-26", "2026-11-01"],
  ])("uses calendar dates across month, year, leap day and DST boundaries", (now, start, end) => {
    const dates = getCompletedDaysRange(7, now);
    expect(dates.map(ymd)).toEqual([start, end]);
    expect(differenceInCalendarDays(dates[1], dates[0]) + 1).toBe(7);
    expect(now.getHours()).toBe(12);
  });
});
