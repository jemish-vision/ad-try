'use strict';

/**
 * AI credit wallet: one per organization, refilled every calendar month (UTC).
 *
 * Money safety rules
 *  - Every balance change is one atomic MongoDB update. A request first HOLDS credits with a
 *    conditional update (only succeeds while `balance` covers the hold), so concurrent requests
 *    can never spend the same credits twice.
 *  - Each request has a usage-log row whose status moves RESERVED → SETTLED | RELEASED | EXPIRED
 *    in one atomic update; only the caller that wins that update touches the wallet, so a request
 *    is charged at most once even if settle is called repeatedly.
 *  - Ledger rows carry a unique dedupeKey, so a retried reset / allocation / deduction is written once.
 *
 * `balance` is stored (allocated - used - reserved) so the hold check is a simple indexed condition.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const walletModel = require('../../models/aiCreditWallet.model');
const transactionModel = require('../../models/aiCreditTransaction.model');
const usageLogModel = require('../../models/aiUsageLog.model');
const settingModel = require('../../models/aiCreditSetting.model');
const organizationModel = require('../../models/organization.model');
const packagesModel = require('../../models/packages.model');

// ── Features ─────────────────────────────────────────────────────────────────
// Every AI feature that spends credits is listed here. `reserve` is the default number of
// credits held while one request runs (Super Admin can change it); a request needs at least
// that much available to start.
const FEATURES = Object.freeze({
  AI_ASSISTANT: { key: 'AI_ASSISTANT', label: 'AI Assistant', reserve: 20 },
  LISTING_OPTIMIZATION: { key: 'LISTING_OPTIMIZATION', label: 'Optimize with AI', reserve: 25 },
  LISTING_GENERATION: { key: 'LISTING_GENERATION', label: 'AI listing generation', reserve: 15 },
  // A+ text; generated images are held on top of this (creditsPerImage each)
  APLUS_CONTENT: { key: 'APLUS_CONTENT', label: 'A+ Content', reserve: 20 },
  CAMPAIGN_ANALYSIS: { key: 'CAMPAIGN_ANALYSIS', label: 'Campaign AI Analysis', reserve: 15 },
});

const DEFAULT_SETTINGS = Object.freeze({
  enforcementEnabled: true,
  defaultMonthlyCredits: 500,
  inputCreditsPer1K: 1,
  outputCreditsPer1K: 4,
  minimumChargePerRequest: 0,
  creditsPerImage: 10,
  modelRates: [],
  featureReserves: {},
});

const STALE_HOLD_MINUTES = 15;
// Holds for background work (A+ image batch jobs at Google) wait up to 72 hours for the job.
const STALE_DEFERRED_HOLD_HOURS = 72;
const SETTINGS_TTL_MS = 30 * 1000;

class AiCreditsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AiCreditsError';
    this.code = code;
    this.statusCode = code === 'AI_CREDITS_EXHAUSTED' ? 402 : 409;
    this.details = details;
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));
const isDuplicateKey = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));

// ── Indexes (autoIndex is off for the app connection: create once, lazily) ──
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = Promise.all([walletModel, transactionModel, usageLogModel, settingModel].map((m) => (typeof m.createIndexes === 'function' ? m.createIndexes() : null))).catch(() => {
      indexesReady = null;
    });
  }
  return indexesReady;
}

// ── Settings ─────────────────────────────────────────────────────────────────
let settingsCache = null;
let settingsCachedAt = 0;

function activeAssistantModel() {
  const provider = String(process.env.AI_PROVIDER || 'anthropic').toLowerCase().trim();
  if (provider === 'openai') return process.env.OPENAI_MODEL || 'gpt-4o';
  if (provider === 'gemini') return process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  return process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
}

function dynamicReservePlans(feature) {
  switch (feature) {
    case 'AI_ASSISTANT':
      return [[{ model: activeAssistantModel(), inputTokens: 35000, outputTokens: 4000 }]];
    case 'LISTING_OPTIMIZATION':
      return [[
        { model: 'gemini-3.8-flash', inputTokens: 8000, outputTokens: 4000 },
        { model: 'gpt-4o-mini', inputTokens: 2000, outputTokens: 1000 },
      ]];
    case 'LISTING_GENERATION':
      return [[{ model: 'gpt-4o-mini', inputTokens: 5000, outputTokens: 3000 }]];
    case 'APLUS_CONTENT':
      return [[{ model: process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash', inputTokens: 6000, outputTokens: 5000 }]];
    case 'CAMPAIGN_ANALYSIS':
      return ['gemini-3.8-flash', 'gpt-4o-mini'].map(model => [{ model, inputTokens: 15000, outputTokens: 3000 }]);
    default:
      return [];
  }
}

function normalizeSettings(doc) {
  const s = { ...DEFAULT_SETTINGS, ...(doc || {}) };
  const reserves = s.featureReserves instanceof Map ? Object.fromEntries(s.featureReserves) : { ...(s.featureReserves || {}) };
  const base = {
    enforcementEnabled: s.enforcementEnabled !== false,
    defaultMonthlyCredits: Number(s.defaultMonthlyCredits) || 0,
    inputCreditsPer1K: Number(s.inputCreditsPer1K) || 0,
    outputCreditsPer1K: Number(s.outputCreditsPer1K) || 0,
    minimumChargePerRequest: Number(s.minimumChargePerRequest) || 0,
    creditsPerImage: Number.isFinite(Number(s.creditsPerImage)) && s.creditsPerImage !== null ? Number(s.creditsPerImage) : DEFAULT_SETTINGS.creditsPerImage,
    modelRates: (s.modelRates || []).map((r) => ({ model: String(r.model), inputCreditsPer1K: Number(r.inputCreditsPer1K) || 0, outputCreditsPer1K: Number(r.outputCreditsPer1K) || 0 })),
    updatedAt: s.updatedAt || null,
  };
  const featureReservePlans = Object.values(FEATURES).map(({ key, reserve }) => {
    const plans = dynamicReservePlans(key);
    const override = reserves[key] != null && Number.isFinite(Number(reserves[key])) ? round2(reserves[key]) : null;
    const amount = override ?? (plans.length ? Math.max(...plans.map(calls => priceCalls(calls, base).credits)) : reserve);
    return { key, plans, override, amount };
  });
  return { ...base, featureReservePlans, featureReserves: Object.fromEntries(featureReservePlans.map(({ key, amount }) => [key, amount])) };
}

async function getSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache && Date.now() - settingsCachedAt < SETTINGS_TTL_MS) return settingsCache;
  const doc = await settingModel.findOne({ key: 'global' }).lean();
  settingsCache = normalizeSettings(doc);
  settingsCachedAt = Date.now();
  return settingsCache;
}

function validateSettingsInput(input = {}) {
  const errors = [];
  const nonNeg = (k) => {
    if (input[k] === undefined) return;
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be 0 or more`);
  };
  ['defaultMonthlyCredits', 'inputCreditsPer1K', 'outputCreditsPer1K', 'minimumChargePerRequest', 'creditsPerImage'].forEach(nonNeg);
  if (input.modelRates !== undefined) {
    if (!Array.isArray(input.modelRates)) errors.push('modelRates must be a list');
    else {
      const seen = new Set();
      input.modelRates.forEach((r, i) => {
        const model = String(r?.model || '').trim();
        if (!model) errors.push(`modelRates[${i}].model is required`);
        if (seen.has(model.toLowerCase())) errors.push(`modelRates has "${model}" twice`);
        seen.add(model.toLowerCase());
        ['inputCreditsPer1K', 'outputCreditsPer1K'].forEach((k) => {
          const v = Number(r?.[k]);
          if (!Number.isFinite(v) || v < 0) errors.push(`modelRates[${i}].${k} must be 0 or more`);
        });
      });
    }
  }
  if (input.featureReserves !== undefined) {
    Object.entries(input.featureReserves || {}).forEach(([k, v]) => {
      if (!FEATURES[k]) errors.push(`Unknown feature ${k}`);
      else if (!Number.isFinite(Number(v)) || Number(v) < 0) errors.push(`featureReserves.${k} must be 0 or more`);
    });
  }
  return errors;
}

async function updateSettings(input, actorId) {
  const errors = validateSettingsInput(input);
  if (errors.length) throw new AiCreditsError('INVALID_SETTINGS', errors.join('; '));
  const current = await getSettings({ fresh: true });
  const $set = { updatedBy: actorId ? toObjectId(actorId) : null };
  if (input.enforcementEnabled !== undefined) $set.enforcementEnabled = Boolean(input.enforcementEnabled);
  ['defaultMonthlyCredits', 'inputCreditsPer1K', 'outputCreditsPer1K', 'minimumChargePerRequest', 'creditsPerImage'].forEach((k) => {
    if (input[k] !== undefined) $set[k] = round4(input[k]);
  });
  if (input.modelRates !== undefined) {
    $set.modelRates = input.modelRates.map((r) => ({ model: String(r.model).trim(), inputCreditsPer1K: round4(r.inputCreditsPer1K), outputCreditsPer1K: round4(r.outputCreditsPer1K) }));
  }
  if (input.featureReserves !== undefined) {
    const entries = Object.entries(input.featureReserves || {});
    if (!entries.length) {
      $set.featureReserves = {};
    } else {
      const existingRaw = (await settingModel.findOne({ key: 'global' }).lean())?.featureReserves;
      const prevMap = existingRaw instanceof Map ? Object.fromEntries(existingRaw) : { ...(existingRaw || {}) };
      $set.featureReserves = {
        ...prevMap,
        ...Object.fromEntries(entries.map(([k, v]) => [k, round2(v)])),
      };
    }
  }
  await ensureIndexes();
  await settingModel.findOneAndUpdate({ key: 'global' }, { $set, $setOnInsert: { key: 'global' } }, { upsert: true, new: true }).lean();
  return getSettings({ fresh: true });
}

// ── Cost ─────────────────────────────────────────────────────────────────────
/** Credits per 1K tokens for a model: the longest matching model rate (exact id or prefix), else the defaults. */
function rateForModel(model, settings) {
  const m = String(model || '').toLowerCase();
  let best = null;
  for (const r of settings.modelRates || []) {
    const key = r.model.toLowerCase();
    if (m && m.startsWith(key) && (!best || key.length > best.model.length)) best = r;
  }
  return best ? { inputCreditsPer1K: best.inputCreditsPer1K, outputCreditsPer1K: best.outputCreditsPer1K, matched: best.model } : { inputCreditsPer1K: settings.inputCreditsPer1K, outputCreditsPer1K: settings.outputCreditsPer1K, matched: null };
}

