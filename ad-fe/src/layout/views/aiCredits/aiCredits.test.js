import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import * as Api from "../../../api-wrapper/ApiAiCredits";
import AiCreditsPage from "./AiCreditsPage";
import AiCreditBadge from "../../../helper/aiCredits/AiCreditBadge";
import AiCreditSettingsForm, { previewCost, validateSettings } from "./admin/AiCreditSettingsForm";
import { AdjustCreditsModal, MonthlyLimitModal } from "./admin/AiCreditAdminModals";
import { __resetAiCreditCache, creditLevel, creditsExhaustedHtml, handleAiCreditResponse, isCreditsExhausted, newAiRequestId, notifyAiCreditsChanged, AI_CREDITS_CHANGED } from "../../../helper/aiCredits/aiCredits";
import AiCreditCostNote from "../../../helper/aiCredits/AiCreditCostNote";

jest.mock("react-dom/test-utils", () => ({ ...jest.requireActual("react-dom/test-utils"), act: require("react").act }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v?.[k] ?? `{{${k}}}`)), i18n: { language: "en" } }),
}));
jest.mock("i18next", () => ({ t: (s) => s }));
jest.mock("../../../api-wrapper/ApiAiCredits", () => ({
  ApiGetAiCreditSummary: jest.fn(),
  ApiGetAiCreditUsage: jest.fn(),
  ApiGetAiCreditTransactions: jest.fn(),
}));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, BarChart: Stub, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});
jest.mock("../../../components/ui/AppTooltip", () => ({ AppTooltip: ({ children }) => children }));

const wallet = (over = {}) => ({ monthlyLimit: 1000, limitSource: "PLAN", allocated: 1000, used: 250.5, reserved: 0, available: 749.5, periodStart: "2026-11-01T00:00:00.000Z", nextResetAt: "2026-12-01T00:00:00.000Z", ...over });
const summary = (over = {}) => ({
  wallet: wallet(over.wallet),
  usagePct: 25,
  tokensThisPeriod: { input: 120000, output: 30000, total: 150000 },
  requestsThisPeriod: 14,
  byFeature: [{ feature: "AI_ASSISTANT", credits: 200, requests: 10, inputTokens: 100000, outputTokens: 20000 }, { feature: "LISTING_OPTIMIZATION", credits: 50.5, requests: 4, inputTokens: 20000, outputTokens: 10000 }],
  byDay: [{ date: "2026-11-03", credits: 20, requests: 2 }],
  enforcementEnabled: true,
  rates: { inputCreditsPer1K: 1, outputCreditsPer1K: 4, creditsPerImage: 10 },
  ...over,
});
const usageRow = { _id: "u1", createdAt: "2026-11-20T10:00:00Z", feature: "LISTING_OPTIMIZATION", status: "SETTLED", credits: 12.4, inputTokens: 4000, outputTokens: 2100, models: ["gemini-3.8-flash", "gpt-4o-mini"], user: { name: "Asha" } };
const txRow = { _id: "t1", createdAt: "2026-11-02T10:00:00Z", type: "ADJUSTMENT", credits: 150, balanceAfter: 1150, note: "Goodwill", user: { name: "Owner" } };

beforeEach(() => {
  jest.clearAllMocks();
  __resetAiCreditCache();
  Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary() });
  Api.ApiGetAiCreditUsage.mockResolvedValue({ isSuccess: true, data: [usageRow], totalRecords: 1 });
  Api.ApiGetAiCreditTransactions.mockResolvedValue({ isSuccess: true, data: [txRow], totalRecords: 1 });
});

describe("helpers", () => {
  test("credit level, exhausted detection, request ids", () => {
    expect(creditLevel(wallet())).toBe("ok");
    expect(creditLevel(wallet({ available: 100 }))).toBe("low");
    expect(creditLevel(wallet({ available: 0 }))).toBe("empty");
    expect(isCreditsExhausted({ code: "AI_CREDITS_EXHAUSTED" })).toBe(true);
    expect(isCreditsExhausted({ error: { code: "AI_CREDITS_EXHAUSTED" } })).toBe(true);
    expect(isCreditsExhausted({ isSuccess: false })).toBe(false);
    expect(newAiRequestId()).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  });

  test("out-of-credits chat reply links to the credits page", () => {
    const html = creditsExhaustedHtml();
    expect(html).toContain('href="/ai-credits"');
    expect(html).toContain("You&#39;ve run out of AI credits for this month.");
  });
});

