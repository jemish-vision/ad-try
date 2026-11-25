import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import PerformanceDeclineWidget from "./PerformanceDeclineWidget";
import { causeText, deltaTone, signedPct } from "./performanceDeclineText";
import { ApiGetPerformanceDeclineAlerts } from "../../../../api-wrapper/dashboard/ApiDashboard";

jest.mock("react-dom/test-utils", () => ({ ...jest.requireActual("react-dom/test-utils"), act: require("react").act }));
// Fake t(): fills {{placeholders}} so the tests read the final English text.
const fillT = (text, vars = {}) => String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (text, vars) => String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars?.[k] ?? `{{${k}}}`)) }) }));
jest.mock("../../../../api-wrapper/dashboard/ApiDashboard", () => ({ ApiGetPerformanceDeclineAlerts: jest.fn(), ApiGetOutOfStockAds: jest.fn() }));
jest.mock("../../../../components/ui/date-range-picker", () => ({
  ShadcnDateRangePicker: ({ value, onChange, placeholder, ariaLabel }) => (
    <div data-testid="mock-date-range-picker">
      <button
        type="button"
        aria-label={ariaLabel || "Custom Date Range"}
        onClick={() => onChange([new Date("2026-11-01T00:00:00Z"), new Date("2026-11-15T00:00:00Z")])}
      >
        {value?.[0] ? `${value[0]} - ${value[1]}` : placeholder || "Custom"}
      </button>
      <button
        type="button"
        aria-label="Clear Custom Dates"
        onClick={() => onChange(null)}
      >
        Clear
      </button>
    </div>
  ),
}));

const metric = (current, prior, delta) => ({ current, prior, delta });
const blackout = {
  campaignId: 282082520827512,
  campaignName: "A-Extra-Cargo-Thu",
  adType: "SP",
  campaignStatus: "PAUSED",
  severity: "CRITICAL",
  scenarioKey: "TRAFFIC_BLACKOUT",
  productContext: { asin: "B09V7YZ2RP", title: "Extra Cargo Roof Bag", imageUrl: null },
  metrics: { impressions: metric(3200, 12400, -74.2), clicks: metric(42, 180, -76.7), sales: metric(120, 890, -86.5) },
  rootCause: { confidence: "CONFIRMED", code: "BID_CUT", params: { pct: -35.7, date: "2026-11-18T12:00:00Z", oldValue: 1.4, newValue: 0.9, count: 1 }, supporting: [{ code: "OUT_OF_STOCK", params: { asin: "B09V7YZ2RP" } }] },
  estimatedLoss: 770,
};
const payload = (alerts, paginationOverrides = {}) => ({
  isSuccess: true,
  data: {
    windowDays: 14,
    evaluationWindow: { current: { start: "2026-11-09", end: "2026-11-22" }, prior: { start: "2026-10-26", end: "2026-11-08" }, bufferedDays: [] },
    summary: { totalDeclines: alerts.length, criticalCount: alerts.length, warningCount: 0, totalEstimatedLoss: 770 },
    alerts,
    pagination: {
      page: 1,
      limit: 6,
      totalRecords: alerts.length,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      ...paginationOverrides,
    },
  },
});

let requests;
beforeEach(() => {
  jest.clearAllMocks();
  requests = [];
  ApiGetPerformanceDeclineAlerts.mockImplementation((body) => new Promise((resolve) => requests.push({ body, resolve })));
});

const renderWidget = () => render(<PerformanceDeclineWidget profileId="111" adType="SP" currencyCode="USD" marketplace="US" />);

test("shows a loading skeleton, then the alert with its cause, chips and campaign link", async () => {
  renderWidget();
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(requests[0].body).toMatchObject({ profileId: "111", windowDays: 14 });
  await act(async () => requests[0].resolve(payload([blackout])));

  const card = screen.getByTestId("perf-decline-alert");
  expect(within(card).getByText("Traffic Blackout")).toBeInTheDocument();
  expect(within(card).getByText("Critical")).toBeInTheDocument();
  expect(within(card).getByText("Confirmed")).toBeInTheDocument();
  expect(within(card).getByText("Bid cut -36% on 18 Nov")).toBeInTheDocument();
  expect(within(card).getByText(/A bid was lowered from \$1\.40 to \$0\.90\./)).toBeInTheDocument();
  expect(within(card).getByText(/Advertised product B09V7YZ2RP is out of stock/)).toBeInTheDocument();
  expect(within(card).getByText("(-74%)")).toBeInTheDocument();
  const link = within(card).getByRole("link");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("href")).toContain("campaignId=282082520827512");
  expect(screen.getByText("1 Critical")).toBeInTheDocument();
  expect(screen.getByText(/Comparing 09 Nov – 22 Nov with 26 Oct – 08 Nov/)).toBeInTheDocument();
});