function creditsForCall(call, settings) {
  // Image generation is priced per image, whatever tokens the call reports
  if (call.images > 0) return round4(call.images * settings.creditsPerImage);
  const rate = rateForModel(call.model, settings);
  return round4((call.inputTokens / 1000) * rate.inputCreditsPer1K + (call.outputTokens / 1000) * rate.outputCreditsPer1K);
}

/** Total cost of a request's calls, rounded to 0.01, with the minimum charge applied when any AI was used. */
function priceCalls(calls = [], settings) {
  const priced = calls.map((c) => ({ ...c, credits: creditsForCall(c, settings) }));
  let total = priced.reduce((s, c) => s + c.credits, 0);
  if (priced.length && total < settings.minimumChargePerRequest) total = settings.minimumChargePerRequest;
  const inputTokens = priced.reduce((s, c) => s + c.inputTokens, 0);
  const outputTokens = priced.reduce((s, c) => s + c.outputTokens, 0);
  const images = priced.reduce((s, c) => s + (c.images || 0), 0);
  return { calls: priced, credits: round2(total), inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, images, models: [...new Set(priced.map((c) => c.model).filter(Boolean))] };
}

// ── Periods & allowance ──────────────────────────────────────────────────────
function monthPeriod(date = new Date()) {
  const d = new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Monthly allowance for an organization: Super Admin override, else its plan, else the global default. */
async function resolveMonthlyLimit(organizationId, override, settings) {
  if (override !== null && override !== undefined) return { limit: round2(override), source: 'OVERRIDE' };
  const org = await organizationModel.findById(organizationId).select('planId').lean();
  if (org?.planId) {
    const plan = await packagesModel.findById(org.planId).select('aiMonthlyCredits').lean();
    if (plan && plan.aiMonthlyCredits !== null && plan.aiMonthlyCredits !== undefined) return { limit: round2(plan.aiMonthlyCredits), source: 'PLAN' };
  }
  return { limit: round2(settings.defaultMonthlyCredits), source: 'DEFAULT' };
}

async function writeTransaction(tx) {
  try {
    await transactionModel.create(tx);
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false; // already written by another caller
    throw err;
  }
}

// ── Wallet lifecycle ─────────────────────────────────────────────────────────
async function createWallet(orgId, settings, now) {
  const { start, end } = monthPeriod(now);
  const { limit, source } = await resolveMonthlyLimit(orgId, null, settings);
  try {
    const w = await walletModel.create({ organizationId: orgId, periodStart: start, periodEnd: end, monthlyLimit: limit, limitSource: source, allocated: limit, used: 0, reserved: 0, balance: limit, lastResetAt: now });
    const wallet = typeof w.toObject === 'function' ? w.toObject() : w;
    await writeTransaction({ organizationId: orgId, walletId: wallet._id, type: 'ALLOCATION', credits: limit, balanceAfter: limit, periodStart: start, note: 'Monthly allowance', dedupeKey: `alloc:${orgId}:${start.toISOString()}` });
    return wallet;
  } catch (err) {
    if (isDuplicateKey(err)) return walletModel.findOne({ organizationId: orgId }).lean(); // created concurrently
    throw err;
  }
}

/**
 * Close the finished period and grant this month's allowance. Optimistic: the update only applies
 * if the wallet is unchanged since it was read, so exactly one caller performs a given reset;
 * the others re-read. Credits still held by running requests carry over.
 */
async function rollOver(wallet, settings, now) {
  let current = wallet;
  for (let attempt = 0; attempt < 5 && current && new Date(current.periodEnd) <= now; attempt += 1) {
    const { start, end } = monthPeriod(now);
    const { limit, source } = await resolveMonthlyLimit(current.organizationId, current.monthlyLimitOverride, settings);
    const reserved = round2(current.reserved);
    const updated = await walletModel
      .findOneAndUpdate(
        { _id: current._id, periodEnd: current.periodEnd, reserved: current.reserved, used: current.used, allocated: current.allocated },
        { $set: { periodStart: start, periodEnd: end, monthlyLimit: limit, limitSource: source, allocated: limit, used: 0, balance: round2(limit - reserved), lastResetAt: now } },
        { new: true }
      )
      .lean();
    if (updated) {
      const unused = round2(current.allocated - current.used - current.reserved);
      await writeTransaction({ organizationId: current.organizationId, walletId: current._id, type: 'RESET', credits: -Math.max(0, unused), balanceAfter: 0, periodStart: current.periodStart, note: `Period closed: ${round2(current.used)} of ${round2(current.allocated)} credits used`, dedupeKey: `reset:${current.organizationId}:${start.toISOString()}` });
      await writeTransaction({ organizationId: current.organizationId, walletId: current._id, type: 'ALLOCATION', credits: limit, balanceAfter: updated.balance, periodStart: start, note: 'Monthly allowance', dedupeKey: `alloc:${current.organizationId}:${start.toISOString()}` });
      return updated;
    }
    current = await walletModel.findById(current._id).lean(); // someone else changed it; re-check
  }
  return current;
}

/** The organization's wallet for the current period (created on first use, reset if a new month began). */
async function getWallet(organizationId, { now = new Date(), settings } = {}) {
  await ensureIndexes();
  const orgId = toObjectId(organizationId);
  const s = settings || (await getSettings());
  let wallet = await walletModel.findOne({ organizationId: orgId }).lean();
  if (!wallet) wallet = await createWallet(orgId, s, now);
  if (wallet && new Date(wallet.periodEnd) <= now) wallet = await rollOver(wallet, s, now);
  return wallet;
}

function walletView(w) {
  if (!w) return null;
  return {
    organizationId: w.organizationId,
    monthlyLimit: round2(w.monthlyLimit),
    limitSource: w.limitSource,
    monthlyLimitOverride: w.monthlyLimitOverride ?? null,
    allocated: round2(w.allocated),
    used: round2(w.used),
    reserved: round2(w.reserved),
    available: round2(Math.max(0, w.balance)),
    periodStart: w.periodStart,
    nextResetAt: w.periodEnd,
    lastResetAt: w.lastResetAt || null,
    lastUsedAt: w.lastUsedAt || null,
  };
}

// ── Holds & charges ──────────────────────────────────────────────────────────
/**
 * Hold credits for one AI request. Returns the hold; throws AiCreditsError when the wallet can't
 * cover it (AI_CREDITS_EXHAUSTED) or the requestId was already used (DUPLICATE_AI_REQUEST).
 */
async function reserve({ organizationId, userId = null, feature, requestId, amount: customAmount, deferred = false, now = new Date() }) {
  if (!FEATURES[feature]) throw new Error(`Unknown AI feature ${feature}`);
  const settings = await getSettings();
  const wallet = await getWallet(organizationId, { now, settings });
  const enforced = settings.enforcementEnabled;
  // customAmount: callers that know the cost up front (e.g. N images) hold that instead of the feature default
  const amount = enforced ? round2(customAmount !== undefined && customAmount !== null ? Math.max(0, customAmount) : settings.featureReserves[feature]) : 0;

  let held = wallet;
  if (enforced && amount <= 0 && !(wallet.balance > 0)) {
    throw new AiCreditsError('AI_CREDITS_EXHAUSTED', 'Not enough AI credits for this request.', { wallet: walletView(wallet), required: 0 });
  }
  if (amount > 0) {
    held = await walletModel.findOneAndUpdate({ _id: wallet._id, balance: { $gte: amount } }, { $inc: { reserved: amount, balance: -amount } }, { new: true }).lean();
    if (!held) {
      const fresh = await walletModel.findById(wallet._id).lean();
      throw new AiCreditsError('AI_CREDITS_EXHAUSTED', 'Not enough AI credits for this request.', { wallet: walletView(fresh || wallet), required: amount });
    }
  }
  try {
    await usageLogModel.create({ requestId, organizationId: wallet.organizationId, walletId: wallet._id, userId: userId ? toObjectId(userId) : null, feature, status: 'RESERVED', reservedCredits: amount, enforced, deferred: Boolean(deferred) });
  } catch (err) {
    if (amount > 0) await walletModel.findOneAndUpdate({ _id: wallet._id }, { $inc: { reserved: -amount, balance: amount } }).lean();
    if (isDuplicateKey(err)) throw new AiCreditsError('DUPLICATE_AI_REQUEST', 'This AI request was already submitted.');
    throw err;
  }
  return { requestId, organizationId: wallet.organizationId, walletId: wallet._id, userId, feature, amount, enforced, wallet: walletView(held) };
}

/**
 * Charge measured usage up to the confirmed hold and return any unused credits.
 * Safe to call more than once: only the first call changes anything.
 */
async function settle(hold, rawCalls = [], { now = new Date() } = {}) {
  const settings = await getSettings();
  const priced = priceCalls(rawCalls, settings);
  const scope = { requestId: hold.requestId, status: 'RESERVED' };
  let log;
  let credits;
  while (!log) {
    const current = await usageLogModel.findOne(scope).lean();
    if (!current) return { charged: false, duplicate: true, credits: 0 };
    credits = current.enforced !== false ? Math.min(priced.credits, current.reservedCredits) : 0;
    // A background image hold can move onto this request between the read and settlement.
    log = await usageLogModel.findOneAndUpdate(
      { ...scope, reservedCredits: current.reservedCredits },
      { $set: { status: 'SETTLED', credits, meteredCredits: priced.credits, inputTokens: priced.inputTokens, outputTokens: priced.outputTokens, totalTokens: priced.totalTokens, images: priced.images, models: priced.models, calls: priced.calls, settledAt: now } },
      { new: true }
    ).lean();
  }

  const wallet = await walletModel
    .findOneAndUpdate(
      { _id: hold.walletId },
      {
        $inc: { reserved: -log.reservedCredits, used: credits, balance: round2(log.reservedCredits - credits), lifetimeUsed: credits, lifetimeInputTokens: priced.inputTokens, lifetimeOutputTokens: priced.outputTokens },
        $set: { lastUsedAt: now },
      },
      { new: true }
    )
    .lean();
  if (credits > 0) {
    await writeTransaction({ organizationId: hold.organizationId, walletId: hold.walletId, type: 'DEDUCTION', credits: -credits, balanceAfter: wallet ? round2(wallet.balance) : null, feature: hold.feature, requestId: hold.requestId, userId: hold.userId ? toObjectId(hold.userId) : null, note: `${priced.images ? `${priced.images} images, ` : ''}${priced.totalTokens} tokens (${priced.models.join(', ') || 'AI'})`, dedupeKey: `deduct:${hold.requestId}` });
  }
  return { ...priced, charged: credits > 0, credits, meteredCredits: priced.credits, wallet: walletView(wallet) };
}

/**
 * Return a hold without charging: the request failed, was blocked, or needed no AI (e.g. a cached
 * result). Tokens actually used are still logged for reporting. Safe to call more than once.
 */
async function release(hold, reason, rawCalls = [], { status = 'RELEASED', now = new Date() } = {}) {
  const settings = await getSettings();
  const priced = priceCalls(rawCalls, settings);
  const log = await usageLogModel
    .findOneAndUpdate(
      { requestId: hold.requestId, status: 'RESERVED' },
      { $set: { status, failureReason: reason || null, credits: 0, inputTokens: priced.inputTokens, outputTokens: priced.outputTokens, totalTokens: priced.totalTokens, images: priced.images, models: priced.models, calls: priced.calls, settledAt: now } },
      { new: true }
    )
    .lean();
  if (!log) return { released: false };
  const update = { $inc: { reserved: -log.reservedCredits, balance: log.reservedCredits, lifetimeInputTokens: priced.inputTokens, lifetimeOutputTokens: priced.outputTokens } };
  await walletModel.findOneAndUpdate({ _id: hold.walletId }, update).lean();
  return { released: true };
}

/**
 * Move a hold's credits onto another running request's hold, without returning them to the
 * wallet in between (so nothing else can take them). Used when background work falls back to
 * running inside the request. Returns the credits moved (0 if the source was already closed).
 */
async function transferHold(fromHold, toHold, { now = new Date() } = {}) {
  const from = await usageLogModel
    .findOneAndUpdate({ requestId: fromHold.requestId, status: 'RESERVED' }, { $set: { status: 'RELEASED', failureReason: 'Moved to the request', settledAt: now } }, { new: false })
    .lean();
  if (!from) return 0;
  const amount = from.reservedCredits || 0;
  const to = await usageLogModel.findOneAndUpdate({ requestId: toHold.requestId, status: 'RESERVED' }, { $inc: { reservedCredits: amount } }, { new: true }).lean();
  if (!to) {
    // The target already finished: give the credits back instead
    await walletModel.findOneAndUpdate({ _id: from.walletId }, { $inc: { reserved: -amount, balance: amount } }).lean();
    return 0;
  }
  toHold.amount = round2((toHold.amount || 0) + amount);
  return amount;
}

/** Return holds left by requests that never finished (e.g. the server restarted mid-request). */
async function expireStaleHolds({ olderThanMinutes = STALE_HOLD_MINUTES, now = new Date(), limit = 500 } = {}) {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60 * 1000);
  const deferredCutoff = new Date(now.getTime() - STALE_DEFERRED_HOLD_HOURS * 60 * 60 * 1000);
  const fields = 'requestId organizationId walletId feature reservedCredits deferred';
  const [requestHolds, deferredHolds] = await Promise.all([
    usageLogModel.find({ status: 'RESERVED', deferred: { $ne: true }, createdAt: { $lt: cutoff } }).select(fields).limit(limit).lean(),
    usageLogModel.find({ status: 'RESERVED', deferred: true, createdAt: { $lt: deferredCutoff } }).select(fields).limit(limit).lean(),
  ]);
  const stale = [...requestHolds, ...deferredHolds];
  let expired = 0;
  for (const log of stale) {
    const r = await release({ requestId: log.requestId, walletId: log.walletId }, 'Request did not finish', [], { status: 'EXPIRED', now });
    if (r.released) expired += 1;
  }
  return { expired };
}

