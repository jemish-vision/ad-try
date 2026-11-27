import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as Keys from "../../../api-wrapper/ApiAiKeys";
import * as Credits from "../../../api-wrapper/ApiAiCredits";
import Toast from "../../../common/helper/toast/Toast";
import AiKeysPage, { missingCoverage } from "./AiKeysPage";
import AiCreditsPage from "../aiCredits/AiCreditsPage";
import { UsageTable } from "../aiCredits/aiCreditComponents";
import { aiKeyErrorMessage, aiKeyErrorHtml, handleAiCreditResponse, isAiKeyError, __resetAiCreditCache } from "../../../helper/aiCredits/aiCredits";

jest.mock("react-dom/test-utils", () => ({ ...jest.requireActual("react-dom/test-utils"), act: require("react").act }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v?.[k] ?? `{{${k}}}`)), i18n: { language: "en" } }),
}));
jest.mock("i18next", () => ({ t: (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v?.[k] ?? `{{${k}}}`)) }));
jest.mock("../../../api-wrapper/ApiAiKeys", () => ({
  ApiGetAiKeys: jest.fn(),
  ApiSaveAiKey: jest.fn(),
  ApiValidateAiKey: jest.fn(),
  ApiRemoveAiKey: jest.fn(),
  ApiUpdateAiKeySettings: jest.fn(),
}));
jest.mock("../../../api-wrapper/ApiAiCredits", () => ({
  ApiGetAiCreditSummary: jest.fn(),
  ApiGetAiCreditUsage: jest.fn(),
  ApiGetAiCreditTransactions: jest.fn(),
  ApiGetAiCreditPackages: jest.fn(),
  ApiGetAiCreditPayments: jest.fn(),
  ApiPurchaseAiCredits: jest.fn(),
  ApiVerifyAiCreditPurchase: jest.fn(),
  ApiCancelAiCreditPurchase: jest.fn(),
}));
jest.mock("../../../common/helper/toast/Toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, BarChart: Stub, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});
jest.mock("../../../components/ui/AppTooltip", () => ({ AppTooltip: ({ children }) => children }));
jest.mock("../../../helper/modal/CustomModal", () => ({
  CustomModal: ({ show, title, message, actions }) =>
    show ? (
      <div role="alertdialog" aria-label={title}>
        <p>{message}</p>
        {actions.map((a) => <button key={a.label} type="button" onClick={a.onClick}>{a.label}</button>)}
      </div>
    ) : null,
}));

const FEATURES = { AI_ASSISTANT: ["anthropic"], LISTING_OPTIMIZATION: ["gemini", "openai"], LISTING_GENERATION: ["openai"], APLUS_CONTENT: ["gemini"], CAMPAIGN_ANALYSIS: ["openai", "gemini"] };
const openaiKey = { provider: "openai", keyHint: "sk-proj-…abcd", status: "VALID", statusMessage: null, lastValidatedAt: "2026-11-25T10:00:00Z", lastUsedAt: "2026-11-27T08:00:00Z" };
const overview = ({ settings = { usePersonalKeys: false, allowWalletFallback: false }, keys = { openai: openaiKey }, canManage = true, isDemo = false } = {}) => ({
  isSuccess: true,
  data: {
    settings,
    canManage,
    isDemo,
    featureProviders: FEATURES,
    providers: ["anthropic", "openai", "gemini"].map((p) => ({ provider: p, label: p, key: keys[p] || null, features: Object.entries(FEATURES).filter(([, ps]) => ps.includes(p)).map(([f]) => f) })),
  },
});
const LABEL = { anthropic: "Anthropic (Claude)", openai: "OpenAI", gemini: "Google Gemini" };
const card = (provider) => screen.findByRole("region", { name: LABEL[provider] });
const coverageNote = () => screen.findByRole("status", { name: /These features will/ });

beforeEach(() => {
  jest.clearAllMocks();
  __resetAiCreditCache();
  Keys.ApiGetAiKeys.mockResolvedValue(overview());
  Keys.ApiSaveAiKey.mockResolvedValue({ isSuccess: true, message: "API key saved" });
  Keys.ApiValidateAiKey.mockResolvedValue({ isSuccess: true, data: { status: "VALID" } });
  Keys.ApiRemoveAiKey.mockResolvedValue({ isSuccess: true, message: "API key removed" });
  Keys.ApiUpdateAiKeySettings.mockResolvedValue({ isSuccess: true, message: "Settings saved" });
});

describe("AI API Keys page (owner)", () => {
  test("shows each provider with the masked key, status and the features that use it", async () => {
    render(<AiKeysPage />);
    expect(within(await card("openai")).getByLabelText("Saved key")).toHaveTextContent("sk-proj-…abcd");
    expect(within(await card("openai")).getByText("Working")).toBeInTheDocument();
    expect(within(await card("openai")).getByText("Used by: Optimize with AI, AI listing generation, Campaign AI Analysis")).toBeInTheDocument();
    expect(within(await card("gemini")).getByText("No key saved.")).toBeInTheDocument();
    expect(within(await card("gemini")).getByRole("button", { name: /Add key/ })).toBeInTheDocument();
    expect(screen.getByText("AI runs on the platform's keys and uses your organization's AI credits.")).toBeInTheDocument();
    // Wallet fallback can only change while own keys are on
    expect(screen.getByRole("switch", { name: "Use AI credits when our key can't be used" })).toBeDisabled();
  });

  test("turns own keys on", async () => {
    render(<AiKeysPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "Use our own API keys" }));
    await waitFor(() => expect(Keys.ApiUpdateAiKeySettings).toHaveBeenCalledWith({ usePersonalKeys: true }));
    await waitFor(() => expect(Toast.success).toHaveBeenCalledWith("Settings saved"));
    await waitFor(() => expect(Keys.ApiGetAiKeys).toHaveBeenCalledTimes(2)); // reloaded
  });

  test("turning on without any key explains why", async () => {
    Keys.ApiUpdateAiKeySettings.mockResolvedValue({ isSuccess: false, code: "KEYS_REQUIRED", message: "x" });
    render(<AiKeysPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "Use our own API keys" }));
    await waitFor(() => expect(Toast.error).toHaveBeenCalledWith("Add at least one API key before turning on your own keys."));
  });

  test("adds a key: hidden input, show/hide, checked and saved, then cleared", async () => {
    render(<AiKeysPage />);
    fireEvent.click(within(await card("gemini")).getByRole("button", { name: /Add key/ }));
    const input = await screen.findByLabelText("API key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
    fireEvent.change(input, { target: { value: "  AIzaSyEXAMPLEkey1234567890abcdef  " } });
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /Check and save/ }));
    await waitFor(() => expect(Keys.ApiSaveAiKey).toHaveBeenCalledWith({ provider: "gemini", apiKey: "AIzaSyEXAMPLEkey1234567890abcdef" }));
    await waitFor(() => expect(screen.queryByLabelText("API key")).not.toBeInTheDocument());
    expect(Toast.success).toHaveBeenCalledWith("API key saved");
    expect(document.body).not.toHaveTextContent("AIzaSyEXAMPLEkey1234567890abcdef");
  });

  test("a key the provider rejects stays out and the reason is shown", async () => {
    Keys.ApiSaveAiKey.mockResolvedValue({ isSuccess: false, code: "KEY_REJECTED", provider: "openai", message: "OpenAI rejected this key: Incorrect API key provided: [key]" });
    render(<AiKeysPage />);
    fireEvent.click(within(await card("openai")).getByRole("button", { name: /Replace/ }));
    expect(await screen.findByText("Replace OpenAI key")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-proj-wrongwrongwrong1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Check and save/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("OpenAI rejected this key. Check that it is correct and still active.");
    expect(alert).toHaveTextContent("Incorrect API key provided: [key]");
    expect(screen.getByLabelText("API key")).toBeInTheDocument(); // still open to fix
  });

  test("an empty or badly formatted key is caught", async () => {
    Keys.ApiSaveAiKey.mockResolvedValue({ isSuccess: false, code: "KEY_FORMAT_INVALID", provider: "anthropic" });
    render(<AiKeysPage />);
    fireEvent.click(within(await card("anthropic")).getByRole("button", { name: /Add key/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Check and save/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Paste the API key.");
    expect(Keys.ApiSaveAiKey).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-proj-notanthropic1234567" } });
    fireEvent.click(screen.getByRole("button", { name: /Check and save/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This doesn't look like a valid Anthropic (Claude) key."));
  });

  test("checks a key again and removes one after confirming", async () => {
    Keys.ApiValidateAiKey.mockResolvedValue({ isSuccess: true, data: { status: "QUOTA_EXCEEDED" } });
    render(<AiKeysPage />);
    fireEvent.click(within(await card("openai")).getByRole("button", { name: /Check again/ }));
    await waitFor(() => expect(Keys.ApiValidateAiKey).toHaveBeenCalledWith({ provider: "openai" }));
    await waitFor(() => expect(Toast.error).toHaveBeenCalledWith("OpenAI key: Out of quota"));
    fireEvent.click(within(await card("openai")).getByRole("button", { name: "Remove OpenAI key" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove API key" });
    expect(dialog).toHaveTextContent("The key will be deleted.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(Keys.ApiRemoveAiKey).toHaveBeenCalledWith({ provider: "openai" }));
  });

  test("own keys on: features without a key are listed, with what will happen", async () => {
    Keys.ApiGetAiKeys.mockResolvedValue(overview({ settings: { usePersonalKeys: true, allowWalletFallback: false } }));
    const { unmount } = render(<AiKeysPage />);
    const warn = await coverageNote();
    expect(warn).toHaveTextContent("These features will stop with a message because a key is missing:");
    expect(warn).toHaveTextContent("AI Assistant: needs Anthropic (Claude)");
    expect(warn).toHaveTextContent("Optimize with AI: needs Google Gemini");
    expect(warn).toHaveTextContent("A+ Content: needs Google Gemini");
    expect(warn).not.toHaveTextContent("Campaign AI Analysis"); // OpenAI alone is enough
    expect(screen.getByRole("switch", { name: "Use AI credits when our key can't be used" })).toBeEnabled();
    unmount();
    Keys.ApiGetAiKeys.mockResolvedValue(overview({ settings: { usePersonalKeys: true, allowWalletFallback: true } }));
    render(<AiKeysPage />);
    expect(await coverageNote()).toHaveTextContent("These features will use AI credits because a key is missing:");
  });

  test("coverage rules", () => {
    const data = overview({ keys: { gemini: { provider: "gemini" } } }).data;
    expect(missingCoverage(data).map((c) => c.feature)).toEqual(["AI_ASSISTANT", "LISTING_OPTIMIZATION", "LISTING_GENERATION"]);
    const none = overview({ keys: {} }).data;
    expect(missingCoverage(none).find((c) => c.feature === "CAMPAIGN_ANALYSIS")).toEqual({ feature: "CAMPAIGN_ANALYSIS", missing: ["openai", "gemini"], anyOne: true });
  });
});

describe("AI API Keys page (others)", () => {
  test("team members see the status but no buttons, and the switches are locked", async () => {
    Keys.ApiGetAiKeys.mockResolvedValue(overview({ canManage: false, settings: { usePersonalKeys: true, allowWalletFallback: false } }));
    render(<AiKeysPage />);
    expect(await screen.findByText("Only the organization owner can manage AI API keys.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add key|Replace|Check again|Remove/ })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Use our own API keys" })).toBeDisabled();
    expect(within(await card("openai")).getByLabelText("Saved key")).toHaveTextContent("sk-proj-…abcd");
  });

  test("demo accounts are told keys can't be changed", async () => {
    Keys.ApiGetAiKeys.mockResolvedValue(overview({ canManage: false, isDemo: true }));
    render(<AiKeysPage />);
    expect(await screen.findByText("API keys can't be changed in demo mode.")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });
});

describe("own-key errors in the AI features", () => {
  test("translated messages name the provider; other responses are left alone", () => {
    const res = { isSuccess: false, code: "PERSONAL_KEY_INVALID", provider: "gemini", message: "server text" };
    expect(isAiKeyError(res)).toBe(true);
    expect(aiKeyErrorMessage(res)).toBe("Google Gemini rejected your organization's API key (invalid, expired or revoked). Update it on the AI API Keys page.");
    expect(handleAiCreditResponse(res).message).toBe(aiKeyErrorMessage(res));
    expect(aiKeyErrorMessage({ code: "PERSONAL_KEY_MISSING", provider: "openai" })).toMatch(/^Your organization uses its own AI API keys, but no OpenAI key is saved/);
    expect(aiKeyErrorMessage({ error: { code: "PERSONAL_KEY_RATE_LIMITED", provider: "anthropic" } })).toBe("Your Anthropic (Claude) key has hit its rate limit. Please try again in a minute.");
    expect(aiKeyErrorMessage({ code: "PERSONAL_KEY_QUOTA" })).toMatch(/Your your AI provider account/);
    expect(isAiKeyError({ isSuccess: false, code: "SOMETHING_ELSE" })).toBe(false);
    expect(handleAiCreditResponse({ isSuccess: true, data: 1 })).toEqual({ isSuccess: true, data: 1 });
  });

  test("chat reply links to the AI API Keys page and escapes text", () => {
    const html = aiKeyErrorHtml({ code: "PERSONAL_KEY_MISSING", provider: "anthropic" });
    expect(html).toContain('<a href="/ai-keys">Open AI API Keys</a>');
    expect(html).toContain("no Anthropic (Claude) key is saved");
  });

  test("usage history marks requests that ran on the organization's own key", () => {
    const row = (id, keySource) => ({ _id: id, createdAt: "2026-11-25T10:00:00Z", feature: "LISTING_OPTIMIZATION", status: "SETTLED", credits: 0, inputTokens: 1000, outputTokens: 200, models: ["gpt-4o-mini"], keySource, user: { name: "Asha" } });
    render(<UsageTable rows={[row("a", "PERSONAL"), row("b", "MIXED"), row("c", "PLATFORM")]} loading={false} />);
    const tags = screen.getAllByTestId("ai-key-source").map((t) => t.textContent);
    expect(tags).toEqual(["Your key", "Your key + credits"]);
    const rowsEls = screen.getAllByRole("row").slice(1);
    expect(rowsEls[0]).toHaveTextContent("Completed"); // own key: not "Charged"
    expect(rowsEls[0]).not.toHaveTextContent("Charged");
    expect(rowsEls[1]).toHaveTextContent("Charged");
    expect(rowsEls[2]).toHaveTextContent("Charged");
  });

  test("AI Credits page says when the organization uses its own keys", async () => {
    const wallet = { monthlyLimit: 1000, limitSource: "PLAN", allocated: 1000, used: 0, monthlyUsed: 0, monthlyAvailable: 1000, purchasedBalance: 0, reserved: 0, available: 1000, periodStart: "2026-11-01T00:00:00Z", nextResetAt: "2026-12-01T00:00:00Z" };
    Credits.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: { wallet, tokensThisPeriod: { input: 0, output: 0, total: 0 }, byFeature: [], byDay: [], enforcementEnabled: true, ownKeys: { usePersonalKeys: true, allowWalletFallback: false } } });
    Credits.ApiGetAiCreditUsage.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0 });
    Credits.ApiGetAiCreditTransactions.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0 });
    Credits.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: [] } });
    render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);
    expect(await screen.findByText(/Your organization uses its own AI API keys. Requests on your keys don't use credits./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage AI API keys" })).toHaveAttribute("href", "/ai-keys");
  });
});
