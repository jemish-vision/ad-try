import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatReportRenderer from "./ChatReportRenderer";
import fixtures from "../fixtures/reporting.v1.json";

// Mock react-apexcharts in JSDOM
jest.mock("react-apexcharts", () => {
  return function MockApexChart({ type, series }) {
    return (
      <div data-testid={`mock-chart-${type}`}>
        {type} chart with {Array.isArray(series) ? series.length : 0} series
      </div>
    );
  };
});

describe("ChatReportRenderer", () => {
  const allVisualTypesScenario = fixtures.scenarios.find(
    (s) => s.name === "all_visual_types"
  );
  const emptyScenario = fixtures.scenarios.find(
    (s) => s.name === "verified_empty"
  );
  const unavailableScenario = fixtures.scenarios.find(
    (s) => s.name === "today_unavailable"
  );

  test("workspace keeps charts visible and puts supporting data and notes behind disclosures", () => {
    const report = { ...allVisualTypesScenario.response, warnings: ["IMPORT_COVERAGE_UNVERIFIED"] };
    const { container } = render(<ChatReportRenderer report={report} layoutVariant="workspace" />);
    expect(screen.getByTestId("mock-chart-line")).toBeVisible();
    const dataSections = [...container.querySelectorAll("details.report-table-details")];
    expect(dataSections.length).toBeGreaterThan(0);
    dataSections.forEach(section => expect(section).not.toHaveAttribute("open"));
    expect(container.querySelector("details.report-data-notes")).not.toHaveAttribute("open");
    expect(screen.getByText(/Key metrics/)).toBeInTheDocument();
  });

  test("workspace keeps table-first reports immediately accessible", () => {
    const source = allVisualTypesScenario.response;
    const report = { ...source, category: "waste", blocks: source.blocks.filter(block => block.type === "table") };
    const { container } = render(<ChatReportRenderer report={report} layoutVariant="workspace" />);
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    expect(container.querySelector("details.report-table-details")).toBeNull();
  });

  test("renders all_visual_types fixture with header, KPI cards, charts, and follow-ups", () => {
    const report = allVisualTypesScenario.response;
    const handleFollowUp = jest.fn();
    const handleToggleExpand = jest.fn();

    render(
      <ChatReportRenderer
        report={report}
        onFollowUp={handleFollowUp}
        onToggleExpand={handleToggleExpand}
      />
    );

    // 1. Header & Freshness
    expect(screen.getByText("Performance Summary")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText(/2026-10-13 → 2026-10-19/)).toBeInTheDocument();

    // 2. KPI Cards (Spend, Sales, ACOS, ROAS, Orders, CPC, CVR)
    expect(screen.getByText("Spend")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("ACOS")).toBeInTheDocument();
    expect(screen.getByText("ROAS")).toBeInTheDocument();
    expect(screen.getAllByText("Orders")).toHaveLength(2); // Card and friendly table header.
    expect(screen.getByText("CPC")).toBeInTheDocument();
    expect(screen.getByText("Conversion rate")).toBeInTheDocument();

    // 3. Values and delta badges
    expect(screen.getByText("12.0%")).toBeInTheDocument(); // ACOS
    expect(screen.getByText("8.33x")).toBeInTheDocument(); // ROAS
    expect(screen.getByText("20")).toBeInTheDocument(); // Orders

    // 4. Charts rendered (line, bar + grouped_bar, donut, heatmap)
    expect(screen.getByTestId("mock-chart-line")).toBeInTheDocument();
    expect(screen.getAllByTestId("mock-chart-bar")).toHaveLength(2);
    expect(screen.getByTestId("mock-chart-donut")).toBeInTheDocument();
    expect(screen.getByTestId("mock-chart-heatmap")).toBeInTheDocument();

    // 5. Expand toggle button
    const expandBtn = screen.getByTitle("Expand report view");
    fireEvent.click(expandBtn);
    expect(handleToggleExpand).toHaveBeenCalledTimes(1);

    // 6. Follow-up chips
    const followUpBtn = screen.getByText("Synthetic show campaigns");
    expect(followUpBtn).toBeInTheDocument();
    fireEvent.click(followUpBtn);
    expect(handleFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Synthetic show campaigns" })
    );
  });

  test("renders verified_empty scenario with empty state", () => {
    const report = emptyScenario.response;

    render(<ChatReportRenderer report={report} />);

    expect(screen.getByText("No Matching Records")).toBeInTheDocument();
  });

  test("a missing table dataset never displays unrelated report data", () => {
    render(<ChatReportRenderer report={{
      ...allVisualTypesScenario.response,
      cards: [],
      blocks: [{ type: "table", datasetId: "missing", title: "Requested report" }],
      datasets: [{
        id: "another-report",
        columns: [{ key: "name", type: "string" }],
        rows: [{ name: "Unrelated campaign" }],
      }],
    }} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Unrelated campaign")).not.toBeInTheDocument();
  });

  test("weekday reports display readable day names in source and analysis tables", () => {
    const datasets = [
      { id: "source", columns: [{ key: "weekday", type: "number" }, { key: "spend", type: "number" }], rows: [{ weekday: 0, spend: 15 }] },
      { id: "analysis", columns: [{ key: "name", type: "string" }, { key: "spend", type: "number" }], rows: [{ name: "2", spend: 20 }] },
    ];
    render(<ChatReportRenderer report={{
      ...allVisualTypesScenario.response,
      category: "time",
      cards: [],
      datasets,
      blocks: datasets.map(dataset => ({ type: "table", datasetId: dataset.id })),
    }} />);
    expect(screen.getByRole("cell", { name: "Sunday" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Tuesday" })).toBeInTheDocument();
    expect(datasets[0].rows[0].weekday).toBe(0);
    expect(datasets[1].rows[0].name).toBe("2");
  });

  test("hourly reports display readable days and times without changing evidence", () => {
    const datasets = [
      { id: "source", columns: [{ key: "weekday", type: "number" }, { key: "hour", type: "number" }, { key: "name", type: "string" }], rows: [{ weekday: 1, hour: 0, name: "0 / 1" }] },
      { id: "analysis", columns: [{ key: "name", type: "string" }], rows: [{ name: "5 / 2" }] },
    ];
    render(<ChatReportRenderer report={{
      ...allVisualTypesScenario.response,
      category: "time",
      cards: [],
      datasets,
      blocks: datasets.map(dataset => ({ type: "table", datasetId: dataset.id })),
    }} />);
    expect(screen.getByRole("cell", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "00:00" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Monday 00:00" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Tuesday 05:00" })).toBeInTheDocument();
    expect(datasets[0].rows[0]).toEqual({ weekday: 1, hour: 0, name: "0 / 1" });
    expect(datasets[1].rows[0].name).toBe("5 / 2");
  });

  test("renders today_unavailable scenario with prerequisites warning", () => {
    const report = unavailableScenario.response;

    render(<ChatReportRenderer report={report} />);

    expect(screen.getByText("Here's what I can tell you")).toBeInTheDocument();
  });

  test("Step 8: follow-up chips pass structured request object to onFollowUp handler", () => {
    const report = allVisualTypesScenario.response;
    const handleFollowUp = jest.fn();

    render(
      <ChatReportRenderer
        report={report}
        onFollowUp={handleFollowUp}
      />
    );

    const followUpBtn = screen.getByText("Synthetic show campaigns");
    fireEvent.click(followUpBtn);

    expect(handleFollowUp).toHaveBeenCalledTimes(1);
    const passedItem = handleFollowUp.mock.calls[0][0];
    expect(passedItem.label).toBe("Synthetic show campaigns");
    expect(passedItem.request).toBeDefined();
    expect(passedItem.request.category).toBe("comparison");
    expect(passedItem.request.profileIds).toEqual(["1001"]);
  });

  test("a single-value report hides the aggregate table that just restates the KPI card", () => {
    const report = {
      status: "ok",
      category: "summary",
      cards: [{ metric: "acos", label: "ACOS", value: 17.3, unit: "percent" }],
      blocks: [{ type: "table", datasetId: "agg", title: "Performance" }],
      datasets: [{
        id: "agg",
        columns: [
          { key: "adType", type: "string" },
          { key: "name", type: "string" },
          { key: "acos", type: "number", unit: "percent" },
        ],
        rows: [{ adType: "SP", name: "Tagdo", acos: 17.3 }],
      }],
    };
    const { container } = render(<ChatReportRenderer report={report} />);
    expect(screen.getByText("ACOS")).toBeInTheDocument(); // KPI card stays
    expect(container.querySelector("table")).toBeNull(); // duplicate table gone
  });

  const settlingNotes = [
    "IMPORT_COVERAGE_UNVERIFIED",
    "Attributed sales and orders may mature within their attribution window; imported figures are provisional.",
  ];
  const settlingReport = (current, freshness) => ({
    status: "ok",
    category: "summary",
    freshness,
    periods: [{ current }],
    scope: { profiles: [{ attributionWindows: { SP: 7 } }] },
    warnings: settlingNotes,
    cards: [{ metric: "acos", label: "ACOS", value: 17.3, unit: "percent" }],
    blocks: [],
    datasets: [],
  });

  test("the 'still settling' note is hidden on a verified, fully-settled period", () => {
    const report = settlingReport(
      { fromDate: "2026-09-01", toDate: "2026-09-07" }, // ~6 weeks old
      { status: "verified", dataAsOf: "2026-10-23T00:00:00Z" },
    );
    render(<ChatReportRenderer report={report} />);
    expect(screen.queryByText(/About these numbers/)).toBeNull();
    expect(screen.queryByText(/still updating/)).toBeNull();
  });

  test("the 'still settling' note still shows for a recent period inside the attribution window", () => {
    const report = settlingReport(
      { fromDate: "2026-10-22", toDate: "2026-10-22" }, // yesterday
      { status: "verified", dataAsOf: "2026-10-23T00:00:00Z" },
    );
    render(<ChatReportRenderer report={report} />);
    expect(screen.getByText("Data is still updating, so totals may change.")).toBeInTheDocument();
  });

  test("a per-entity breakdown table still renders even with a single row", () => {
    const report = {
      status: "ok",
      category: "change",
      cards: [{ metric: "acos", label: "ACOS", value: 17.3, unit: "percent" }],
      blocks: [{ type: "table", datasetId: "bd", title: "By campaign" }],
      datasets: [{
        id: "bd",
        columns: [
          { key: "campaignId", type: "string" },
          { key: "name", type: "string" },
          { key: "acos", type: "number", unit: "percent" },
        ],
        rows: [{ campaignId: "777", name: "A-2073-Men-Raincoat", acos: 17.3 }],
      }],
    };
    const { container } = render(<ChatReportRenderer report={report} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByText("A-2073-Men-Raincoat")).toBeInTheDocument();
  });
});