test("switching to 7D refetches with windowDays 7; refresh asks the server to skip its cache", async () => {
  renderWidget();
  await act(async () => requests[0].resolve(payload([blackout])));
  fireEvent.click(screen.getByRole("button", { name: "7D" }));
  expect(requests[1].body.windowDays).toBe(7);
  expect(requests[1].body.refresh).toBeUndefined();
  await act(async () => requests[1].resolve(payload([])));
  fireEvent.click(screen.getByTitle("Refresh"));
  expect(requests[2].body).toMatchObject({ windowDays: 7, refresh: true });
});

test("an answer to an older request does not overwrite a newer one", async () => {
  renderWidget();
  fireEvent.click(screen.getByRole("button", { name: "30D" }));
  await act(async () => requests[1].resolve(payload([])));
  await act(async () => requests[0].resolve(payload([blackout]))); // late answer for 14D
  expect(screen.queryByTestId("perf-decline-alert")).not.toBeInTheDocument();
  expect(screen.getByText("No unusual performance declines in the last 30 days.")).toBeInTheDocument();
});

test("healthy empty state", async () => {
  renderWidget();
  await act(async () => requests[0].resolve(payload([])));
  expect(screen.getByText("All campaigns are within their normal range.")).toBeInTheDocument();
});

test("error state with retry", async () => {
  renderWidget();
  await act(async () => requests[0].resolve({ isSuccess: false }));
  expect(screen.getByText("Couldn't load performance declines.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(requests).toHaveLength(2);
});

test("pagination: next page button refetches page 2 and updates page indicator", async () => {
  renderWidget();
  const multiPagePayload = {
    isSuccess: true,
    data: {
      windowDays: 14,
      evaluationWindow: { current: { start: "2026-11-09", end: "2026-11-22" }, prior: { start: "2026-10-26", end: "2026-11-08" }, bufferedDays: [] },
      summary: { totalDeclines: 12, criticalCount: 1, warningCount: 11, totalEstimatedLoss: 1400 },
      alerts: [blackout],
      pagination: {
        page: 1,
        limit: 6,
        totalRecords: 12,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      },
    },
  };
  await act(async () => requests[0].resolve(multiPagePayload));

  expect(screen.getByText("Showing 1–6 of 12 declining campaigns")).toBeInTheDocument();
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  const prevBtn = screen.getByRole("button", { name: "Previous page" });
  const nextBtn = screen.getByRole("button", { name: "Next page" });
  expect(prevBtn).toBeDisabled();
  expect(nextBtn).not.toBeDisabled();

  fireEvent.click(nextBtn);
  expect(requests[1].body).toMatchObject({ profileId: "111", page: 2, limit: 6 });
});

test("severity filter: clicking Critical filters by CRITICAL, clicking again toggles off", async () => {
  renderWidget();
  const payloadWithBoth = {
    isSuccess: true,
    data: {
      windowDays: 14,
      evaluationWindow: { current: { start: "2026-11-09", end: "2026-11-22" }, prior: { start: "2026-10-26", end: "2026-11-08" }, bufferedDays: [] },
      summary: { totalDeclines: 10, criticalCount: 3, warningCount: 7, totalEstimatedLoss: 2500 },
      alerts: [blackout],
      pagination: {
        page: 1,
        limit: 6,
        totalRecords: 10,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      },
    },
  };
  await act(async () => requests[0].resolve(payloadWithBoth));

  const critBtn = screen.getByRole("button", { name: "3 Critical" });
  const warnBtn = screen.getByRole("button", { name: "7 Warnings" });
  expect(critBtn).toHaveAttribute("aria-pressed", "false");
  expect(warnBtn).toHaveAttribute("aria-pressed", "false");

  // Click Critical
  fireEvent.click(critBtn);
  expect(requests[1].body).toMatchObject({ profileId: "111", severity: "CRITICAL", page: 1 });
  await act(async () =>
    requests[1].resolve({
      ...payloadWithBoth,
      data: {
        ...payloadWithBoth.data,
        alerts: [blackout],
        activeSeverity: "CRITICAL",
        pagination: { page: 1, limit: 6, totalRecords: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      },
    }),
  );
  expect(critBtn).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Showing 1–3 of 3 critical campaigns")).toBeInTheDocument();

  // Click Critical again to toggle off
  fireEvent.click(critBtn);
  expect(requests[2].body).toMatchObject({ profileId: "111", severity: null, page: 1 });
  await act(async () => requests[2].resolve(payloadWithBoth));
  expect(critBtn).toHaveAttribute("aria-pressed", "false");

  // Click Warnings
  fireEvent.click(warnBtn);
  expect(requests[3].body).toMatchObject({ profileId: "111", severity: "WARNING", page: 1 });
});

test("custom date range: selecting dates refetches with startDate/endDate, updates subtitle, and preset clears it", async () => {
  renderWidget();
  await act(async () => requests[0].resolve(payload([blackout])));

  // Select custom date range
  const customBtn = screen.getByRole("button", { name: "Custom Date Range" });
  fireEvent.click(customBtn);

  expect(requests[1].body).toMatchObject({
    profileId: "111",
    startDate: "2026-11-01",
    endDate: "2026-11-15",
    page: 1,
  });

  const customPayload = {
    isSuccess: true,
    data: {
      windowDays: 15,
      evaluationWindow: {
        current: { start: "2026-11-01", end: "2026-11-15" },
        prior: { start: "2026-10-17", end: "2026-10-31" },
        isCustom: true,
        bufferedDays: [],
      },
      summary: { totalDeclines: 1, criticalCount: 1, warningCount: 0, totalEstimatedLoss: 770 },
      alerts: [blackout],
      pagination: { page: 1, limit: 6, totalRecords: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    },
  };
  await act(async () => requests[1].resolve(customPayload));

  // Verify custom subtitle
  expect(screen.getByText("Comparing 01 Nov – 15 Nov with prior period (17 Oct – 31 Oct).")).toBeInTheDocument();

  // Clear custom range via clear button
  const clearBtn = screen.getByTitle("Clear custom date range");
  fireEvent.click(clearBtn);

  expect(requests[2].body).toMatchObject({
    profileId: "111",
    startDate: null,
    endDate: null,
    windowDays: 14,
  });

  // Re-select custom date range, then click preset 7D
  fireEvent.click(screen.getByRole("button", { name: "Custom Date Range" }));
  expect(requests[3].body).toMatchObject({ startDate: "2026-11-01", endDate: "2026-11-15" });

  fireEvent.click(screen.getByRole("button", { name: "7D" }));
  expect(requests[4].body).toMatchObject({
    profileId: "111",
    startDate: null,
    endDate: null,
    windowDays: 7,
  });
});

describe("cause text", () => {
  const fmt = { money: (v) => `$${v}`, number: String };

  test("every cause code has a headline", () => {
    const codes = ["CAMPAIGN_PAUSED", "TARGET_PAUSED", "OUT_OF_STOCK", "BUY_BOX_LOST", "BID_CUT", "OUTBID_OR_SUPPRESSED", "WASTED_SEARCH_TERMS", "PRICE_RAISED", "LISTING_FRICTION", "BID_RAISED", "PLACEMENT_RAISED", "COMPETITOR_BIDS", "RIVAL_PRICE_CUT", "LOW_CLICK_APPEAL", "BUDGET_RUNS_OUT", "GENERAL_DECLINE"];
    for (const code of codes) {
      const { headline } = causeText({ code, params: {} }, fillT, fmt);
      expect(headline).toBeTruthy();
      expect(headline).not.toBe("Performance declined");
    }
  });

  test("budget starvation mentions the days it ran out", () => {
    const { headline, explanation } = causeText({ code: "BUDGET_RUNS_OUT", params: { timeInBudget: 48, acos: 18.4, outOfBudgetDays: 9, windowDays: 14 } }, fillT, fmt);
    expect(headline).toBe("In budget only 48% of the day");
    expect(explanation).toBe("ACoS is a healthy 18%, but the budget runs out early and the ad misses later shoppers. It ran out of budget on 9 of 14 days.");
  });

  test("delta colours: a rise is bad for ACoS and CPC, a fall is bad for the rest", () => {
    expect(deltaTone("acos", 20)).toBe("bad");
    expect(deltaTone("cpc", -20)).toBe("good");
    expect(deltaTone("sales", -20)).toBe("bad");
    expect(deltaTone("impressions", 0.2)).toBe("flat");
    expect(signedPct(12.4)).toBe("+12%");
    expect(signedPct(null)).toBe("—");
  });
});
