'use strict';

/**
 * Request-scoped AI usage meter.
 *
 * A metered request (see withAiCredits) runs inside an AsyncLocalStorage context holding a meter.
 * Any code that calls an AI model during that request — the shared aiProvider layer, or a helper
 * that calls a provider SDK directly — reports the tokens with recordAiUsage(). Nothing has to be
 * passed through function arguments, so adding metering to a new feature is one wrapper on its route.
 *
 * Outside a metered request every function here is a no-op.
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
// Whose API key the AI calls inside this context use: 'PERSONAL' (the organization's own key, not
// charged) or 'PLATFORM' (the platform's key, charged to the wallet). See aiKeys/aiKeyRouting.
const keySourceStorage = new AsyncLocalStorage();

const toInt = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};

/**
 * Normalize provider usage to one shape. `inputTokens` is always the full prompt size:
 * Anthropic reports cached prompt tokens separately from input_tokens, OpenAI and Gemini
 * include them in the prompt count.
 */
function normalizeUsage(u = {}) {
  const provider = String(u.provider || '').toLowerCase() || null;
  const cacheRead = toInt(u.cacheReadInputTokens);
  const cacheCreation = toInt(u.cacheCreationInputTokens);
  let inputTokens = toInt(u.inputTokens);
  if (provider === 'anthropic') inputTokens += cacheRead + cacheCreation;
  return {
    provider,
    model: u.model ? String(u.model) : null,
    inputTokens,
    outputTokens: toInt(u.outputTokens),
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheCreation,
    images: toInt(u.images), // generated images (priced per image, not per token)
  };
}

/** Token usage from a raw provider response (OpenAI chat completion, Gemini, Anthropic message). */
function usageFromResponse(provider, model, response) {
  if (!response) return null;
  const p = String(provider || '').toLowerCase();
  if (p === 'openai') {
    const u = response.usage || {};
    return { provider: p, model: response.model || model, inputTokens: u.prompt_tokens ?? u.input_tokens, outputTokens: u.completion_tokens ?? u.output_tokens, cacheReadInputTokens: u.prompt_tokens_details?.cached_tokens };
  }
  if (p === 'gemini') {
    const u = response.usageMetadata || response.response?.usageMetadata || {};
    // Gemini "thinking" tokens are billed as output
    return { provider: p, model, inputTokens: u.promptTokenCount, outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), cacheReadInputTokens: u.cachedContentTokenCount };
  }
  if (p === 'anthropic') {
    const u = response.usage || {};
    return { provider: p, model: response.model || model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadInputTokens: u.cache_read_input_tokens, cacheCreationInputTokens: u.cache_creation_input_tokens };
  }
  return null;
}

function getAiMeter() {
  return storage.getStore() || null;
}

/** Record one AI call's tokens on the current request's meter. Returns false outside a metered request. */
function recordAiUsage(usage) {
  const meter = getAiMeter();
  if (!meter || !usage) return false;
  const call = normalizeUsage(usage);
  if (!call.inputTokens && !call.outputTokens && !call.images) return false;
  call.keySource = usage.keySource || currentKeySource();
  meter.calls.push(call);
  return true;
}

/** Key source of the AI call running now ('PLATFORM' unless inside runWithKeySource('PERSONAL')). */
function currentKeySource() {
  return keySourceStorage.getStore()?.source || 'PLATFORM';
}

function runWithKeySource(source, fn) {
  return keySourceStorage.run({ source }, fn);
}

/**
 * Convenience for helpers that call an SDK directly: record from the raw response.
 * extra.images: number of images the call generated (image calls are priced per image).
 */
function recordAiResponse(provider, model, response, extra = {}) {
  const usage = usageFromResponse(provider, model, response) || { provider, model };
  return recordAiUsage({ ...usage, ...extra });
}

/**
 * Make sure credits are held for the current request before an AI call (no-op outside a metered
 * request or when already held). Throws AiCreditsError when the wallet can't cover it.
 */
async function ensureAiCredits() {
  const meter = getAiMeter();
  if (!meter || typeof meter.reserve !== 'function') return null;
  return meter.reserve();
}

function runWithAiMeter(meter, fn) {
  return storage.run(meter, fn);
}

/** Run fn with no meter: for internal/system AI calls that must never be charged to the customer. */
function runOutsideAiMeter(fn) {
  return storage.exit(fn);
}

module.exports = {
  currentKeySource,
  runWithKeySource,
  normalizeUsage,
  usageFromResponse,
  getAiMeter,
  recordAiUsage,
  recordAiResponse,
  ensureAiCredits,
  runWithAiMeter,
  runOutsideAiMeter,
};
