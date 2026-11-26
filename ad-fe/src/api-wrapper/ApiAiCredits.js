import axios from "axios";

const api = `${process.env.REACT_APP_API_BASE}/api/ai-credits/`;
const post = (path, data = {}, { loader = false } = {}) =>
  axios
    .post(`${api}${path}`, data, loader ? {} : { headers: { "x-skip-loader": true }, skipLoader: true })
    .then((res) => res.data)
    .catch((err) => err?.response?.data || { isSuccess: false, message: "Request failed" });

// User panel — the signed-in user's organization wallet
export const ApiGetAiCreditSummary = () => post("summary");
export const ApiGetAiCreditUsage = (data) => post("usage", data);
export const ApiGetAiCreditTransactions = (data) => post("transactions", data);

// Buying credits (organization owner)
export const ApiGetAiCreditPackages = () => post("packages");
export const ApiPurchaseAiCredits = (data) => post("purchase", data, { loader: true });
export const ApiVerifyAiCreditPurchase = (data) => post("purchase/verify", data);
export const ApiCancelAiCreditPurchase = (data) => post("purchase/cancel", data);
export const ApiGetAiCreditPayments = (data) => post("payments", data);

// Super Admin
export const ApiAdminAiCreditOverview = (data) => post("admin/overview", data);
export const ApiAdminAiCreditOrganizations = (data) => post("admin/organizations", data);
export const ApiAdminAiCreditOrganization = (data) => post("admin/organization", data);
export const ApiAdminAiCreditUsage = (data) => post("admin/usage", data);
export const ApiAdminAiCreditTransactions = (data) => post("admin/transactions", data);
export const ApiAdminAiCreditSettings = () => post("admin/settings");
export const ApiAdminUpdateAiCreditSettings = (data) => post("admin/settings/update", data, { loader: true });
export const ApiAdminAdjustAiCredits = (data) => post("admin/adjust", data, { loader: true });
export const ApiAdminSetAiMonthlyLimit = (data) => post("admin/monthly-limit", data, { loader: true });
export const ApiAdminAiCreditPackages = () => post("admin/packages");
export const ApiAdminCreateAiCreditPackage = (data) => post("admin/packages/create", data, { loader: true });
export const ApiAdminUpdateAiCreditPackage = (data) => post("admin/packages/update", data, { loader: true });
export const ApiAdminDeleteAiCreditPackage = (data) => post("admin/packages/delete", data, { loader: true });
export const ApiAdminUpdateAiCreditCustomPricing = (data) => post("admin/custom-pricing/update", data, { loader: true });
export const ApiAdminAiCreditPayments = (data) => post("admin/payments", data);
