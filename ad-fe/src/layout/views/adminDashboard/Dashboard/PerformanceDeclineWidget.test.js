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
const payload = (alerts) => ({
  isSuccess: true,
  data: {
    windowDays: 14,
    evaluationWindow: { current: { start: "2026-11-09", end: "2026-11-22" }, prior: { start: "2026-10-26", end: "2026-11-08" }, bufferedDays: [] },
    summary: { totalDeclines: alerts.length, criticalCount: alerts.length, warningCount: 0, totalEstimatedLoss: 770 },
    alerts,
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
