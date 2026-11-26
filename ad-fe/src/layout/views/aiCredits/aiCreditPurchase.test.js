import React from "react";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import * as Api from "../../../api-wrapper/ApiAiCredits";
import Toast from "../../../common/helper/toast/Toast";
import BuyCreditsSection from "./BuyCreditsSection";
import PurchaseResultBanner, { usePurchaseResult } from "./PurchaseResultBanner";
import AiCreditsPage from "./AiCreditsPage";
import { CreditMeter } from "./aiCreditComponents";
import CreditPackagesAdmin, { PaymentsLog, validatePackageForm } from "./admin/CreditPackagesAdmin";
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
  ApiAdminAiCreditPackages: jest.fn(),
  ApiAdminCreateAiCreditPackage: jest.fn(),
  ApiAdminUpdateAiCreditPackage: jest.fn(),
  ApiAdminDeleteAiCreditPackage: jest.fn(),
  ApiAdminAiCreditPayments: jest.fn(),
}));
jest.mock("../../../common/helper/toast/Toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock("recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, BarChart: Stub, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});
jest.mock("../../../components/ui/AppTooltip", () => ({ AppTooltip: ({ children }) => children }));
jest.mock("../../../helper/modal/CustomModal", () => ({
  CustomModal: ({ show, title, actions }) =>
    show ? (
      <div role="alertdialog" aria-label={title}>
        {actions.map((a) => <button key={a.label} type="button" onClick={a.onClick}>{a.label}</button>)}
      </div>
    ) : null,
}));

const PACKAGES = [
  { _id: "p1", name: "Starter", credits: 500, price: 9, currency: "USD", pricePerCredit: 0.018, isPopular: false },
  { _id: "p2", name: "Growth", credits: 2000, price: 29, currency: "USD", pricePerCredit: 0.0145, isPopular: true, description: "For busy teams." },
];
const wallet = (over = {}) => ({ monthlyLimit: 1000, limitSource: "PLAN", allocated: 1000, used: 400, monthlyUsed: 400, monthlyAvailable: 600, purchasedBalance: 0, reserved: 0, available: 600, periodStart: "2026-11-01T00:00:00.000Z", nextResetAt: "2026-12-01T00:00:00.000Z", ...over });
const summary = (over = {}) => ({ wallet: wallet(over.wallet), tokensThisPeriod: { input: 1, output: 1, total: 2 }, requestsThisPeriod: 3, byFeature: [], byDay: [], enforcementEnabled: true, rates: { inputCreditsPer1K: 1, outputCreditsPer1K: 4, creditsPerImage: 10 }, canPurchase: true, canViewPayments: true, ...over });
const payment = { _id: "pay1", createdAt: "2026-11-20T10:00:00Z", packageName: "Growth", credits: 2000, amount: 29, currency: "USD", status: "PAID", user: { name: "Owner" } };

beforeEach(() => {
  jest.clearAllMocks();
  __resetAiCreditCache();
  Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary() });
  Api.ApiGetAiCreditUsage.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0 });
  Api.ApiGetAiCreditTransactions.mockResolvedValue({ isSuccess: true, data: [], totalRecords: 0 });
  Api.ApiGetAiCreditPayments.mockResolvedValue({ isSuccess: true, data: [payment], totalRecords: 1 });
  Api.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: PACKAGES, canPurchase: true } });
});

