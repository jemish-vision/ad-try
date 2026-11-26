import React from "react";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import * as Api from "../../../api-wrapper/ApiAiCredits";
import * as RegionApi from "../../../api-wrapper/ApiPricingRegions";
import Toast from "../../../common/helper/toast/Toast";
import BuyCreditsSection from "./BuyCreditsSection";
import PurchaseResultBanner, { usePurchaseResult } from "./PurchaseResultBanner";
import AiCreditsPage from "./AiCreditsPage";
import { CreditMeter } from "./aiCreditComponents";
import CreditPackagesAdmin, { PaymentsLog, validatePackageForm } from "./admin/CreditPackagesAdmin";
import CustomPricingCard, { validateCustomForm, cheaperThanPackages } from "./admin/CustomPricingCard";
import { customTotal, customAmountError, defaultCustomAmount } from "./CustomCreditsRow";
import { PaymentsTable } from "./aiCreditComponents";
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
  ApiAdminUpdateAiCreditCustomPricing: jest.fn(),
  ApiAdminAiCreditPayments: jest.fn(),
}));
jest.mock("../../../api-wrapper/ApiPricingRegions", () => ({ ApiDetectPricingCountry: jest.fn() }));
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
    expect(within(cards[1]).queryByText(/per 1,000 credits/)).not.toBeInTheDocument();
    expect(screen.queryByText(/processed securely by Stripe/)).not.toBeInTheDocument();
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

describe("Need a different amount? (custom credits)", () => {
  const OFFER = { ratePer1K: 19, currency: "USD", minCredits: 100, maxCredits: 50000, step: 50 };
  const withOffer = (over = {}) =>
    Api.ApiGetAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: PACKAGES, canPurchase: true, custom: OFFER, ...over } });
  const amountBox = () => screen.findByRole("spinbutton", { name: "Number of credits" });

  test("totals use the same rounding as the server, per currency", () => {
    expect(customTotal(1250, 19, "USD")).toBe(23.75);
    expect(customTotal(150, 2833.3, "JPY")).toBe(425);
    expect(customTotal(333, 1.005, "EUR")).toBe(0.33);
    expect(defaultCustomAmount(OFFER)).toBe(1000);
    expect(defaultCustomAmount({ ...OFFER, minCredits: 5000 })).toBe(5000);
    const t = (k, v) => k.replace(/\{\{(\w+)\}\}/g, (_, x) => v[x]);
    expect(customAmountError("1000", OFFER, t, "en-US")).toBeNull();
    expect(customAmountError("1000.5", OFFER, t, "en-US")).toBe("Enter a whole number of credits.");
  });

  test("shown as a separate row under the packages; starts at 1,000 credits with the total", async () => {
    withOffer();
    render(<BuyCreditsSection redirect={jest.fn()} />);
    const row = (await screen.findByText("Need a different amount?")).closest("#ai-credits-custom");
    expect(row).not.toBeNull();
    expect(screen.getAllByTestId("ai-credit-package")).toHaveLength(2); // packages still listed above
    expect(within(row).getByText("Buy any amount from 100 to 50,000 credits, in steps of 50.")).toBeInTheDocument();
    expect(await amountBox()).toHaveValue(1000);
    expect(within(row).getByText("$19.00")).toBeInTheDocument();
    expect(within(row).queryByText(/per 1,000/)).not.toBeInTheDocument(); // total only
  });

  test("owner types an amount, sees the total and buys it: only the number of credits is sent", async () => {
    withOffer();
    const redirect = jest.fn();
    Api.ApiPurchaseAiCredits.mockResolvedValue({ isSuccess: true, data: { url: "https://checkout.stripe.com/c/cs_9", paymentId: "pay9" } });
    render(<BuyCreditsSection redirect={redirect} />);
    fireEvent.change(await amountBox(), { target: { value: "1250" } });
    expect(screen.getByText("$23.75")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buy 1,250 credits" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/cs_9"));
    expect(Api.ApiPurchaseAiCredits).toHaveBeenCalledWith({ credits: 1250 });
  });

  test("amounts outside the limits or off the step can't be bought", async () => {
    withOffer();
    render(<BuyCreditsSection redirect={jest.fn()} />);
    const box = await amountBox();
    for (const [value, message] of [["50", "Minimum 100 credits."], ["60000", "Maximum 50,000 credits."], ["1025", "Choose a multiple of 50 credits."], ["", "Enter a whole number of credits."]]) {
      fireEvent.change(box, { target: { value } });
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "Buy credits" })).toBeDisabled();
      expect(box).toHaveAttribute("aria-invalid", "true");
    }
    expect(Api.ApiPurchaseAiCredits).not.toHaveBeenCalled();
  });

  test("- and + move by the step and stop at the limits", async () => {
    withOffer({ custom: { ...OFFER, minCredits: 900, maxCredits: 1100, step: 100 } });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    const box = await amountBox();
    expect(box).toHaveValue(1000);
    fireEvent.click(screen.getByRole("button", { name: "More credits" }));
    expect(box).toHaveValue(1100);
    expect(screen.getByRole("button", { name: "More credits" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fewer credits" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer credits" }));
    expect(box).toHaveValue(900);
    expect(screen.getByRole("button", { name: "Fewer credits" })).toBeDisabled();
  });

  test("regional offer is shown in the region currency", async () => {
    withOffer({ custom: { ...OFFER, ratePer1K: 1600, currency: "INR" } });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    await amountBox();
    expect(screen.getByText("₹1,600.00")).toBeInTheDocument();
  });

  test("no packages on sale but custom amounts allowed: only the custom row is shown", async () => {
    withOffer({ packages: [] });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    expect(await screen.findByText("Need a different amount?")).toBeInTheDocument();
    expect(screen.queryAllByTestId("ai-credit-package")).toHaveLength(0);
  });

  test("team members and demo can't use it; the buy button is marked for the demo guard", async () => {
    withOffer({ canPurchase: false, isDemo: true });
    render(<BuyCreditsSection redirect={jest.fn()} />);
    expect(await amountBox()).toBeDisabled();
    const buy = screen.getByRole("button", { name: "Buy 1,000 credits" });
    expect(buy).toBeDisabled();
    expect(buy).toHaveAttribute("data-demo-block");
  });

  test("custom purchases are labelled in the payment history", () => {
    render(<PaymentsTable rows={[{ ...payment, _id: "c1", kind: "CUSTOM", packageName: "Custom amount", credits: 1250, amount: 23.75 }]} loading={false} />);
    const row = screen.getByRole("row", { name: /1,250/ });
    expect(within(row).getByText("Custom amount")).toBeInTheDocument();
    expect(within(row).getByText("$23.75")).toBeInTheDocument();
  });
});