describe("AiCreditBadge", () => {
  const renderBadge = () =>
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <Routes>
          <Route path="/x" element={<AiCreditBadge />} />
          <Route path="/ai-credits" element={<div>credits page</div>} />
        </Routes>
      </MemoryRouter>,
    );

  test("shows what is left and opens the credits page", async () => {
    renderBadge();
    const btn = await screen.findByRole("button", { name: "AI credits: 749.5 left" });
    expect(btn).toHaveTextContent("749.5 credits left");
    fireEvent.click(btn);
    expect(screen.getByText("credits page")).toBeInTheDocument();
  });

  test("empty wallet reads 'No AI credits left' and refreshes on notify", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValueOnce({ isSuccess: true, data: summary({ wallet: { available: 0 } }) });
    renderBadge();
    expect(await screen.findByText("No AI credits left")).toBeInTheDocument();
    Api.ApiGetAiCreditSummary.mockResolvedValueOnce({ isSuccess: true, data: summary({ wallet: { available: 500 } }) });
    await act(async () => notifyAiCreditsChanged());
    expect(await screen.findByText("500 credits left")).toBeInTheDocument();
  });

  test("hidden when the wallet can't be loaded", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValueOnce({ isSuccess: false });
    const { container } = renderBadge();
    await waitFor(() => expect(Api.ApiGetAiCreditSummary).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AiCreditsPage", () => {
  const renderPage = () => render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);

  test("balance, KPIs, feature split and AI request history", async () => {
    renderPage();
    expect(screen.getByRole("status")).toBeInTheDocument();
    const meter = await screen.findByText("749.5");
    expect(meter).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("From your plan")).toBeInTheDocument();
    expect(screen.getByText("14 AI requests")).toBeInTheDocument();
    expect(screen.getByText("150K")).toBeInTheDocument();
    expect(screen.getByText("200 · 80%")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /gemini-3\.8-flash, gpt-4o-mini/ });
    expect(within(row).getByText("Asha")).toBeInTheDocument();
    expect(within(row).getByText("12.4")).toBeInTheDocument();
    expect(within(row).getByText("Charged")).toBeInTheDocument();
  });

  test("credit history tab and filters reload with the filter", async () => {
    renderPage();
    await screen.findByText("749.5");
    fireEvent.click(screen.getByRole("tab", { name: "Credit history" }));
    expect(await screen.findByText(/Goodwill/)).toBeInTheDocument();
    expect(screen.getByText("+150")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "ADJUSTMENT" } });
    await waitFor(() => expect(Api.ApiGetAiCreditTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ type: "ADJUSTMENT", pageNo: 1 })));
  });

  test("paused limits banner and empty wallet message", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary({ enforcementEnabled: false }) });
    renderPage();
    expect(await screen.findByText(/Credit limits are paused right now/)).toBeInTheDocument();
  });

  test("empty wallet explains that AI is paused", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary({ wallet: { available: 0, used: 1000 } }) });
    renderPage();
    expect(await screen.findByText("AI features are paused until the credits refill or an administrator adds more.")).toBeInTheDocument();
  });

  test("error state with retry", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValueOnce({ isSuccess: false });
    renderPage();
    expect(await screen.findByText("Couldn't load your AI credits.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("749.5")).toBeInTheDocument();
  });
});