describe("Buy more credits", () => {
  test("owner buys a package: checkout started server-side, then sent to Stripe", async () => {
    const redirect = jest.fn();
    Api.ApiPurchaseAiCredits.mockResolvedValue({ isSuccess: true, data: { url: "https://checkout.stripe.com/c/cs_1", paymentId: "pay1" } });
    render(<BuyCreditsSection redirect={redirect} />);
    const cards = await screen.findAllByTestId("ai-credit-package");
    expect(cards).toHaveLength(2);
    expect(within(cards[1]).getByText("Most popular")).toBeInTheDocument();
    expect(within(cards[1]).getByText(/Best value/)).toBeInTheDocument();
    expect(within(cards[1]).getByText("$14.50 per 1,000 credits", { exact: false })).toBeInTheDocument();
    fireEvent.click(within(cards[1]).getByRole("button", { name: "Buy for $29.00" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/cs_1"));
    expect(Api.ApiPurchaseAiCredits).toHaveBeenCalledWith({ packageId: "p2" });
  });

  test("checkout can't start: error shown and buttons usable again", async () => {
    Api.ApiPurchaseAiCredits.mockResolvedValue({ isSuccess: false, message: "This credit package is no longer available." });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    const [card] = await screen.findAllByTestId("ai-credit-package");
    fireEvent.click(within(card).getByRole("button"));
    await waitFor(() => expect(Toast.error).toHaveBeenCalledWith("This credit package is no longer available."));
    expect(within(card).getByRole("button")).toBeEnabled();
  });

  test("team members see the packages but can't buy", async () => {
    Api.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: PACKAGES, canPurchase: false } });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    expect(await screen.findByText("Only the organization owner can buy credits. Ask your owner if your team needs more.")).toBeInTheDocument();
    screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
  });

  test("demo mode: buying disabled, and the buttons are marked for the demo guard", async () => {
    Api.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: PACKAGES, canPurchase: false, isDemo: true } });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    expect(await screen.findByText("Buying credits isn't available in demo mode.")).toBeInTheDocument();
    screen.getAllByRole("button").forEach((b) => expect(b).toHaveAttribute("data-demo-block"));
  });

  test("no packages on sale: the section is hidden", async () => {
    Api.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: [], canPurchase: true } });
    const { container } = render(<BuyCreditsSection redirect={jest.fn()} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("returning from Stripe", () => {
  const run = (search, opts) => renderHook(() => usePurchaseResult(search, { pollMs: 1, ...opts }));

  test("paid: credits confirmed", async () => {
    Api.ApiVerifyAiCreditPurchase.mockResolvedValue({ isSuccess: true, data: { status: "PAID", payment: { credits: 2000 } } });
    const onDone = jest.fn();
    const { result } = run("?purchase=success&session_id=cs_1", { onDone });
    await waitFor(() => expect(result.current[0]).toEqual({ status: "PAID", credits: 2000 }));
    expect(Api.ApiVerifyAiCreditPurchase).toHaveBeenCalledWith({ sessionId: "cs_1" });
    expect(onDone).toHaveBeenCalledWith({ status: "PAID", credits: 2000 });
  });

  test("still processing: checks again until the payment is confirmed", async () => {
    Api.ApiVerifyAiCreditPurchase
      .mockResolvedValueOnce({ isSuccess: true, data: { status: "PENDING" } })
      .mockResolvedValueOnce({ isSuccess: true, data: { status: "PENDING" } })
      .mockResolvedValueOnce({ isSuccess: true, data: { status: "PAID", credits: 500 } });
    const { result } = run("?purchase=success&session_id=cs_2");
    await waitFor(() => expect(result.current[0]?.status).toBe("PAID"));
    expect(Api.ApiVerifyAiCreditPurchase).toHaveBeenCalledTimes(3);
  });

  test("bank payment still pending after the checks: shown as processing", async () => {
    Api.ApiVerifyAiCreditPurchase.mockResolvedValue({ isSuccess: true, data: { status: "PENDING" } });
    const { result } = run("?purchase=success&session_id=cs_3", { maxPolls: 2 });
    await waitFor(() => expect(result.current[0]?.status).toBe("PENDING"));
    render(<PurchaseResultBanner result={result.current} />);
    expect(screen.getByText("Your payment is being processed. The credits will be added automatically as soon as it clears.")).toBeInTheDocument();
  });

  test("cancelled: the checkout is closed and the buyer told nothing was charged", async () => {
    Api.ApiCancelAiCreditPurchase.mockResolvedValue({ isSuccess: true, data: { status: "CANCELLED" } });
    const { result } = run("?purchase=cancelled&payment_id=pay9");
    await waitFor(() => expect(result.current[0]?.status).toBe("CANCELLED"));
    expect(Api.ApiCancelAiCreditPurchase).toHaveBeenCalledWith({ paymentId: "pay9" });
    render(<PurchaseResultBanner result={result.current} />);
    expect(screen.getByText("Payment cancelled. You weren't charged.")).toBeInTheDocument();
  });

  test("verification error: tells the buyer credits will still arrive if they were charged", async () => {
    Api.ApiVerifyAiCreditPurchase.mockResolvedValue({ isSuccess: false });
    const { result } = run("?purchase=success&session_id=cs_4");
    await waitFor(() => expect(result.current[0]?.status).toBe("ERROR"));
    render(<PurchaseResultBanner result={result.current} />);
    expect(screen.getByText(/If you were charged, the credits will be added automatically/)).toBeInTheDocument();
  });

  test("AI Credits page: confirms the payment, shows the result and cleans the URL", async () => {
    Api.ApiVerifyAiCreditPurchase.mockResolvedValue({ isSuccess: true, data: { status: "PAID", payment: { credits: 2000 } } });
    let currentSearch = null;
    const Probe = () => {
      currentSearch = useLocation().search;
      return null;
    };
    render(
      <MemoryRouter initialEntries={["/ai-credits?purchase=success&session_id=cs_9"]}>
        <Routes>
          <Route path="/ai-credits" element={<><AiCreditsPage /><Probe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Payment received: 2,000 credits were added to your wallet.")).toBeInTheDocument();
    await waitFor(() => expect(currentSearch).toBe(""));
  });
});

describe("balances and payment history", () => {
  test("monthly and purchased credits shown separately", () => {
    render(<CreditMeter wallet={wallet({ purchasedBalance: 1650, available: 2250 })} />);
    expect(screen.getByText("2,250")).toBeInTheDocument();
    expect(screen.getByText("Monthly: 600 of 1,000 left")).toBeInTheDocument();
    expect(screen.getByText("Purchased: 1,650 (never expire)")).toBeInTheDocument();
  });

  test("owner sees the Payments tab with each purchase", async () => {
    render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "Payments" }));
    const row = await screen.findByRole("row", { name: /Growth/ });
    expect(within(row).getByText("$29.00")).toBeInTheDocument();
    expect(within(row).getByText("Paid")).toBeInTheDocument();
  });

  test("team members don't see payments", async () => {
    Api.ApiGetAiCreditSummary.mockResolvedValue({ isSuccess: true, data: summary({ canPurchase: false, canViewPayments: false }) });
    render(<MemoryRouter><AiCreditsPage /></MemoryRouter>);
    await screen.findByRole("tab", { name: "Credit history" });
    expect(screen.queryByRole("tab", { name: "Payments" })).not.toBeInTheDocument();
    expect(Api.ApiGetAiCreditPayments).not.toHaveBeenCalled();
  });
});