// ── Admin ────────────────────────────────────────────────────────────────────
/** Add (positive) or remove (negative) credits for the current period. */
async function adjustCredits({ organizationId, credits, note, actorId, now = new Date() }) {
  const amount = round2(credits);
  if (!Number.isFinite(amount) || amount === 0) throw new AiCreditsError('INVALID_ADJUSTMENT', 'Enter a non-zero number of credits.');
  if (!String(note || '').trim()) throw new AiCreditsError('INVALID_ADJUSTMENT', 'A reason is required.');
  const wallet = await getWallet(organizationId, { now });
  const updated = await walletModel.findOneAndUpdate({ _id: wallet._id }, { $inc: { allocated: amount, balance: amount } }, { new: true }).lean();
  await writeTransaction({ organizationId: wallet.organizationId, walletId: wallet._id, type: 'ADJUSTMENT', credits: amount, balanceAfter: round2(updated.balance), periodStart: updated.periodStart, userId: actorId ? toObjectId(actorId) : null, note: String(note).trim(), dedupeKey: `adjust:${crypto.randomUUID()}` });
  return walletView(updated);
}

/**
 * Set (number) or clear (null) an organization's own monthly allowance. Takes effect now: this
 * period's allowance moves by the difference, so credits already used still count.
 */
async function setMonthlyLimitOverride({ organizationId, limit, actorId, now = new Date() }) {
  const value = limit === null || limit === undefined || limit === '' ? null : round2(limit);
  if (value !== null && (!Number.isFinite(value) || value < 0)) throw new AiCreditsError('INVALID_ADJUSTMENT', 'Monthly credits must be 0 or more.');
  const settings = await getSettings();
  const wallet = await getWallet(organizationId, { now, settings });
  const { limit: newLimit, source } = await resolveMonthlyLimit(wallet.organizationId, value, settings);
  const diff = round2(newLimit - wallet.monthlyLimit);
  const updated = await walletModel.findOneAndUpdate({ _id: wallet._id }, { $set: { monthlyLimitOverride: value, monthlyLimit: newLimit, limitSource: source }, $inc: { allocated: diff, balance: diff } }, { new: true }).lean();
  if (diff !== 0) {
    await writeTransaction({ organizationId: wallet.organizationId, walletId: wallet._id, type: 'ADJUSTMENT', credits: diff, balanceAfter: round2(updated.balance), periodStart: updated.periodStart, userId: actorId ? toObjectId(actorId) : null, note: value === null ? `Monthly allowance reset to plan (${round2(wallet.monthlyLimit)} → ${newLimit})` : `Monthly allowance changed (${round2(wallet.monthlyLimit)} → ${newLimit})`, dedupeKey: `adjust:${crypto.randomUUID()}` });
  }
  return walletView(updated);
}

