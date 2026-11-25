import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import AdBlackoutWidget from "./AdBlackoutWidget";
import { blackoutReasonText, formatBlackoutHour } from "./adBlackoutText";
import { ApiGetAdBlackoutAlerts, ApiDismissAdBlackoutAlert } from "../../../../api-wrapper/dashboard/ApiDashboard";

jest.mock("react-dom/test-utils", () => ({ ...jest.requireActual("react-dom/test-utils"), act: require("react").act }));
const fillT = (text, vars = {}) => String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (text, vars) => String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars?.[k] ?? `{{${k}}}`)),
  }),
}));
jest.mock("../../../../api-wrapper/dashboard/ApiDashboard", () => ({
  ApiGetAdBlackoutAlerts: jest.fn(),
  ApiDismissAdBlackoutAlert: jest.fn(),
}));

const buyBoxAlert = {
  _id: "alert-1",
  adType: "SP",
  entityLevel: "CAMPAIGN",
  campaignId: 1001,
  campaignName: "A-Hero-Jacket-Exact",
  status: "ACTIVE",
  detectedAt: "2026-11-25T08:15:00Z",
  firstBlackoutHour: "2026-11-25 13:00",
  lastZeroHour: "2026-11-25 13:00",
  reasonCode: "BUY_BOX_LOST",
  reasonParams: { asin: "B09BUYBOX1" },
  affectedAsins: ["B09BUYBOX1"],
  avgHourlyImpressions: 620,
};

const rulePausedAgAlert = {
  _id: "alert-2",
  adType: "SB",
  entityLevel: "AD_GROUP",
  campaignId: 1002,
  campaignName: "SB-Video-Top",
  adGroupId: 2002,
  adGroupName: "Broad Keywords",
  status: "ACTIVE",
  detectedAt: "2026-11-25T08:15:00Z",
  firstBlackoutHour: "2026-11-25 13:00",
  lastZeroHour: "2026-11-25 13:00",
  reasonCode: "RULE_PAUSED_ALL_TARGETS",
  reasonParams: { ruleName: "Pause Zero Sales" },
  affectedAsins: [],
  avgHourlyImpressions: 310,
};

const makePayload = (alerts, overrides = {}) => ({
  isSuccess: true,
  data: {
    timezone: "Asia/Kolkata",
    alerts,
    summary: { activeCount: alerts.length, resolvedTodayCount: 1 },
    pagination: {
      page: 1,
      limit: 6,
      totalRecords: alerts.length,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      ...overrides,
    },
  },
});

let requests;
beforeEach(() => {
  jest.clearAllMocks();
  requests = [];
  ApiGetAdBlackoutAlerts.mockImplementation((body) => new Promise((resolve) => requests.push({ body, resolve })));
  ApiDismissAdBlackoutAlert.mockResolvedValue({ isSuccess: true });
});

const renderWidget = () => render(<AdBlackoutWidget profileId="111" adType="All" marketplace="IN" />);

test("renders hourly blackout cards with plain-language diagnosis and zero monetary loss figures", async () => {
  renderWidget();
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(requests[0].body).toMatchObject({ profileId: "111", adType: "All", status: "ACTIVE", page: 1 });

  await act(async () => requests[0].resolve(makePayload([buyBoxAlert, rulePausedAgAlert])));

  const cards = screen.getAllByTestId("ad-blackout-alert");
  expect(cards).toHaveLength(2);

  expect(within(cards[0]).getByText("A-Hero-Jacket-Exact")).toBeInTheDocument();
  expect(within(cards[0]).getByText("Buy Box Lost")).toBeInTheDocument();
  expect(within(cards[0]).getByText("B09BUYBOX1 lost the Buy Box")).toBeInTheDocument();
  expect(within(cards[0]).getByText("0 impr since 01:00 PM")).toBeInTheDocument();
  expect(within(cards[0]).getByText("Normally ~620 impr/hr")).toBeInTheDocument();
  expect(within(cards[0]).getByRole("link").getAttribute("href")).toContain("campaignId=1001");

  expect(within(cards[1]).getByText("Ad Group: Broad Keywords")).toBeInTheDocument();
  expect(within(cards[1]).getByText('Rule "Pause Zero Sales" paused all targets')).toBeInTheDocument();
  expect(within(cards[1]).getByRole("link")).toHaveAttribute("href", "/targeting-rule");

  // Explicitly assert no rupee/currency loss amounts appear anywhere
  expect(screen.queryByText(/₹|Est\. loss/i)).not.toBeInTheDocument();
});

test("toggles Resolved Today tab and Check now triggers refresh: true", async () => {
  renderWidget();
  await act(async () => requests[0].resolve(makePayload([buyBoxAlert])));

  fireEvent.click(screen.getByRole("button", { name: "Resolved Today" }));
  expect(requests[1].body).toMatchObject({ status: "RESOLVED", page: 1 });
  await act(async () => requests[1].resolve(makePayload([])));
  expect(screen.getByText("No blackout alerts resolved today.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  expect(requests[2].body).toMatchObject({ status: "RESOLVED", refresh: true });
});

test("dismissing an alert calls ApiDismissAdBlackoutAlert and refreshes", async () => {
  renderWidget();
  await act(async () => requests[0].resolve(makePayload([buyBoxAlert])));

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
  });
  expect(ApiDismissAdBlackoutAlert).toHaveBeenCalledWith({ profileId: "111", alertId: "alert-1" });
  expect(requests).toHaveLength(2);
});

test("blackoutReasonText supports all reason codes", () => {
  const codes = [
    "BUY_BOX_LOST",
    "PRODUCT_UNBUYABLE",
    "CREATIVE_REJECTED",
    "LISTING_SUPPRESSED",
    "LISTING_INELIGIBLE",
    "PORTFOLIO_CAP_HIT",
    "CAMPAIGN_END_DATE",
    "RULE_PAUSED_ALL_TARGETS",
    "CAMPAIGN_OUT_OF_BUDGET",
    "CAMPAIGN_OR_ADGROUP_PAUSED",
    "UNKNOWN_SERVING_HALT",
  ];
  for (const reasonCode of codes) {
    const res = blackoutReasonText({ reasonCode, reasonParams: { asin: "B0TEST" } }, fillT);
    expect(res.badge).toBeTruthy();
    expect(res.headline).toBeTruthy();
    expect(res.explanation).toBeTruthy();
  }
});

test("formats blackout and resolved times in 12-hour AM/PM format", async () => {
  expect(formatBlackoutHour("2026-11-25 00:00")).toBe("12:00 AM");
  expect(formatBlackoutHour("2026-11-25 11:00")).toBe("11:00 AM");
  expect(formatBlackoutHour("2026-11-25 12:00")).toBe("12:00 PM");
  expect(formatBlackoutHour("2026-11-25 13:00")).toBe("01:00 PM");

  renderWidget();
  await act(async () => requests[0].resolve(makePayload([buyBoxAlert])));
  fireEvent.click(screen.getByRole("button", { name: "Resolved Today" }));
  await act(async () =>
    requests[1].resolve(
      makePayload([
        {
          ...buyBoxAlert,
          _id: "alert-resolved",
          status: "RESOLVED",
          resolvedAt: "2026-11-25T08:10:00Z",
        },
      ])
    )
  );
  expect(screen.getByText("Recovered 01:40 PM")).toBeInTheDocument();
});
