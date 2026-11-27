'use strict';

/**
 * Chooses the API key for each AI call and enforces "no wallet charge without consent".
 *
 *   const text = await withProviderKey('openai', (apiKey) => callOpenAI(apiKey, ...));
 *
 * - Outside a metered request, or when the organization doesn't use its own keys: the platform's
 *   key (env), charged to the wallet as before.
 * - Own keys on: the organization's key for that provider. Calls made with it are recorded with
 *   keySource PERSONAL (tokens logged, no credits).
 * - Own keys on but no key for the provider, or the provider refuses it (invalid/expired, quota,
 *   rate limit): if the owner allowed wallet fallback, the call runs once on the platform's key and
 *   the wallet is held and charged for it; otherwise the request stops with a PERSONAL_KEY_* error.
 *   The key's status is updated so the owner sees what went wrong.
 * Errors that aren't about the key (provider outage, bad request) are passed through unchanged.
 */
const aiKeys = require('./aiKey.service');
const { getAiMeter, runWithKeySource } = require('../aiCredits/aiUsageMeter');
const { AiCreditsError } = require('../aiCredits/aiCredit.service');
const { write_logs } = require('../../../winston/utility/logger');

const ENV_KEYS = {
  anthropic: () => process.env.ANTHROPIC_API_KEY,
  openai: () => process.env.OPENAI_API_KEY,
  gemini: () => process.env.GOOGLE_AI_STUDIO_KEY || process.env.GEMINI_API_KEY,
};
const platformKey = (provider) => ENV_KEYS[provider]?.() || null;

const KEY_ERRORS = {
  MISSING: {
    code: 'PERSONAL_KEY_MISSING',
    message: (label) => `Your organization uses its own AI API keys, but no ${label} key is saved. Add one on the AI API Keys page, or ask the owner to allow wallet credits when a key can't be used.`,
  },
  UNREADABLE: {
    code: 'PERSONAL_KEY_UNREADABLE',
    message: (label) => `The saved ${label} key can't be read. Add it again on the AI API Keys page.`,
  },
  AUTH: {
    code: 'PERSONAL_KEY_INVALID',
    message: (label) => `${label} rejected your organization's API key (invalid, expired or revoked). Update it on the AI API Keys page.`,
  },
  QUOTA: {
    code: 'PERSONAL_KEY_QUOTA',
    message: (label) => `Your ${label} account has no quota or credit left. Check your billing with ${label}, or update the key on the AI API Keys page.`,
  },
  RATE_LIMIT: {
    code: 'PERSONAL_KEY_RATE_LIMITED',
    message: (label) => `Your ${label} key has hit its rate limit. Please try again in a minute.`,
  },
};

function keyError(provider, kind) {
  const def = KEY_ERRORS[kind];
  return new aiKeys.AiKeyError(def.code, def.message(aiKeys.labelOf(provider)), { provider });
}

/**
 * The key a call to `provider` should use now: { apiKey, source: 'PERSONAL'|'PLATFORM', fallbackAllowed }.
 * Holds wallet credits first when it falls back to the platform's key (own keys on).
 */
async function resolveProviderKey(provider) {
  const meter = getAiMeter();
  if (!meter?.personal) return { apiKey: platformKey(provider), source: 'PLATFORM', fallbackAllowed: false };
  const cfg = meter.keyConfig;
  let personal = null;
  let problem = 'MISSING';
  try {
    personal = aiKeys.personalKeyFor(cfg, provider);
  } catch (err) {
    problem = 'UNREADABLE';
    write_logs({ message: `[aiKeys] stored ${provider} key for ${cfg.organizationId} can't be decrypted`, log_type: 'error' });
  }
  if (personal) return { apiKey: personal, source: 'PERSONAL', fallbackAllowed: cfg.allowWalletFallback };
  if (cfg.allowWalletFallback) {
    await meter.useWallet();
    return { apiKey: platformKey(provider), source: 'PLATFORM', fallbackAllowed: false, fellBack: true };
  }
  throw keyError(provider, problem);
}

/**
 * Run one AI call with the right key (see the file comment). fn(apiKey, source) makes the provider
 * call; source is 'PERSONAL' or 'PLATFORM'.
 */
async function withProviderKey(provider, fn) {
  const r = await resolveProviderKey(provider);
  if (r.source !== 'PERSONAL') return runWithKeySource('PLATFORM', () => fn(r.apiKey, 'PLATFORM'));
  const meter = getAiMeter();
  try {
    const out = await runWithKeySource('PERSONAL', () => fn(r.apiKey, 'PERSONAL'));
    aiKeys.markKeyUsed(meter.organizationId, provider).catch(() => {});
    return out;
  } catch (err) {
    const problem = aiKeys.classifyProviderError(err);
    if (!problem) throw err; // not about the key (outage, bad request): handled as before
    await aiKeys.markKeyProblem(meter.organizationId, provider, problem.kind, problem.message).catch(() => {});
    if (!r.fallbackAllowed) throw keyError(provider, problem.kind);
    await meter.useWallet();
    return runWithKeySource('PLATFORM', () => fn(platformKey(provider), 'PLATFORM'));
  }
}

/** The error to show for a refused own key or an empty wallet, or null for any other error. */
function aiAccessErrorBody(err) {
  if (aiKeys.isAiKeyError(err)) return { isSuccess: false, code: err.code, message: err.message, provider: err.provider || null };
  if (err instanceof AiCreditsError && err.code === 'AI_CREDITS_EXHAUSTED') {
    return { isSuccess: false, code: err.code, message: "You've run out of AI credits for this month.", aiCredits: err.details?.wallet || null, required: err.details?.required ?? null };
  }
  return null;
}

/** True for errors the user must see (own key refused / missing, wallet empty): never swallow these. */
const isAiAccessError = (err) => aiAccessErrorBody(err) !== null;

/** For controller catch blocks: answer with the key / credit error if that's what it is. Returns true if sent. */
function sendAiAccessError(res, err) {
  const body = aiAccessErrorBody(err);
  if (!body || res.headersSent) return false;
  res.status(200).json(body);
  return true;
}

module.exports = { withProviderKey, resolveProviderKey, platformKey, keyError, aiAccessErrorBody, isAiAccessError, sendAiAccessError, KEY_ERRORS };
