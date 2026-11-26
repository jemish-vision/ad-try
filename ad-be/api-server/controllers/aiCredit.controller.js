const mongoose = require("mongoose");
const service = require("../services/aiCredits/aiCredit.service");
const report = require("../services/aiCredits/aiCreditReport.service");
const mock = require("../services/aiCredits/aiCredit.mock");
const purchase = require("../services/aiCredits/aiCreditPurchase.service");
const { ROLES } = require("../constants/roles");
const { write_logs } = require("../../winston/utility/logger");

const orgOf = (req) => req.organizationId || req.user?.organizationId || null;
const isDemo = (req) => Boolean(req.isMockTestingUser || req.user?.isMockUser);
const validOrgId = (id) => id && mongoose.Types.ObjectId.isValid(String(id));

function fail(res, err, where) {
  if (err instanceof service.AiCreditsError) return res.status(200).json({ isSuccess: false, code: err.code, message: err.message });
  write_logs({ message: `[aiCredits] ${where}: ${err.message}`, log_type: "error" });
  return res.status(500).json({ isSuccess: false, message: "Something went wrong. Please try again." });
}

/**
 * Details for the audit log row the auditRequest middleware writes for this route
 * (events registered in constants/auditRouteEvents.js under "ai-credits").
 */
function auditChange(req, change) {
  req.auditChange = { resourceType: "ai credit wallet", ...change };
}

const features = () => Object.values(service.FEATURES).map((f) => ({ key: f.key, label: f.label, defaultReserve: f.reserve }));

// ── User panel (any member of the organization) ──────────────────────────────
exports.getMyCredits = async (req, res) => {
  try {
    if (isDemo(req)) return res.status(200).json({ isSuccess: true, data: { ...mock.summary(), features: features(), canPurchase: false, canViewPayments: true } });
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: true, data: null, message: "No organization selected" });
    const data = await report.getUserSummary(orgId);
    const owner = canPurchase(req);
    return res.status(200).json({ isSuccess: true, data: { ...data, features: features(), canPurchase: owner, canViewPayments: owner } });
  } catch (err) {
    return fail(res, err, "getMyCredits");
  }
};

exports.getMyUsage = async (req, res) => {
  try {
    if (isDemo(req)) return res.status(200).json({ isSuccess: true, ...mock.usage(req.body) });
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: true, data: [], totalRecords: 0 });
    return res.status(200).json({ isSuccess: true, ...(await report.listUsage(req.body, { organizationId: orgId })) });
  } catch (err) {
    return fail(res, err, "getMyUsage");
  }
};

exports.getMyTransactions = async (req, res) => {
  try {
    if (isDemo(req)) return res.status(200).json({ isSuccess: true, ...mock.transactions(req.body) });
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: true, data: [], totalRecords: 0 });
    await service.getWallet(orgId); // make sure this month's allocation is on the ledger
    return res.status(200).json({ isSuccess: true, ...(await report.listTransactions(req.body, { organizationId: orgId })) });
  } catch (err) {
    return fail(res, err, "getMyTransactions");
  }
};

// ── Super Admin ──────────────────────────────────────────────────────────────
exports.adminOverview = async (req, res) => {
  try {
    return res.status(200).json({ isSuccess: true, data: await report.getAdminOverview(req.body) });
  } catch (err) {
    return fail(res, err, "adminOverview");
  }
};

exports.adminOrganizations = async (req, res) => {
  try {
    return res.status(200).json({ isSuccess: true, ...(await report.listOrganizationWallets(req.body)) });
  } catch (err) {
    return fail(res, err, "adminOrganizations");
  }
};

exports.adminOrganizationDetail = async (req, res) => {
  try {
    const { organizationId } = req.body || {};
    if (!validOrgId(organizationId)) return res.status(200).json({ isSuccess: false, message: "organizationId is required" });
    return res.status(200).json({ isSuccess: true, data: await report.getUserSummary(organizationId) });
  } catch (err) {
    return fail(res, err, "adminOrganizationDetail");
  }
};

