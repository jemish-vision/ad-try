import React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatMessageText from "./ChatMessageText";
import ReportTable from "./ReportTable";
import ReportKPICards from "./ReportKPICards";
import {
  createReportContext,
  displayColumns,
  friendlyLabel,
  friendlyChartTitle,
  friendlyTableTitle,
  friendlyText,
  profileNameMap,
} from "./reportDisplay";

test("supporting comparison columns use readable metric and period labels", () => {
  expect(friendlyLabel("cpcCurrent", "cpcCurrent")).toBe("Cost per click · this period");
  expect(friendlyLabel("cvrPrevious", "cvrPrevious")).toBe("Conversion rate · previous period");
  expect(friendlyLabel("customField", "customField")).toBe("custom Field");
});

test("report prose formats money using the supplied currency without changing its value", () => {
  render(<ChatMessageText text="SALES decreased by 166886.20 currency." isReport currencyCode="INR" />);
  expect(screen.getByText(/Ad sales decreased by ₹1,66,886.20/)).toBeInTheDocument();
});

test("technical identifiers and import codes become clear customer language", () => {
  const text = friendlyText("2630925322373862/SP/current: IMPORT_COVERAGE_UNVERIFIED NEWER_INCOMPLETE_IMPORT HOURLY_ORDERS_ARE_UNITS");
  expect(text).not.toContain("2630925322373862");
  expect(text).not.toMatch(/IMPORT_|HOURLY_|\/SP\//);
  expect(text).toContain("Data is still updating");
  expect(text).toContain("Hourly order counts are not available");
  expect(text).toContain("latest data update is still in progress");
});

test("chart titles and comparison warnings use customer language", () => {
  expect(friendlyChartTitle("Observed cvr by profile-local weekday and hour"))
    .toBe("Conversion rate by day and hour (profile time)");
  expect(friendlyChartTitle("spend by entity · INR")).toBe("Ad spend comparison · INR");
  expect(friendlyText("Verified, conflict-free, matched reporting periods with known attribution are required for changes and mover rankings."))
    .toBe("Changes and biggest movers will be available when both periods have complete, comparable data.");
});

test("data freshness messages explain the limitation in customer language", () => {
  expect(friendlyText("Attributed sales and orders may mature within their attribution window; imported figures are provisional."))
    .toBe("Recent sales and orders can change as Amazon finishes attributing purchases to ads.");
  expect(friendlyText("SB: the source attribution window is not verified; keep this ad type separate from other totals."))
    .toBe("Sponsored Brands uses an unconfirmed sales attribution period, so its totals are shown separately.");
  expect(friendlyText("Current totals are available reporting data; complete data completeness is unverified."))
    .toBe("These totals use the data available so far. They may change when all reports have finished updating.");
  expect(friendlyText("verified data completeness"))
    .toBe("Confirmation that all data is available is still pending.");
});

test("KPI group headings show shared context once while preserving metric values", () => {
  const title = "2630925322373862 SP";
  const { container } = render(<ReportKPICards currencyCode="INR" profileNames={{ "2630925322373862": "Tagdo" }} cards={[
    { metric: "sales", title, value: 490021.44, unit: "currency" },
    { metric: "orders", title, value: 942, unit: "count" },
  ]} />);
  expect(screen.getAllByText("Tagdo · Sponsored Products · INR")).toHaveLength(1);
  expect(container.querySelectorAll(".report-kpi-card")).toHaveLength(2);
  expect(screen.getByText("942")).toBeInTheDocument();
  expect(container.querySelector(".report-kpi-card")).not.toHaveTextContent("Sponsored Products");
});

test("KPI captions distinguish ad types for the same profile", () => {
  render(<ReportKPICards
    currencyCode="INR"
    profileNames={{ "2630925322373862": "Tagdo" }}
    cards={[
      { metric: "spend", title: "2630925322373862 SP: SPEND", unit: "currency", value: 25 },
      { metric: "spend", title: "2630925322373862 SB: SPEND", unit: "currency", value: 10 },
    ]}
  />);
  expect(screen.getByText("Tagdo · Sponsored Products · INR")).toBeInTheDocument();
  expect(screen.getByText("Tagdo · Sponsored Brands · INR")).toBeInTheDocument();
});

test("tables use meaningful titles and column labels", () => {
  expect(friendlyTableTitle("summary · SP · 2630925322373862 · current")).toBe("Performance · Selected period");
  expect(friendlyTableTitle("comparison · SP · 2630925322373862 · current")).toBe("Performance comparison · Selected period");
  expect(friendlyTableTitle("comparison · SP · 2630925322373862 · comparison")).toBe("Performance comparison · Previous period");
  expect(friendlyLabel("cvr", "cvr")).toBe("Conversion rate");
  expect(friendlyLabel("cpc", "cpc")).toBe("Cost per click");
  expect(friendlyLabel("oldValue")).toBe("Before");
  expect(friendlyLabel("newValue")).toBe("After");
  expect(friendlyLabel("profit")).toBe("Profit after ads");
});

test("internal identifiers are excluded from visible table columns", () => {
  const keys = ["profileId", "campaignId", "adGroupId", "keywordId", "targetId", "ruleId", "entityId", "name", "sales"];
  expect(displayColumns({ columns: keys.map(key => ({ key })) }).map(column => column.key)).toEqual(["name", "sales"]);
});

test("the redundant name column is dropped when a search term column is present", () => {
  const keys = ["adType", "searchTerm", "name", "spend", "acos"];
  expect(displayColumns({ columns: keys.map(key => ({ key })) }).map(column => column.key))
    .toEqual(["adType", "searchTerm", "spend", "acos"]);
});

test("safe rich text supports bold lines and markdown tables", () => {
  render(<ChatMessageText text={"## Results\n<b>Total sales</b><br/>**Updated today**\n| Metric | Value |\n| --- | --- |\n| ACOS | 12% |"} />);
  expect(screen.getByText("Results")).toBeInTheDocument();
  expect(screen.getByText("Total sales")).toBeInTheDocument();
  expect(screen.getByText("Updated today")).toBeInTheDocument();
  const table = screen.getByRole("table");
  expect(within(table).getByRole("columnheader", { name: "Metric" })).toBeInTheDocument();
  expect(within(table).getByRole("cell", { name: "12%" })).toBeInTheDocument();
});

test("untrusted HTML remains escaped text and cannot create image, link or script markup", () => {
  const unsafe = '<img src=x onerror="window.reportExecuted=true"><script>window.reportExecuted=true</script><a href="javascript:alert(1)">click me</a>';
  render(<ChatMessageText text={unsafe} />);
  expect(screen.getByText(unsafe)).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(window.reportExecuted).toBeUndefined();
});

test("report narrative hides technical import codes without changing metric values", () => {
  render(<ChatMessageText isReport text={"2630925322373862/SP/current: IMPORT_COVERAGE_UNVERIFIED\nACOS 12%, sales €123.45"} />);
  expect(screen.getByText(/Data is still updating/)).toBeInTheDocument();
  expect(screen.getByText("ACOS 12%, sales €123.45")).toBeInTheDocument();
  expect(screen.queryByText(/2630925322373862/)).not.toBeInTheDocument();
  expect(screen.queryByText(/IMPORT_COVERAGE/)).not.toBeInTheDocument();
});

test("table uses dataset currency, friendly labels and named profiles", () => {
  const dataset = {
    currencyCode: "EUR",
    columns: [
      { key: "profileId", type: "string" },
      { key: "campaignId", type: "string" },
      { key: "name", type: "string" },
      { key: "spend", type: "number", unit: "currency" },
      { key: "cvr", type: "number", unit: "percent" },
    ],
    rows: [{ profileId: "2630925322373862", name: "2630925322373862", spend: 12.5, cvr: null }],
  };
  render(<ReportTable dataset={dataset} currencyCode="USD" profileNames={{ "2630925322373862": "Tagdo India" }} title="summary · SP · 2630925322373862 · current" />);
  expect(screen.getByRole("columnheader", { name: "Ad spend" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Conversion rate" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "€12.50" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Tagdo India" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
  expect(screen.queryByText("2630925322373862")).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "profileId" })).not.toBeInTheDocument();
});

test("report context preserves selected dates using a valid custom period and profile ad types", () => {
  const context = createReportContext({
    reportId: "report-1",
    category: "summary",
    scope: { profiles: [{ profileId: "1001", adTypes: ["SB"] }, { profileId: "1002", adTypes: ["SB", "SD"] }] },
    periods: [{ current: { fromDate: "2026-10-13", toDate: "2026-10-19" } }],
    freshness: { dataAsOf: "2026-10-20T12:00:00.000Z" },
  });
  expect(context.period).toEqual({ preset: "custom", fromDate: "2026-10-13", toDate: "2026-10-19" });
  expect(context.profileIds).toEqual(["1001", "1002"]);
  expect(context.adTypes).toEqual(["SB", "SD"]);
  expect(context.generatedAt).toBe("2026-10-20T12:00:00.000Z");
});

test("grouped and flat profile options resolve to readable profile names", () => {
  const names = profileNameMap([
    { name: "Organization", profiles: [{ profileId: 1001, name: "India" }, { profileId: "1002", name: "Europe" }] },
    { profileId: "1003", name: "Canada" },
    { name: "No identity" },
  ]);
  expect(names).toEqual({ "1001": "India", "1002": "Europe", "1003": "Canada" });
  expect(profileNameMap(null)).toEqual({});
});

test("non-profile table names remain readable for time and rule rows", () => {
  render(<ReportTable dataset={{
    columns: [{ key: "name", type: "string" }, { key: "clicks", type: "number", unit: "count" }],
    rows: [
      { profileId: "1001", name: "Monday / 12", clicks: 50 },
      { profileId: "1001", name: "Evening bid rule", entityId: "campaign-1", clicks: 30 },
    ],
  }} profileNames={{ "1001": "India" }} />);
  expect(screen.getByRole("cell", { name: "Monday / 12" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Evening bid rule" })).toBeInTheDocument();
});

test("tables and charts display specific period dates instead of vague labels", () => {
  const periods = [{
    profileId: "2630925322373862",
    current: { fromDate: "2026-10-19", toDate: "2026-10-21" },
    comparison: { fromDate: "2026-10-12", toDate: "2026-10-14" },
  }];

  expect(friendlyTableTitle("summary · SP · 2630925322373862 · current", periods))
    .toBe("Performance · Current period (2026-10-19 → 2026-10-21)");
  expect(friendlyTableTitle("comparison · SP · 2630925322373862 · current", periods))
    .toBe("Performance comparison · Current period (2026-10-19 → 2026-10-21)");
  expect(friendlyTableTitle("comparison · SP · 2630925322373862 · comparison", periods))
    .toBe("Performance comparison · Previous period (2026-10-12 → 2026-10-14)");

  expect(friendlyLabel("currentValue", undefined, periods))
    .toBe("Current period (2026-10-19 → 2026-10-21)");
  expect(friendlyLabel("previousValue", undefined, periods))
    .toBe("Previous period (2026-10-12 → 2026-10-14)");

  expect(friendlyChartTitle("summary · SP · 2630925322373862 · current", { "2630925322373862": "Tagdo" }, periods))
    .toBe("Performance · Current period (2026-10-19 → 2026-10-21) · Tagdo · Sponsored Products");
});

test("single result tables omit the redundant (1 result) text", () => {
  const dataset = {
    currencyCode: "EUR",
    columns: [{ key: "name", type: "string" }, { key: "spend", type: "number", unit: "currency" }],
    rows: [{ name: "Campaign 1", spend: 10 }],
  };
  const periods = [{
    current: { fromDate: "2026-10-19", toDate: "2026-10-21" },
  }];

  const { container } = render(
    <ReportTable
      dataset={dataset}
      title="comparison · SP · 2630925322373862 · current"
      periods={periods}
    />
  );
  expect(container).toHaveTextContent("Performance comparison · Current period (2026-10-19 → 2026-10-21)");
  expect(container).not.toHaveTextContent("(1 result)");
});