describe("Super Admin: custom amount settings", () => {
  const regions = [{ _id: "r-in", name: "India", currency: "INR", countries: ["IN"], isActive: true }];
  const packages = [{ _id: "p2", name: "Growth", credits: 2000, price: 29, currency: "USD", isActive: true, regionalPrices: [{ regionId: "r-in", price: 1999 }] }];
  const t = (k) => k;

  beforeEach(() => {
    Api.ApiAdminUpdateAiCreditCustomPricing.mockResolvedValue({ isSuccess: true, message: "Custom amount pricing saved" });
  });

  test("form validation matches the server rules", () => {
    const ok = { enabled: true, ratePer1K: "19", currency: "USD", minCredits: "100", maxCredits: "50000", step: "50", regionalRates: {} };
    expect(validateCustomForm(ok, t)).toEqual({});
    expect(validateCustomForm({ ...ok, ratePer1K: "" }, t)).toEqual({ ratePer1K: "Set a price per 1,000 credits before turning custom amounts on" });
    expect(validateCustomForm({ ...ok, ratePer1K: "", enabled: false }, t)).toEqual({});
    expect(validateCustomForm({ ...ok, minCredits: "120" }, t)).toEqual({ step: "Minimum and maximum must be multiples of the step" });
    expect(validateCustomForm({ ...ok, maxCredits: "50" }, t)).toEqual({ maxCredits: "Maximum must be a whole number not below the minimum" });
    expect(validateCustomForm({ ...ok, regionalRates: { "r-in": "0" } }, t)).toEqual({ "region.r-in": "Price must be greater than 0" });
  });

  test("warns when a custom amount would be cheaper per credit than a package (same currency only)", () => {
    const form = { ratePer1K: "10", currency: "USD", regionalRates: { "r-in": "2000" } };
    expect(cheaperThanPackages(form, packages, regions)).toEqual([{ name: "Growth", region: null, per1K: 14.5, currency: "USD" }]);
    expect(cheaperThanPackages({ ...form, ratePer1K: "19", regionalRates: { "r-in": "900" } }, packages, regions)).toEqual([{ name: "Growth", region: "India", per1K: 999.5, currency: "INR" }]);
    expect(cheaperThanPackages({ ...form, currency: "EUR" }, packages, regions)).toEqual([]);
  });

  test("turns custom amounts on with a regional rate and saves numbers", async () => {
    const onSaved = jest.fn();
    render(<CustomPricingCard custom={{ enabled: false, ratePer1K: 0, currency: "USD", minCredits: 100, maxCredits: 50000, step: 50, regionalRates: [] }} packages={packages} regions={regions} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("switch", { name: "Allow custom amounts" }));
    fireEvent.change(screen.getByLabelText("Price per 1,000 credits"), { target: { value: "19" } });
    expect(screen.getByText("Example: 1,000 credits = $19.00")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price per 1,000 credits in INR for India"), { target: { value: "1600" } });
    expect(screen.queryByText(/would cost less per credit/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save custom amount/ }));
    await waitFor(() =>
      expect(Api.ApiAdminUpdateAiCreditCustomPricing).toHaveBeenCalledWith({ enabled: true, ratePer1K: 19, currency: "USD", minCredits: 100, maxCredits: 50000, step: 50, regionalRates: [{ regionId: "r-in", ratePer1K: 1600 }] }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(Toast.success).toHaveBeenCalledWith("Custom amount pricing saved");
  });

  test("shows the cheaper-than-package warning and blocks saving invalid limits", async () => {
    render(<CustomPricingCard custom={{ enabled: true, ratePer1K: 10, currency: "USD", minCredits: 100, maxCredits: 50000, step: 50, regionalRates: [] }} packages={packages} regions={regions} />);
    expect(screen.getByRole("status")).toHaveTextContent("Growth: $14.50 per 1,000 credits");
    fireEvent.change(screen.getByLabelText("Minimum credits"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: /Save custom amount/ }));
    expect(await screen.findByText("Minimum and maximum must be multiples of the step")).toBeInTheDocument();
    expect(Api.ApiAdminUpdateAiCreditCustomPricing).not.toHaveBeenCalled();
  });

  test("server refusal (e.g. below Stripe's minimum charge) is shown", async () => {
    Api.ApiAdminUpdateAiCreditCustomPricing.mockResolvedValue({ isSuccess: false, message: "Default price: 100 credits would cost 0.1 USD, below Stripe's minimum charge of 0.5 USD." });
    render(<CustomPricingCard custom={{ enabled: true, ratePer1K: 1, currency: "USD", minCredits: 100, maxCredits: 50000, step: 50, regionalRates: [] }} packages={[]} regions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Save custom amount/ }));
    await waitFor(() => expect(Toast.error).toHaveBeenCalledWith(expect.stringMatching(/Stripe's minimum charge/)));
  });

  test("appears under the packages on the Credit packages tab", async () => {
    // A fresh copy per call, like a real API response
    Api.ApiAdminAiCreditPackages.mockImplementation(async () => ({ isSuccess: true, data: { packages, regions, custom: { enabled: true, ratePer1K: 19, currency: "USD", minCredits: 100, maxCredits: 50000, step: 50, regionalRates: [] } } }));
    RegionApi.ApiDetectPricingCountry.mockResolvedValue({ isSuccess: true, data: { country: "US", cfHeaderPresent: true } });
    render(<CreditPackagesAdmin reloadKey={0} />);
    await screen.findByRole("row", { name: /Growth/ });
    await waitFor(() => expect(screen.getByLabelText("Price per 1,000 credits")).toHaveValue(19));
    expect(screen.getByRole("switch", { name: "Allow custom amounts" })).toBeChecked();
    // Reloading the packages (e.g. after switching one off) keeps unsaved custom edits
    Api.ApiAdminUpdateAiCreditPackage.mockResolvedValue({ isSuccess: true, message: "Credit package updated" });
    fireEvent.change(screen.getByLabelText("Price per 1,000 credits"), { target: { value: "21" } });
    fireEvent.click(within(screen.getByRole("row", { name: /Growth/ })).getByRole("switch", { name: "Available to buy" }));
    await waitFor(() => expect(Api.ApiAdminAiCreditPackages).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Price per 1,000 credits")).toHaveValue(21);
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
    RegionApi.ApiDetectPricingCountry.mockResolvedValue({ isSuccess: true, data: { country: "IN", cfHeaderPresent: true, regionName: "India", currency: "INR" } });
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

  test("shows the detected country and the price that applies there, like the Plans page", async () => {
    render(<CreditPackagesAdmin reloadKey={0} />);
    const note = await screen.findByText(/Your country \(Cloudflare\)/);
    expect(note).toHaveTextContent("buyers here pay the India price in INR");
  });

  test("detected country outside every region pays the default price; a missing Cloudflare header is flagged", async () => {
    RegionApi.ApiDetectPricingCountry.mockResolvedValueOnce({ isSuccess: true, data: { country: "US", cfHeaderPresent: true, regionName: null, currency: null } });
    const { unmount } = render(<CreditPackagesAdmin reloadKey={0} />);
    expect(await screen.findByText(/no pricing region, buyers here pay the default price/)).toBeInTheDocument();
    unmount();
    RegionApi.ApiDetectPricingCountry.mockResolvedValueOnce({ isSuccess: true, data: { country: null, cfHeaderPresent: false } });
    render(<CreditPackagesAdmin reloadKey={0} />);
    expect(await screen.findByText(/Cloudflare country header not received/)).toBeInTheDocument();
  });

  test("Regional Prices button: sets a package's price per region (blank = default price)", async () => {
    const regions2 = [...regions, { _id: "r-eu", name: "Europe", currency: "EUR", countries: ["DE", "FR"], isActive: true }];
    Api.ApiAdminAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: [pkg], regions: regions2 } });
    render(<CreditPackagesAdmin reloadKey={0} />);
    const row = await screen.findByRole("row", { name: /Growth/ });
    fireEvent.click(within(row).getByRole("button", { name: "Regional Prices" }));
    const india = await screen.findByLabelText("Price in INR for India");
    expect(india).toHaveValue(1999);
    fireEvent.change(india, { target: { value: "" } }); // back to the default price
    fireEvent.change(screen.getByLabelText("Price in EUR for Europe"), { target: { value: "27" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Prices/ }));
    await waitFor(() => expect(Api.ApiAdminUpdateAiCreditPackage).toHaveBeenCalledWith({ packageId: "p2", regionalPrices: [{ regionId: "r-eu", price: 27 }] }));
  });

  test("Regional Prices: rejects a zero price and explains where regions come from when there are none", async () => {
    render(<CreditPackagesAdmin reloadKey={0} />);
    fireEvent.click(within(await screen.findByRole("row", { name: /Growth/ })).getByRole("button", { name: "Regional Prices" }));
    fireEvent.change(await screen.findByLabelText("Price in INR for India"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Prices/ }));
    expect(await screen.findByText("Price must be greater than 0")).toBeInTheDocument();
    expect(Api.ApiAdminUpdateAiCreditPackage).not.toHaveBeenCalled();
  });

  test("no pricing regions yet: the modal points to Plans → Pricing Regions and can't save", async () => {
    Api.ApiAdminAiCreditPackages.mockResolvedValue({ isSuccess: true, data: { packages: [{ ...pkg, regionalPrices: [] }], regions: [] } });
    render(<CreditPackagesAdmin reloadKey={0} />);
    fireEvent.click(within(await screen.findByRole("row", { name: /Growth/ })).getByRole("button", { name: "Regional Prices" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Add regions on the Plans page \(Pricing Regions\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Save Prices/ })).toBeDisabled();
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
