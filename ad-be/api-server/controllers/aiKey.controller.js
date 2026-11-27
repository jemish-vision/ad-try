const mongoose = require("mongoose");
const keys = require("../services/aiKeys/aiKey.service");
const { ROLES } = require("../constants/roles");
const { write_logs } = require("../../winston/utility/logger");

/**
 * AI API Keys (user panel). Everyone in the organization can see whether its own keys are on and
 * each key's masked hint and status; only the organization owner (ADMIN role) can change anything.
 * Demo accounts see sample data and can't save. Keys are never returned or audited in plain text.
 */
const orgOf = (req) => req.organizationId || req.user?.organizationId || null;
const isDemo = (req) => Boolean(req.isMockTestingUser || req.user?.isMockUser);
const isOwner = (req) => req.role?.roleName === ROLES.ADMIN;
const validOrgId = (id) => id && mongoose.Types.ObjectId.isValid(String(id));
const PROVIDERS = keys.PROVIDER_KEYS;

function auditChange(req, change) {
  req.auditChange = { resourceType: "ai provider key", ...change };
}

function fail(res, err, where) {
  if (err instanceof keys.AiKeyError) return res.status(200).json({ isSuccess: false, code: err.code, message: err.message, provider: err.provider || null });
  write_logs({ message: `[aiKeys] ${where}: ${keys.scrub(err.message)}`, log_type: "error" });
  return res.status(500).json({ isSuccess: false, message: "Something went wrong. Please try again." });
}

/** Guard for changes: owner of a real organization, not a demo account. Returns false after replying. */
function canChange(req, res) {
  if (isDemo(req)) {
    res.status(200).json({ isSuccess: false, code: "NOT_ALLOWED", message: "API keys can't be changed in demo mode." });
    return false;
  }
  if (!validOrgId(orgOf(req))) {
    res.status(200).json({ isSuccess: false, message: "No organization selected" });
    return false;
  }
  if (!isOwner(req)) {
    res.status(200).json({ isSuccess: false, code: "NOT_ALLOWED", message: "Only the organization owner can manage AI API keys." });
    return false;
  }
  return true;
}

/** Sample data for demo accounts: own keys on (OpenAI + Gemini saved), wallet fallback allowed. */
function demoOverview() {
  const features = keys.featureProviders();
  const sample = {
    openai: { provider: "openai", keyHint: "sk-proj-…7Q2a", status: "VALID", statusMessage: null, lastValidatedAt: new Date(Date.now() - 3 * 86400000), lastUsedAt: new Date(Date.now() - 3600000), updatedAt: new Date(Date.now() - 3 * 86400000) },
    gemini: { provider: "gemini", keyHint: "AIza…x9Lk", status: "RATE_LIMITED", statusMessage: "Too many requests right now.", lastValidatedAt: new Date(Date.now() - 86400000), lastUsedAt: new Date(Date.now() - 7200000), updatedAt: new Date(Date.now() - 6 * 86400000) },
  };
  return {
    settings: { usePersonalKeys: true, allowWalletFallback: true },
    providers: PROVIDERS.map((p) => ({ provider: p, label: keys.labelOf(p), key: sample[p] || null, features: Object.entries(features).filter(([, ps]) => ps.includes(p)).map(([f]) => f) })),
    featureProviders: features,
  };
}

exports.getKeys = async (req, res) => {
  try {
    if (isDemo(req)) return res.status(200).json({ isSuccess: true, data: { ...demoOverview(), canManage: false, isDemo: true } });
    const orgId = orgOf(req);
    if (!validOrgId(orgId)) return res.status(200).json({ isSuccess: false, message: "No organization selected" });
    return res.status(200).json({ isSuccess: true, data: { ...(await keys.overview(orgId)), canManage: isOwner(req), isDemo: false } });
  } catch (err) {
    return fail(res, err, "getKeys");
  }
};

exports.saveKey = async (req, res) => {
  try {
    if (!canChange(req, res)) return undefined;
    const { provider, apiKey } = req.body || {};
    const { before, after } = await keys.saveKey({ organizationId: orgOf(req), provider, apiKey, actorId: req.user?._id });
    auditChange(req, { resourceId: provider, organizationId: orgOf(req), previousValue: before, newValue: after });
    return res.status(200).json({ isSuccess: true, message: before ? "API key replaced" : "API key saved", data: after });
  } catch (err) {
    return fail(res, err, "saveKey");
  }
};

exports.validateKey = async (req, res) => {
  try {
    if (!canChange(req, res)) return undefined;
    const provider = req.body?.provider;
    if (!PROVIDERS.includes(provider)) return res.status(200).json({ isSuccess: false, code: "KEY_PROVIDER_UNSUPPORTED", message: "Choose Anthropic, OpenAI or Google Gemini." });
    const after = await keys.revalidateKey({ organizationId: orgOf(req), provider });
    auditChange(req, { resourceId: provider, organizationId: orgOf(req), metadata: { status: after.status } });
    return res.status(200).json({ isSuccess: true, data: after });
  } catch (err) {
    return fail(res, err, "validateKey");
  }
};

exports.removeKey = async (req, res) => {
  try {
    if (!canChange(req, res)) return undefined;
    const provider = req.body?.provider;
    const { before } = await keys.removeKey({ organizationId: orgOf(req), provider });
    auditChange(req, { resourceId: provider, organizationId: orgOf(req), previousValue: before });
    return res.status(200).json({ isSuccess: true, message: "API key removed" });
  } catch (err) {
    return fail(res, err, "removeKey");
  }
};

exports.updateSettings = async (req, res) => {
  try {
    if (!canChange(req, res)) return undefined;
    const { usePersonalKeys, allowWalletFallback } = req.body || {};
    const { before, after } = await keys.updateSettings({ organizationId: orgOf(req), usePersonalKeys, allowWalletFallback, actorId: req.user?._id });
    auditChange(req, { resourceType: "ai key settings", resourceId: String(orgOf(req)), organizationId: orgOf(req), previousValue: before, newValue: after });
    return res.status(200).json({ isSuccess: true, message: "Settings saved", data: after });
  } catch (err) {
    return fail(res, err, "updateSettings");
  }
};
