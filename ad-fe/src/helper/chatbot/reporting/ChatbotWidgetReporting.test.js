import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ReportTable from "./ReportTable";
import ChatReportRenderer from "./ChatReportRenderer";
import fixtures from "../fixtures/reporting.v1.json";

// Mock ApexCharts in JSDOM
jest.mock("react-apexcharts", () => {
  return function MockApexChart({ type, series }) {
    return (
      <div data-testid={`mock-chart-${type}`}>
        {type} chart with {Array.isArray(series) ? series.length : 0} series
      </div>
    );
  };
});

describe("Round 3: Component Interaction and State Verification", () => {
  const sampleDataset = {
    id: "ds_test_campaigns",
    grain: "campaign",
    columns: [
      { key: "name", label: "Campaign" },
      { key: "spend", label: "Spend" },
      { key: "sales", label: "Sales" },
    ],
    rows: [
      { name: "Alpha Campaign", spend: 100, sales: 500 },
      { name: "Beta Campaign", spend: 300, sales: 900 },
      { name: "Gamma Campaign", spend: 50, sales: 200 },
      { name: "Delta Campaign", spend: 200, sales: 800 },
      { name: "Epsilon Campaign", spend: 80, sales: 300 },
      { name: "Zeta Campaign", spend: 150, sales: 600 },
      { name: "Eta Campaign", spend: 250, sales: 1000 },
    ],
  };

  test("Round 3: ReportTable renders, searches, sorts, and paginates evidence", () => {
    render(
      <ReportTable
        dataset={sampleDataset}
        title="Top Campaigns"
        currencyCode="USD"
        isExpanded={false}
      />
    );

    // 1. Title and item count
    expect(screen.getByText("Top Campaigns (7 results)")).toBeInTheDocument();

    // 2. Default first page contains 5 items (pageSize = 5 when not expanded)
    expect(screen.getByText("Alpha Campaign")).toBeInTheDocument();
    expect(screen.getByText("Beta Campaign")).toBeInTheDocument();
    expect(screen.getByText("Gamma Campaign")).toBeInTheDocument();
    expect(screen.getByText("Delta Campaign")).toBeInTheDocument();
    expect(screen.getByText("Epsilon Campaign")).toBeInTheDocument();
    expect(screen.queryByText("Zeta Campaign")).not.toBeInTheDocument();

    // 3. Page navigation to Page 2
    const nextBtn = screen.getByTitle("Next page");
    fireEvent.click(nextBtn);
    expect(screen.getByText("Zeta Campaign")).toBeInTheDocument();
    expect(screen.getByText("Eta Campaign")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Campaign")).not.toBeInTheDocument();

    // 4. Return to Page 1
    const prevBtn = screen.getByTitle("Previous page");
    fireEvent.click(prevBtn);
    expect(screen.getByText("Alpha Campaign")).toBeInTheDocument();

    // 5. Search filter
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "Gamma" } });
    expect(screen.getByText("Gamma Campaign")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Campaign")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta Campaign")).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Alpha Campaign")).toBeInTheDocument();

    // 6. Sorting by Spend (clicking header toggles desc -> asc)
    const spendHeader = screen.getByText("Ad spend");
    fireEvent.click(spendHeader); // desc sort
    // Top spend is Beta (300)
    expect(screen.getByText("Beta Campaign")).toBeInTheDocument();
    fireEvent.click(spendHeader); // asc sort
    // Lowest spend is Gamma (50)
    expect(screen.getByText("Gamma Campaign")).toBeInTheDocument();
  });

  test("Round 3: ChatReportRenderer handles expand toggle and 1-click follow-up drilldowns", () => {
    const report = fixtures.scenarios.find(s => s.name === "all_visual_types").response;
    const handleToggleExpand = jest.fn();
    const handleFollowUp = jest.fn();

    const { rerender } = render(
      <ChatReportRenderer
        report={report}
        isExpanded={false}
        onToggleExpand={handleToggleExpand}
        onFollowUp={handleFollowUp}
      />
    );

    // Initial collapsed view has expand button
    const expandBtn = screen.getByTitle("Expand report view");
    fireEvent.click(expandBtn);
    expect(handleToggleExpand).toHaveBeenCalledTimes(1);

    // Rerender as expanded
    rerender(
      <ChatReportRenderer
        report={report}
        isExpanded={true}
        onToggleExpand={handleToggleExpand}
        onFollowUp={handleFollowUp}
      />
    );
    expect(screen.getByTitle("Collapse report view")).toBeInTheDocument();

    // Click follow-up button
    const followUpBtn = screen.getByText("Synthetic show campaigns");
    fireEvent.click(followUpBtn);
    expect(handleFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Synthetic show campaigns",
        request: expect.objectContaining({
          category: "comparison",
          profileIds: ["1001"],
        }),
      })
    );
  });

  test("Round 3: Verified empty state renders cleanly with guidance", () => {
    const emptyReport = fixtures.scenarios.find(s => s.name === "verified_empty").response;

    render(<ChatReportRenderer report={emptyReport} />);

    expect(screen.getByText("No Matching Records")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-chart-line")).not.toBeInTheDocument();
  });

  test("Round 3: Unavailable state renders missing prerequisites callout", () => {
    const unavailReport = fixtures.scenarios.find(s => s.name === "today_unavailable").response;

    render(<ChatReportRenderer report={unavailReport} />);

    expect(screen.getByText("More information needed")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});
