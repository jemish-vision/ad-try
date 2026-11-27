import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as Api from "../../../api-wrapper/ApiAiCredits";
import AiCreditsPage from "./AiCreditsPage";
import AiCreditsAdmin from "./admin/AiCreditsAdmin";
import AiCreditSettingsForm, { validateSettings } from "./admin/AiCreditSettingsForm";
import { DailyUsageTable, RetentionNote } from "./aiCreditComponents";
import { __resetAiCreditCache } from "../../../helper/aiCredits/aiCredits";

jest.mock("react-dom/test-utils", () => ({ ...jest.requireActual("react-dom/test-utils"), act: require("react").act }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v?.[k] ?? `{{${k}}}`)), i18n: { language: "en-US" } }),
}));
jest.mock("i18next", () => ({ t: (s) => s }));
jest.mock("../../../api-wrapper/ApiAiCredits", () => ({
  ApiGetAiCreditSummary: jest.fn(),
  ApiGetAiCreditUsage: jest.fn(),
  ApiGetAiCreditTransactions: jest.fn(),
  ApiGetAiCreditPackages: jest.fn(),
  ApiGetAiCreditPayments: jest.fn(),
  ApiPurchaseAiCredits: jest.fn(),
  ApiVerifyAiCreditPurchase: jest.fn(),
  ApiCancelAiCreditPurchase: jest.fn(),
  ApiAdminAiCreditOverview: jest.fn(),
  ApiAdminAiCreditOrganizations: jest.fn(),
  ApiAdminAiCreditUsage: jest.fn(),
  ApiAdminAiCreditSettings: jest.fn(),
  ApiAdminUpdateAiCreditSettings: jest.fn(),
  ApiAdminAdjustAiCredits: jest.fn(),
  ApiAdminSetAiMonthlyLimit: jest.fn(),
  ApiAdminAiCreditPackages: jest.fn(),
  ApiAdminAiCreditPayments: jest.fn(),
}));
jest.mock("../../../api-wrapper/ApiPricingRegions", () => ({ ApiDetectPricingCountry: jest.fn(() => Promise.resolve({ isSuccess: false })) }));
jest.mock("../../../common/helper/toast/Toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, BarChart: Stub, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});
jest.mock("../../../components/ui/AppTooltip", () => ({ AppTooltip: ({ children }) => children }));

const wallet = { monthlyLimit: 1000, limitSource: "PLAN", allocated: 1000, used: 100, monthlyUsed: 100, monthlyAvailable: 900, purchasedBalance: 0, reserved: 0, available: 900, periodStart: "2026-11-01T00:00:00.000Z", nextResetAt: "2026-12-01T00:00:00.000Z" };
const summary = (over = {}) => ({ wallet, tokensThisPeriod: { input: 1, output: 1, total: 2 }, requestsThisPeriod: 1, byFeature: [], byDay: [], enforcementEnabled: true, usageLogRetentionDays: 90, canPurchase: false, canViewPayments: false, ...over });
const requestRow = { _id: "r1", createdAt: "2026-11-20T10:00:00Z", feature: "AI_ASSISTANT", status: "SETTLED", credits: 4, inputTokens: 1000, outputTokens: 500, models: ["claude-haiku-5-5"], user: { name: "Asha" } };
const dailyRow = { _id: "d1", day: "2026-08-10T00:00:00.000Z", feature: "LISTING_OPTIMIZATION", status: "SETTLED", requests: 7, credits: 61.25, inputTokens: 35000, outputTokens: 9000, totalTokens: 44000, images: 0, backgroundRequests: 0, models: ["gemini-3.8-flash", "gpt-4o-mini"], user: { name: "Rahul" } };
const settings = { enforcementEnabled: true, defaultMonthlyCredits: 500, inputCreditsPer1K: 1, outputCreditsPer1K: 4, minimumChargePerRequest: 0, creditsPerImage: 10, modelRates: [], featureReservePlans: [], usageLogRetentionDays: 90 };

beforeEach(() => {
  jest.clearAllMocks();
  __resetAiCreditCache();
  Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary() });
  Api.ApiGetAiCreditUsage.mockImplementation(async (body) => (body.view === "daily" ? { isSuccess: true, data: [dailyRow], totalRecords: 1, view: "daily" } : { isSuccess: true, data: [requestRow], totalRecords: 1 }));
  Api.ApiGetAiCreditTransactions.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0 });
  Api.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: [], canPurchase: false } });
  Api.ApiGetAiCreditPayments.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0 });
  Api.ApiAdminAiCreditSettings.mockResolvedValue({ isSuccess: true, data: settings });
  Api.ApiAdminAiCreditOverview.mockResolvedValue({ isSuccess: false });
  Api.ApiAdminAiCreditUsage.mockImplementation(async (body) => (body.view === "daily" ? { isSuccess: true, data: [{ ...dailyRow, organization: { name: "Acme Retail" } }], totalRecords: 1 } : { isSuccess: true, data: [{ ...requestRow, organization: { name: "Acme Retail" } }], totalRecords: 1 }));
});