describe("Super Admin: credit packages", () => {
  const regions = [{ _id: "r-in", name: "India", currency: "INR", countries: ["IN"], isActive: true }];
  const pkg = { _id: "p2", name: "Growth", credits: 2000, price: 29, currency: "USD", isActive: true, isPopular: true, regionalPrices: [{ regionId: "r-in", price: 1999 }] };
  beforeEach(() => {
    Api.ApiAdminAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: [pkg], regions } });
    Api.ApiAdminCreateAiCreditPackage.mockResolvedValue({ isSuccess: true, message: "Credit package created" });
    Api.ApiAdminUpdateAiCreditPackage.mockResolvedValue({ isSuccess: true, message: "Credit package updated" });
    Api.ApiAdminDeleteAiCreditPackage.mockResolvedValue({ isSuccess: true, message: "Credit package deleted" });
  });

  test("form validation", () => {
    const t = (s) => s;
    expect(validatePackageForm({ name: " ", credits: "0", price: "", regionalPrices: { r1: "-5", r2: "" } }, t)).toEqual({
      name: "Package name is required", credits: "Credits must be 1 or more", price: "Price must be greater than 0", "region.r1": "Price must be greater than 0",
    });
  });

  test("lists packages with their regional prices", async () => {
    render(<CreditPackagesAdmin reloadKey={0} />);
    const row = await screen.findByRole("row", { name: /Growth/ });
    expect(within(row).getByText("$29.00")).toBeInTheDocument();
    expect(within(row).getByText(/India/)).toBeInTheDocument();
    expect(within(row).getByText("₹1,999.00")).toBeInTheDocument();
  });

  test("adds a package with a regional price", async () => {
    render(<CreditPackagesAdmin reloadKey={0} />);
    await screen.findByRole("row", { name: /Growth/ });
    fireEvent.click(screen.getByRole("button", { name: /Add package/ }));
    fireEvent.change(await screen.findByLabelText("Package name"), { target: { value: "Scale" } });
    fireEvent.change(screen.getByLabelText("Credits"), { target: { value: "6000" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "79" } });
    fireEvent.change(screen.getByLabelText("Price in INR for India"), { target: { value: "5999" } });
    fireEvent.click(screen.getByRole("button", { name: /Save package/ }));
    await waitFor(() =>
      expect(Api.ApiAdminCreateAiCreditPackage).toHaveBeenCalledWith({ name: "Scale", description: "", credits: 6000, price: 79, currency: "USD", isActive: true, isPopular: false, sortOrder: 0, regionalPrices: [{ regionId: "r-in", price: 5999 }] }),
    );
  });

  test("switches a package off and deletes one after confirming", async () => {
    render(<CreditPackagesAdmin reloadKey={0} />);
    const row = await screen.findByRole("row", { name: /Growth/ });
    fireEvent.click(within(row).getByRole("switch", { name: "Available to buy" }));
    await waitFor(() => expect(Api.ApiAdminUpdateAiCreditPackage).toHaveBeenCalledWith({ packageId: "p2", isActive: false }));
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Delete credit package" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(Api.ApiAdminDeleteAiCreditPackage).toHaveBeenCalledWith({ packageId: "p2" }));
  });

  test("payments across organizations, filtered by status", async () => {
    Api.ApiAdminAiCreditPayments.mockResolvedValue({ isSuccess: true, data: [{ ...payment, status: "FAILED", failureReason: "The payment failed", organization: { name: "Acme" } }], totalRecords: 1 });
    render(<PaymentsLog reloadKey={0} />);
    const row = await screen.findByRole("row", { name: /Acme/ });
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(within(row).getByText("The payment failed")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PAID" } });
    await waitFor(() => expect(Api.ApiAdminAiCreditPayments).toHaveBeenLastCalledWith({ status: "PAID", pageNo: 1, perPage: 10 }));
  });
});