/** Scheduled: reset every wallet whose month has ended, and return stale holds. */
async function runMonthlyMaintenance({ now = new Date(), batchSize = 200 } = {}) {
  await ensureIndexes();
  const settings = await getSettings({ fresh: true });
  let reset = 0;
  let lastId = null;
  for (;;) {
    const filter = { periodEnd: { $lte: now } };
    if (lastId) filter._id = { $gt: lastId };
    const due = await walletModel.find(filter).sort({ _id: 1 }).limit(batchSize).lean();
    if (!due.length) break;
    for (const w of due) {
      const after = await rollOver(w, settings, now);
      if (after && new Date(after.periodStart).getTime() !== new Date(w.periodStart).getTime()) reset += 1;
    }
    lastId = due[due.length - 1]._id;
    if (due.length < batchSize) break;
  }
  const { expired } = await expireStaleHolds({ now });
  return { reset, expiredHolds: expired };
}

module.exports = {
  FEATURES,
  DEFAULT_SETTINGS,
  STALE_DEFERRED_HOLD_HOURS,
  AiCreditsError,
  getSettings,
  updateSettings,
  validateSettingsInput,
  normalizeSettings,
  rateForModel,
  creditsForCall,
  priceCalls,
  monthPeriod,
  resolveMonthlyLimit,
  getWallet,
  walletView,
  reserve,
  settle,
  release,
  transferHold,
  expireStaleHolds,
  adjustCredits,
  setMonthlyLimitOverride,
  runMonthlyMaintenance,
  ensureIndexes,
  _resetSettingsCache: () => {
    settingsCache = null;
    settingsCachedAt = 0;
  },
};