describe("Super Admin: usage history retention setting", () => {
  test("shows the saved days, quick choices and saves a whole number", () => {
    const onSave = jest.fn();
    render(<AiCreditSettingsForm settings={settings} onSave={onSave} saving={false} />);
    const field = screen.getByLabelText("Keep request-by-request logs for (days)");
    expect(field).toHaveValue(90);
    expect(screen.getByText(/requests older than 90 days are combined into one daily total per user and AI model/)).toBeInTheDocument();
    expect(screen.getByText(/Wallet transactions .* are never combined or deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(field).toHaveValue(30);
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ usageLogRetentionDays: 30 }));
  });

  test("0 keeps every request (combining and deleting are off)", () => {
    const onSave = jest.fn();
    render(<AiCreditSettingsForm settings={settings} onSave={onSave} saving={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    expect(screen.getByLabelText("Keep request-by-request logs for (days)")).toHaveValue(0);
    expect(screen.getByText("Every AI request is kept on its own. The history can grow large over time.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ usageLogRetentionDays: 0 }));
  });

  test("only whole days from 0 to 3,650 can be saved", () => {
    const t = (s, v) => s.replace("{{max}}", v?.max);
    const base = { ...settings, defaultMonthlyCredits: "500", inputCreditsPer1K: "1", outputCreditsPer1K: "4", minimumChargePerRequest: "0", creditsPerImage: "10" };
    for (const ok of ["0", "30", "3650"]) expect(validateSettings({ ...base, usageLogRetentionDays: ok }, t)).toEqual({});
    for (const bad of ["-1", "1.5", "", "3651"]) expect(validateSettings({ ...base, usageLogRetentionDays: bad }, t)).toEqual({ usageLogRetentionDays: "Enter whole days from 0 to 3650" });
    const onSave = jest.fn();
    render(<AiCreditSettingsForm settings={settings} onSave={onSave} saving={false} />);
    fireEvent.change(screen.getByLabelText("Keep request-by-request logs for (days)"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter whole days from 0 to 3650")).toBeInTheDocument();
  });
});

describe("AI usage history: each request or daily totals", () => {
  test("user page: switch to daily totals loads and shows the combined records", async () => {
    render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);
    await screen.findByRole("row", { name: /claude-haiku-5-5/ });
    expect(screen.getByText(/Requests older than 90 days are combined into daily totals per user and AI model/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "daily" } });
    const row = await screen.findByTestId("ai-daily-usage-row");
    expect(Api.ApiGetAiCreditUsage).toHaveBeenLastCalledWith(expect.objectContaining({ view: "daily", pageNo: 1 }));
    expect(within(row).getByText("10 Aug 2026")).toBeInTheDocument();
    expect(within(row).getByText("7")).toBeInTheDocument(); // requests
    expect(within(row).getByText("44,000")).toBeInTheDocument(); // total tokens
    expect(within(row).getByText("61.25")).toBeInTheDocument();
    expect(within(row).getByText("gemini-3.8-flash")).toBeInTheDocument();
    expect(within(row).getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(within(row).getByText("35,000 in · 9,000 out")).toBeInTheDocument();
    expect(screen.getByText("Older AI requests combined into daily totals per user and AI model.")).toBeInTheDocument();
    // Filters still apply in the daily view
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "SETTLED" } });
    await waitFor(() => expect(Api.ApiGetAiCreditUsage).toHaveBeenLastCalledWith(expect.objectContaining({ view: "daily", status: "SETTLED" })));
  });

  test("no retention note when every request is kept (retention 0)", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary({ usageLogRetentionDays: 0 }) });
    render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);
    await screen.findByRole("row", { name: /claude-haiku-5-5/ });
    expect(screen.queryByText(/are combined into daily totals/)).not.toBeInTheDocument();
  });

  test("Super Admin usage log: daily totals across organizations", async () => {
    render(<AiCreditsAdmin />);
    fireEvent.click(await screen.findByRole("tab", { name: "Usage log" }));
    await screen.findByRole("row", { name: /claude-haiku-5-5/ });
    expect(await screen.findByText(/Requests older than 90 days/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "daily" } });
    const row = await screen.findByTestId("ai-daily-usage-row");
    expect(Api.ApiAdminAiCreditUsage).toHaveBeenLastCalledWith(expect.objectContaining({ view: "daily" }));
    expect(within(row).getByText("Acme Retail")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Organization" })).toBeInTheDocument();
  });

  test("daily table: not-charged totals show no credits; empty state explains when rows appear", () => {
    const { unmount } = render(<DailyUsageTable rows={[{ ...dailyRow, _id: "d2", status: "RELEASED", credits: 0 }]} loading={false} />);
    const row = screen.getByTestId("ai-daily-usage-row");
    expect(within(row).getByText("Not charged")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
    unmount();
    render(<DailyUsageTable rows={[]} loading={false} />);
    expect(screen.getByText("No daily totals yet. Requests are combined once they are older than the retention period.")).toBeInTheDocument();
  });

  test("retention note only when retention is on", () => {
    const { container, rerender } = render(<RetentionNote days={30} />);
    expect(container).toHaveTextContent("Requests older than 30 days");
    rerender(<RetentionNote days={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
