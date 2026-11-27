'use strict';

/**
 * Organizations' own AI provider API keys ("bring your own key").
 *
 * Management (owner only, see aiKey.controller): add / replace, check with the provider, remove,
 * and the two switches — use our own keys, and allow wallet credits when our key can't be used.
 * Request time (aiKeyRouting): getOrgKeyConfig + personalKeyFor give the decrypted key for one
 * provider; markKeyProblem / markKeyUsed keep each key's status up to date.
 *
 * The plain key only exists in memory: it is encrypted before it is stored, never logged, never
 * put in an audit record and never sent back to the browser (only keyHint).
 */
const axios = require('axios');
const mongoose = require('mongoose');
const keyModel = require('../../models/aiProviderKey.model');
const settingModel = require('../../models/aiKeySetting.model');
const { encryptApiKey, decryptApiKey, keyHint } = require('./aiKeyCrypto');

const PROVIDERS = Object.freeze({
  anthropic: { label: 'Anthropic (Claude)', prefix: /^sk-ant-/ },
  openai: { label: 'OpenAI', prefix: /^sk-/ },
  gemini: { label: 'Google Gemini', prefix: null },
});
const PROVIDER_KEYS = Object.keys(PROVIDERS);

/** Which provider each AI feature calls (the same models as with wallet credits). */
function featureProviders() {
  const assistant = String(process.env.AI_PROVIDER || 'anthropic').toLowerCase().trim();
  return {
    AI_ASSISTANT: PROVIDERS[assistant] ? [assistant] : ['anthropic'],
    LISTING_OPTIMIZATION: ['gemini', 'openai'],
    LISTING_GENERATION: ['openai'],
    APLUS_CONTENT: ['gemini'],
    CAMPAIGN_ANALYSIS: ['openai', 'gemini'], // the one chosen for the analysis
  };
}

class AiKeyError extends Error {
  constructor(code, message, { provider = null, status = null } = {}) {
    super(message);
    this.name = 'AiKeyError';
    this.code = code;
    this.provider = provider;
    this.keyStatus = status;
  }
}
const isAiKeyError = (err) => err instanceof AiKeyError || (err && typeof err.code === 'string' && err.code.startsWith('PERSONAL_KEY_'));

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const labelOf = (provider) => PROVIDERS[provider]?.label || provider;

/** Remove anything that looks like an API key from provider text before it is stored or shown. */
function scrub(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_*.-]{4,}/g, '[key]')
    .replace(/AIza[0-9A-Za-z_-]{6,}/g, '[key]')
    .replace(/key=[^&\s]+/gi, 'key=[key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * What a provider error means for the key: AUTH (rejected / expired / revoked), QUOTA (billing or
 * quota used up), RATE_LIMIT (too many requests right now), or null (not about the key).
 */