exports.adminUsage = async (req, res) => {
  try {
    return res.status(200).json({ isSuccess: true, ...(await report.listUsage(req.body)) });
  } catch (err) {
    return fail(res, err, "adminUsage");
  }
};

exports.adminTransactions = async (req, res) => {
  try {
    const { organizationId } = req.body || {};
    if (!validOrgId(organizationId)) return res.status(200).json({ isSuccess: false, message: "organizationId is required" });
    return res.status(200).json({ isSuccess: true, ...(await report.listTransactions(req.body, { organizationId })) });
  } catch (err) {
    return fail(res, err, "adminTransactions");
  }
};

exports.adminGetSettings = async (req, res) => {
  try {
    return res.status(200).json({ isSuccess: true, data: { ...(await service.getSettings({ fresh: true })), features: features() } });
  } catch (err) {
    return fail(res, err, "adminGetSettings");
  }
};

exports.adminUpdateSettings = async (req, res) => {
  try {
    const before = await service.getSettings({ fresh: true });
    const data = await service.updateSettings(req.body || {}, req.user?._id);
    auditChange(req, { resourceType: "ai credit settings", previousValue: before, newValue: data });
    return res.status(200).json({ isSuccess: true, message: "AI credit settings saved", data: { ...data, features: features() } });
  } catch (err) {
    return fail(res, err, "adminUpdateSettings");
  }
};

exports.adminAdjustCredits = async (req, res) => {
  try {
    const { organizationId, credits, note } = req.body || {};
    if (!validOrgId(organizationId)) return res.status(200).json({ isSuccess: false, message: "organizationId is required" });
    const wallet = await service.adjustCredits({ organizationId, credits: Number(credits), note, actorId: req.user?._id });
    auditChange(req, { organizationId, resourceId: String(organizationId), newValue: wallet, metadata: { credits: Number(credits), note } });
    return res.status(200).json({ isSuccess: true, message: "Credits updated", data: wallet });
  } catch (err) {
    return fail(res, err, "adminAdjustCredits");
  }
};

exports.adminSetMonthlyLimit = async (req, res) => {
  try {
    const { organizationId, monthlyLimit } = req.body || {};
    if (!validOrgId(organizationId)) return res.status(200).json({ isSuccess: false, message: "organizationId is required" });
    const before = service.walletView(await service.getWallet(organizationId));
    const wallet = await service.setMonthlyLimitOverride({ organizationId, limit: monthlyLimit, actorId: req.user?._id });
    auditChange(req, { organizationId, resourceId: String(organizationId), previousValue: { monthlyLimit: before.monthlyLimit, limitSource: before.limitSource }, newValue: { monthlyLimit: wallet.monthlyLimit, limitSource: wallet.limitSource } });
    return res.status(200).json({ isSuccess: true, message: "Monthly credits updated", data: wallet });
  } catch (err) {
    return fail(res, err, "adminSetMonthlyLimit");
  }
};

// ── Buying credits ───────────────────────────────────────────────────────────
// Only the organization owner (ADMIN role) buys credits and sees payments, like plan purchases.
const canPurchase = (req) => req.role?.roleName === ROLES.ADMIN && !isDemo(req);
const notAllowed = (res, message) => res.status(200).json({ isSuccess: false, code: "NOT_ALLOWED", message });

exports.getCreditPackages = async (req, res) => {
  try {
    const packages = isDemo(req) ? mock.packages() : await purchase.listPackagesForBuyer(req);
    return res.status(200).json({ isSuccess: true, data: { packages, canPurchase: canPurchase(req), isDemo: isDemo(req) } });
  } catch (err) {
    return fail(res, err, "getCreditPackages");
  }
};

exports.purchaseCredits = async (req, res) => {
  try {
    if (isDemo(req)) return notAllowed(res, "Buying credits isn't available in demo mode.");
    if (!canPurchase(req)) return notAllowed(res, "Only the organization owner can buy AI credits.");
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: false, message: "No organization selected" });
    const { packageId } = req.body || {};
    const result = await purchase.startCheckout({ organizationId: orgId, userId: req.user?._id, packageId, req });
    auditChange(req, { resourceType: "ai credit payment", resourceId: result.paymentId, organizationId: orgId, metadata: { packageId } });
    return res.status(200).json({ isSuccess: true, data: { url: result.url, paymentId: result.paymentId } });
  } catch (err) {
    return fail(res, err, "purchaseCredits");
  }
};