describe("Super Admin settings", () => {
  const settings = { enforcementEnabled: true, defaultMonthlyCredits: 500, inputCreditsPer1K: 1, outputCreditsPer1K: 4, minimumChargePerRequest: 0, creditsPerImage: 10, featureReserves: { AI_ASSISTANT: 20, LISTING_OPTIMIZATION: 25 }, modelRates: [{ model: "gpt-4o-mini", inputCreditsPer1K: 0.2, outputCreditsPer1K: 0.8 }] };

  test("cost preview uses the same longest-prefix rule as the server", () => {
    const form = { ...settings, modelRates: [{ model: "gpt-4o", inputCreditsPer1K: 2, outputCreditsPer1K: 8 }, ...settings.modelRates] };
    expect(previewCost(form, "gpt-4o-mini-2024", 10000, 1000)).toBe(2.8);
    expect(previewCost(form, "claude-haiku-5-5", 10000, 1000)).toBe(14);
    expect(previewCost({ ...form, minimumChargePerRequest: 20 }, "claude", 1000, 0)).toBe(20);
  });

  test("validation catches negatives, blanks and duplicate models", () => {
    const t = (s) => s;
    const errs = validateSettings({ ...settings, inputCreditsPer1K: "-1", modelRates: [{ model: "", inputCreditsPer1K: "1", outputCreditsPer1K: "1" }, { model: "A", inputCreditsPer1K: "1", outputCreditsPer1K: "x" }, { model: "a", inputCreditsPer1K: "1", outputCreditsPer1K: "1" }] }, t);
    expect(errs).toEqual({ inputCreditsPer1K: "Enter 0 or more", "model.0": "Model name is required", "modelRate.1": "Enter 0 or more", "model.2": "This model is listed twice" });
  });

  test("saves numbers, including a new model rate", () => {
    const onSave = jest.fn();
    render(<AiCreditSettingsForm settings={settings} onSave={onSave} saving={false} />);
    fireEvent.change(screen.getByLabelText("Credits per 1,000 output tokens"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Add model/ }));
    const models = screen.getAllByLabelText("Model");
    fireEvent.change(models[models.length - 1], { target: { value: "claude-" } });
    fireEvent.click(screen.getByRole("switch", { name: "Enforce credit limits" }));
    fireEvent.change(screen.getByLabelText("Credits per generated image"), { target: { value: "12" } });
    expect(screen.getByText("A+ Content images: basic (5) = 60 credits, premium (7) = 84 credits, plus the text.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ enforcementEnabled: false, outputCreditsPer1K: 5, creditsPerImage: 12, modelRates: [{ model: "gpt-4o-mini", inputCreditsPer1K: 0.2, outputCreditsPer1K: 0.8 }, { model: "claude-", inputCreditsPer1K: 1, outputCreditsPer1K: 5 }] }));
  });

  test("invalid input blocks saving", () => {
    const onSave = jest.fn();
    render(<AiCreditSettingsForm settings={settings} onSave={onSave} saving={false} />);
    fireEvent.change(screen.getByLabelText("Standard monthly credits"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText("Enter 0 or more").length).toBeGreaterThan(0);
  });
});

describe("Super Admin dialogs", () => {
  const org = { organizationId: "o1", organizationName: "Acme", available: 300, monthlyLimit: 1000, monthlyLimitOverride: null, plan: { name: "Pro", aiMonthlyCredits: 1000 } };

  test("adjust credits needs a positive amount and a reason; remove sends a negative number", () => {
    const onSave = jest.fn();
    render(<AdjustCreditsModal open org={org} onClose={() => {}} onSave={onSave} saving={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(screen.getByText("Enter a number of credits greater than 0")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Credits"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(screen.getByText("A reason is required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Remove credits" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Refund reversal" } });
    expect(screen.getByText("Applies to this month only. Available after the change: 250 credits.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith({ organizationId: "o1", credits: -50, note: "Refund reversal" });
  });

  test("monthly allowance: custom value or back to the plan", () => {
    const onSave = jest.fn();
    render(<MonthlyLimitModal open org={org} defaultMonthlyCredits={500} onClose={() => {}} onSave={onSave} saving={false} />);
    expect(screen.getByText("Pro: 1,000 credits a month")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Custom allowance for this organization/));
    fireEvent.change(screen.getByLabelText("Credits a month"), { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenLastCalledWith({ organizationId: "o1", monthlyLimit: 2500 });
    fireEvent.click(screen.getByLabelText(/Use the plan's allowance/));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenLastCalledWith({ organizationId: "o1", monthlyLimit: null });
  });
});

describe("other AI features (A+ Content, listing generation)", () => {
  test("API responses: badges refresh, and out-of-credits gets a translated message", () => {
    const seen = jest.fn();
    window.addEventListener(AI_CREDITS_CHANGED, seen);
    expect(handleAiCreditResponse({ isSuccess: true, data: 1 })).toEqual({ isSuccess: true, data: 1 });
    expect(handleAiCreditResponse({ isSuccess: false, code: "AI_CREDITS_EXHAUSTED", message: "server text" }).message).toBe("You've run out of AI credits for this month.");
    expect(handleAiCreditResponse({ isSuccess: false, message: "Product not found" }).message).toBe("Product not found");
    expect(seen).toHaveBeenCalledTimes(3);
    window.removeEventListener(AI_CREDITS_CHANGED, seen);
  });

  test("cost note shows the image cost at the current rate, with the credit badge", async () => {
    render(<MemoryRouter><AiCreditCostNote images={7} /></MemoryRouter>);
    expect(await screen.findByText("Uses AI credits: 70 for the 7 images, plus the text.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI credits: 749.5 left" })).toBeInTheDocument();
  });

  test("usage history shows generated images and background jobs", async () => {
    Api.ApiGetAiCreditUsage.mockResolvedValue({ isSuccess: true, data: [{ ...usageRow, _id: "a1", feature: "APLUS_CONTENT", images: 5, background: true, models: ["gemini-image-batch"] }], totalRecords: 1 });
    render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);
    const row = await screen.findByRole("row", { name: /gemini-image-batch/ });
    expect(within(row).getByText("A+ Content")).toBeInTheDocument();
    expect(within(row).getByText("5 images · Background job")).toBeInTheDocument();
    expect(screen.getByText(/Each AI-generated image \(A\+ Content\) = 10 credits\./)).toBeInTheDocument();
  });
});