function classifyProviderError(err) {
  if (!err) return null;
  const status = [err.status, err.statusCode, err.providerStatus, err.response?.status, err.originalError?.status].find((s) => Number.isInteger(s) && s >= 400) || null;
  const text = [err.message, err.details, err.error?.message, err.response?.data?.error?.message, err.response?.data?.error?.status, err.response?.data?.error?.type, err.code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const message = scrub(err.response?.data?.error?.message || err.error?.message || err.details || err.message);
  if (/insufficient_quota|exceeded your current quota|billing|credit balance is too low|spending cap|quota exceeded|resource has been exhausted|resource_exhausted/.test(text)) return { kind: 'QUOTA', status, message };
  if (status === 401 || /api key not valid|api_key_invalid|invalid api key|incorrect api key|invalid x-api-key|invalid_api_key|authentication_error|permission_denied|unauthenticated|api key expired|key expired|revoked/.test(text)) {
    return { kind: 'AUTH', status, message };
  }
  if (status === 403) return { kind: 'AUTH', status, message };
  if (status === 429 || /rate limit|rate_limit|too many requests/.test(text)) return { kind: 'RATE_LIMIT', status, message };
  return null;
}

const STATUS_FOR_KIND = { AUTH: 'INVALID', QUOTA: 'QUOTA_EXCEEDED', RATE_LIMIT: 'RATE_LIMITED' };

/** Ask the provider whether it accepts the key (a cheap "list models" call). */
async function defaultVerifier(provider, apiKey) {
  const req = {
    openai: { url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${apiKey}` } },
    anthropic: { url: 'https://api.anthropic.com/v1/models?limit=1', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } },
    gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: { 'x-goog-api-key': apiKey } },
  }[provider];
  try {
    await axios.get(req.url, { headers: req.headers, timeout: 10000 });
    return { status: 'VALID', message: null };
  } catch (err) {
    const c = classifyProviderError(err);
    if (c) return { status: STATUS_FOR_KIND[c.kind], message: c.message || null };
    return { status: 'UNVERIFIED', message: `${labelOf(provider)} could not be reached to check the key. It will be used as saved.` };
  }
}
let verifier = defaultVerifier;
const setKeyVerifier = (fn) => {
  verifier = fn || defaultVerifier;
};

function checkFormat(provider, apiKey) {
  if (!PROVIDERS[provider]) throw new AiKeyError('KEY_PROVIDER_UNSUPPORTED', 'Choose Anthropic, OpenAI or Google Gemini.');
  const key = String(apiKey ?? '').trim();
  if (key.length < 20 || key.length > 300 || /\s/.test(key)) throw new AiKeyError('KEY_FORMAT_INVALID', 'This doesn\'t look like an API key. Paste the whole key, without spaces.', { provider });
  const prefix = PROVIDERS[provider].prefix;
  if (prefix && !prefix.test(key)) throw new AiKeyError('KEY_FORMAT_INVALID', `This doesn't look like an ${labelOf(provider)} key.`, { provider });
  return key;
}

// ── Views ────────────────────────────────────────────────────────────────────
const keyView = (doc) =>
  doc
    ? {
        provider: doc.provider,
        keyHint: doc.keyHint,
        status: doc.status,
        statusMessage: doc.statusMessage || null,
        lastValidatedAt: doc.lastValidatedAt || null,
        lastUsedAt: doc.lastUsedAt || null,
        updatedAt: doc.updatedAt || null,
      }
    : null;

async function getSettings(organizationId) {
  const s = await settingModel.findOne({ organizationId: toObjectId(organizationId) }).lean();
  return { usePersonalKeys: Boolean(s?.usePersonalKeys) };
}

/** For the AI features: is the switch on, and which providers have a key (no key details). */
async function ownKeysSummary(organizationId) {
  const [settings, keys] = await Promise.all([getSettings(organizationId), keyModel.find({ organizationId: toObjectId(organizationId) }).select('provider').lean()]);
  return { ...settings, providers: keys.map((k) => k.provider), featureProviders: featureProviders() };
}

/** Everything the AI API Keys page shows: switches, each provider's key (masked) and feature map. */
async function overview(organizationId) {
  const [settings, keys] = await Promise.all([getSettings(organizationId), keyModel.find({ organizationId: toObjectId(organizationId) }).lean()]);
  const features = featureProviders();
  return {
    settings,
    providers: PROVIDER_KEYS.map((p) => ({
      provider: p,
      label: labelOf(p),
      key: keyView(keys.find((k) => k.provider === p)),
      features: Object.entries(features).filter(([, ps]) => ps.includes(p)).map(([f]) => f),
    })),
    featureProviders: features,
  };
}

// ── Management (owner) ───────────────────────────────────────────────────────
/** Add or replace a provider key. The provider is asked first; a key it rejects is not saved. */
async function saveKey({ organizationId, provider, apiKey, actorId = null, now = new Date() }) {
  const key = checkFormat(provider, apiKey);
  const check = await verifier(provider, key);
  if (check.status === 'INVALID') {
    throw new AiKeyError('KEY_REJECTED', check.message ? `${labelOf(provider)} rejected this key: ${check.message}` : `${labelOf(provider)} rejected this key.`, { provider });
  }
  const orgId = toObjectId(organizationId);
  const before = keyView(await keyModel.findOne({ organizationId: orgId, provider }).lean());
  const doc = await keyModel
    .findOneAndUpdate(
      { organizationId: orgId, provider },
      {
        $set: { encryptedKey: encryptApiKey(key, { organizationId: orgId, provider }), keyHint: keyHint(key), status: check.status, statusMessage: check.message || null, lastValidatedAt: now, lastErrorAt: null, updatedBy: actorId ? toObjectId(actorId) : null },
        $setOnInsert: { createdBy: actorId ? toObjectId(actorId) : null },
      },
      { upsert: true, new: true }
    )
    .lean();
  invalidate(organizationId);
  return { before, after: keyView(doc) };
}

/** Check a saved key with the provider again and store the result. */
async function revalidateKey({ organizationId, provider, now = new Date() }) {
  const orgId = toObjectId(organizationId);
  const doc = await keyModel.findOne({ organizationId: orgId, provider }).select('+encryptedKey').lean();
  if (!doc) throw new AiKeyError('KEY_NOT_FOUND', `No ${labelOf(provider)} key is saved.`, { provider });
  const check = await verifier(provider, decryptApiKey(doc.encryptedKey, { organizationId: orgId, provider }));
  const after = await keyModel
    .findOneAndUpdate({ _id: doc._id }, { $set: { status: check.status, statusMessage: check.message || null, lastValidatedAt: now } }, { new: true })
    .lean();
  invalidate(organizationId);
  return keyView(after);
}

async function removeKey({ organizationId, provider }) {
  if (!PROVIDERS[provider]) throw new AiKeyError('KEY_PROVIDER_UNSUPPORTED', 'Choose Anthropic, OpenAI or Google Gemini.');
  const orgId = toObjectId(organizationId);
  const before = keyView(await keyModel.findOne({ organizationId: orgId, provider }).lean());
  if (!before) throw new AiKeyError('KEY_NOT_FOUND', `No ${labelOf(provider)} key is saved.`, { provider });
  await keyModel.deleteOne({ organizationId: orgId, provider });
  invalidate(organizationId);
  return { before };
}

/** The two switches. Own keys can only be turned on once at least one key is saved. */
async function updateSettings({ organizationId, usePersonalKeys, actorId = null }) {
  const orgId = toObjectId(organizationId);
  const before = await getSettings(organizationId);
  const next = {
    usePersonalKeys: usePersonalKeys === undefined ? before.usePersonalKeys : Boolean(usePersonalKeys),
  };
  if (next.usePersonalKeys && !before.usePersonalKeys && !(await keyModel.countDocuments({ organizationId: orgId }))) {
    throw new AiKeyError('KEYS_REQUIRED', 'Add at least one API key before turning on your own keys.');
  }
  await settingModel.findOneAndUpdate({ organizationId: orgId }, { $set: { ...next, updatedBy: actorId ? toObjectId(actorId) : null } }, { upsert: true, new: true }).lean();
  invalidate(organizationId);
  return { before, after: next };
}

// ── Request time ─────────────────────────────────────────────────────────────
const CACHE_MS = 15 * 1000;
const cache = new Map();
function invalidate(organizationId) {
  cache.delete(String(organizationId));
}

/** The organization's switches and stored (encrypted) keys; cached briefly per organization. */
async function getOrgKeyConfig(organizationId, { fresh = false } = {}) {
  const k = String(organizationId);
  const hit = cache.get(k);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.config;
  const orgId = toObjectId(organizationId);
  const [s, keys] = await Promise.all([settingModel.findOne({ organizationId: orgId }).lean(), keyModel.find({ organizationId: orgId }).select('+encryptedKey').lean()]);
  const config = {
    organizationId: k,
    enabled: Boolean(s?.usePersonalKeys),
    keys: Object.fromEntries(keys.map((d) => [d.provider, { encryptedKey: d.encryptedKey, status: d.status }])),
  };
  cache.set(k, { at: Date.now(), config });
  return config;
}

/** The organization's plain key for a provider, or null when none is saved. */
function personalKeyFor(config, provider) {
  const entry = config?.keys?.[provider];
  if (!entry?.encryptedKey) return null;
  return decryptApiKey(entry.encryptedKey, { organizationId: toObjectId(config.organizationId), provider });
}

/** Record that the provider refused the key (invalid, quota, rate limit) so the owner sees it. */
async function markKeyProblem(organizationId, provider, kind, message, now = new Date()) {
  const status = STATUS_FOR_KIND[kind];
  if (!status) return;
  await keyModel.updateOne({ organizationId: toObjectId(organizationId), provider }, { $set: { status, statusMessage: scrub(message) || null, lastErrorAt: now } });
  invalidate(organizationId);
}

const USED_WRITE_MS = 5 * 60 * 1000;
const lastUsedWrites = new Map();
/** Note the key was used (at most one write per key every few minutes); a working key is VALID. */
async function markKeyUsed(organizationId, provider, now = new Date()) {
  const k = `${organizationId}:${provider}`;
  if (now.getTime() - (lastUsedWrites.get(k) || 0) < USED_WRITE_MS) return;
  lastUsedWrites.set(k, now.getTime());
  await keyModel.updateOne({ organizationId: toObjectId(organizationId), provider }, { $set: { lastUsedAt: now, status: 'VALID', statusMessage: null } });
}

const _resetForTests = () => {
  cache.clear();
  lastUsedWrites.clear();
  verifier = defaultVerifier;
};

module.exports = {
  PROVIDERS,
  PROVIDER_KEYS,
  featureProviders,
  AiKeyError,
  isAiKeyError,
  classifyProviderError,
  scrub,
  setKeyVerifier,
  defaultVerifier,
  checkFormat,
  getSettings,
  ownKeysSummary,
  overview,
  saveKey,
  revalidateKey,
  removeKey,
  updateSettings,
  getOrgKeyConfig,
  personalKeyFor,
  markKeyProblem,
  markKeyUsed,
  invalidate,
  labelOf,
  _resetForTests,
};