exports.verifyCreditPurchase = async (req, res) => {
  try {
    if (isDemo(req)) return notAllowed(res, "Buying credits isn't available in demo mode.");
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: false, message: "No organization selected" });
    const result = await purchase.verifyCheckout({ sessionId: req.body?.sessionId, organizationId: orgId });
    auditChange(req, { resourceType: "ai credit payment", resourceId: String(result.paymentId || ""), organizationId: orgId, metadata: { status: result.status, credited: Boolean(result.credited) } });
    return res.status(200).json({ isSuccess: true, data: result });
  } catch (err) {
    return fail(res, err, "verifyCreditPurchase");
  }
};

exports.cancelCreditPurchase = async (req, res) => {
  try {
    if (isDemo(req)) return notAllowed(res, "Buying credits isn't available in demo mode.");
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: false, message: "No organization selected" });
    const payment = await purchase.cancelCheckout({ paymentId: req.body?.paymentId, organizationId: orgId });
    auditChange(req, { resourceType: "ai credit payment", resourceId: String(payment?._id || ""), organizationId: orgId, metadata: { status: payment?.status } });
    return res.status(200).json({ isSuccess: true, data: payment });
  } catch (err) {
    return fail(res, err, "cancelCreditPurchase");
  }
};

exports.getMyPayments = async (req, res) => {
  try {
    if (isDemo(req)) return res.status(200).json({ isSuccess: true, ...mock.payments(req.body) });
    if (!canPurchase(req)) return res.status(200).json({ isSuccess: true, data: [], totalRecords: 0, canView: false });
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: true, data: [], totalRecords: 0 });
    return res.status(200).json({ isSuccess: true, canView: true, ...(await purchase.listPayments(req.body, { organizationId: orgId })) });
  } catch (err) {
    return fail(res, err, "getMyPayments");
  }
};

// ── Super Admin: credit packages and payments ────────────────────────────────
exports.adminListPackages = async (req, res) => {
  try {
    return res.status(200).json({ isSuccess: true, data: await purchase.listPackagesForAdmin() });
  } catch (err) {
    return fail(res, err, "adminListPackages");
  }
};

exports.adminCreatePackage = async (req, res) => {
  try {
    const pkg = await purchase.createPackage(req.body || {}, req.user?._id);
    auditChange(req, { resourceType: "ai credit package", resourceId: String(pkg._id), newValue: pkg });
    return res.status(200).json({ isSuccess: true, message: "Credit package created", data: pkg });
  } catch (err) {
    return fail(res, err, "adminCreatePackage");
  }
};

exports.adminUpdatePackage = async (req, res) => {
  try {
    const { packageId, ...input } = req.body || {};
    const { before, after } = await purchase.updatePackage(packageId, input, req.user?._id);
    auditChange(req, { resourceType: "ai credit package", resourceId: String(packageId), previousValue: before, newValue: after });
    return res.status(200).json({ isSuccess: true, message: "Credit package updated", data: after });
  } catch (err) {
    return fail(res, err, "adminUpdatePackage");
  }
};

exports.adminDeletePackage = async (req, res) => {
  try {
    const before = await purchase.deletePackage(req.body?.packageId, req.user?._id);
    auditChange(req, { resourceType: "ai credit package", resourceId: String(req.body?.packageId), previousValue: before });
    return res.status(200).json({ isSuccess: true, message: "Credit package deleted" });
  } catch (err) {
    return fail(res, err, "adminDeletePackage");
  }
};

exports.adminPayments = async (req, res) => {
  try {
    return res.status(200).json({ isSuccess: true, ...(await purchase.listPayments(req.body)) });
  } catch (err) {
    return fail(res, err, "adminPayments");
  }
};

/** Scheduled job: reset wallets whose month ended and return stale holds. */
exports.cronAiCreditMaintenance = async () => service.runMonthlyMaintenance();
