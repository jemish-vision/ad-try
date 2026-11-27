'use strict';

/**
 * Wrap an AI route handler so its AI usage is metered and charged to the organization's wallet.
 *
 *   router.post('/thing', verifyToken, withAiCredits('FEATURE_KEY', handler));
 *
 * - Credits are held when the request first needs AI: the handler calls `await req.aiMeter.reserve()`
 *   right before its AI work, and the shared aiProvider layer does it automatically before any call.
 *   Requests that never reach AI (cached result, validation error, FAQ answer) are never blocked or charged.
 * - Every AI call made while the handler runs reports its tokens (see aiUsageMeter).
 * - When the handler finishes: success → charged for the tokens used; failure → the hold is returned
 *   and nothing is charged (tokens are still logged). Failure = an error status (>= 400, or this
 *   app's 203), a JSON body with isSuccess: false / error, an exception, or req.aiMeter.markFailed().
 * - Clients may send an `X-AI-Request-Id` header (8–80 chars of A-Z a-z 0-9 _ -); a repeated id is
 *   rejected instead of charged twice.
 * - Demo (mock) users and requests without an organization (e.g. Super Admin) are not metered.
 * - Organizations that use their own AI API keys (aiKeys): the request is still logged (tokens,
 *   models, key source) but holds 0 credits and is never charged. Only when a key is missing or
 *   fails AND the owner allowed wallet fallback does the meter hold credits (useWallet()).
 */
const crypto = require('crypto');
const service = require('./aiCredit.service');
const aiKeys = require('../aiKeys/aiKey.service');
const { runWithAiMeter } = require('./aiUsageMeter');
const { write_logs } = require('../../../winston/utility/logger');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

function createMeter({ feature, requestId, organizationId, userId, keyConfig = null }) {
  const personal = Boolean(keyConfig?.enabled);
  const meter = {
    feature,
    requestId,
    organizationId,
    userId,
    // The organization's own-key settings for this request (null/disabled = platform keys + wallet)
    keyConfig,
    personal,
    requestedAmount: undefined,
    walletPromise: null,
    calls: [],
    hold: null,
    failed: false,
    failureReason: null,
    pendingReserve: null,
    finalizedPromise: null,
    /**
     * Hold credits for this request (once). Throws AiCreditsError when the wallet can't cover it.
     * opts.amount: hold this many credits instead of the feature's default (e.g. text + N images).
     */
    reserve(opts = {}) {
      if (meter.hold) return Promise.resolve(meter.hold);
      // Own keys: remember the amount in case the wallet is needed later, hold nothing now
      if (personal && meter.requestedAmount === undefined && opts.amount !== undefined) meter.requestedAmount = opts.amount;
      if (!meter.pendingReserve) {
        meter.pendingReserve = service
          .reserve({ organizationId, userId, feature, requestId, amount: opts.amount, personal })
          .then((hold) => {
            meter.hold = hold;
            return hold;
          })
          .catch((err) => {
            meter.pendingReserve = null;
            throw err;
          });
      }
      return meter.pendingReserve;
    },
    /**
     * Own keys only: the organization's key can't be used for a call and the owner allowed wallet
     * fallback. Holds the credits this request would normally hold (once). Throws AI_CREDITS_EXHAUSTED
     * when the wallet can't cover it. No-op for requests that already use the wallet.
     */
    useWallet() {
      if (!personal) return Promise.resolve(meter.hold);
      if (!meter.walletPromise) {
        meter.walletPromise = meter
          .reserve()
          .then((hold) => service.topUpHold(hold, meter.requestedAmount))
          .then((hold) => {
            meter.hold = hold;
            return hold;
          })
          .catch((err) => {
            meter.walletPromise = null;
            throw err;
          });
      }
      return meter.walletPromise;
    },
    markFailed(reason) {
      meter.failed = true;
      if (!meter.failureReason) meter.failureReason = String(reason || 'Request failed').slice(0, 300);
    },
    /** Settle or release once (idempotent — safe to call before streaming `done` AND in `finally`). */
    finalize(res) {
      return finalize(meter, res);
    },
  };
  return meter;
}

function responseFailed(res) {
  return res.statusCode >= 400 || res.statusCode === 203;
}

async function finalize(meter, res) {
  if (meter.finalizedPromise) return meter.finalizedPromise;
  meter.finalizedPromise = (async () => {
    if (meter.pendingReserve && !meter.hold) {
      try { await meter.pendingReserve; } catch (_) {}
    }
    if (!meter.hold) return null;
    try {
      if (meter.failed || responseFailed(res)) {
        return await service.release(meter.hold, meter.failureReason || `HTTP ${res.statusCode}`, meter.calls);
      }
      if (!meter.calls.length) return await service.release(meter.hold, 'No AI used', meter.calls);
      return await service.settle(meter.hold, meter.calls);
    } catch (err) {
      // Never fail the user's request over metering; the stale-hold sweep returns any stuck hold.
      write_logs({ message: `[aiCredits] finalize failed for ${meter.requestId}: ${err.message}`, log_type: 'error' });
      return null;
    }
  })();
  return meter.finalizedPromise;
}

function withAiCredits(feature, handler) {
  if (!service.FEATURES[feature]) throw new Error(`withAiCredits: unknown feature ${feature}`);

  return async function meteredHandler(req, res, next) {
    const organizationId = req.organizationId || req.user?.organizationId;
    if (req.isMockTestingUser || req.user?.isMockUser || !organizationId) return handler(req, res, next);

    const clientId = String(req.headers?.['x-ai-request-id'] || '');
    const requestId = REQUEST_ID_RE.test(clientId) ? `${organizationId}:${clientId}` : crypto.randomUUID();
    // The organization's own-key settings decide whose key (and whose money) this request uses.
    // If they can't be read, stop: guessing "wallet" could charge credits the owner didn't agree to.
    let keyConfig;
    try {
      keyConfig = await aiKeys.getOrgKeyConfig(organizationId);
    } catch (err) {
      write_logs({ message: `[aiKeys] could not load key settings for ${organizationId}: ${aiKeys.scrub(err.message)}`, log_type: 'error' });
      return res.status(200).json({ isSuccess: false, code: 'AI_KEY_SETTINGS_UNAVAILABLE', message: 'AI is unavailable right now. Please try again in a moment.' });
    }
    const meter = createMeter({ feature, requestId, organizationId, userId: req.user?._id || req.user?.id || null, keyConfig });
    req.aiMeter = meter;

    // Express's res.send(object) goes through res.json, so this sees every JSON body.
    const json = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body === 'object' && (body.isSuccess === false || body.error)) {
        meter.markFailed(body.error?.code || body.error?.message || body.message || 'isSuccess: false');
      }
      return json(body);
    };

    try {
      return await runWithAiMeter(meter, () => handler(req, res, next));
    } catch (err) {
      meter.markFailed(err.message);
      throw err;
    } finally {
      await finalize(meter, res);
    }
  };
}

/** Standard JSON body for a request blocked by the wallet. */
function creditErrorBody(err) {
  return {
    isSuccess: false,
    code: err.code,
    message: err.code === 'AI_CREDITS_EXHAUSTED' ? "You've run out of AI credits for this month." : err.message,
    aiCredits: err.details?.wallet || null,
    required: err.details?.required ?? null,
  };
}

/**
 * Hold credits right before a metered request's AI work. Returns true to go ahead; on an empty
 * wallet it sends the standard out-of-credits response (200 + code) and returns false.
 * opts.extraCredits: added to the feature's default hold (e.g. images generated in this request).
 */
async function reserveAiCredits(req, res, { extraCredits = 0 } = {}) {
  const meter = req?.aiMeter;
  if (!meter) return true; // not metered (demo user / no organization)
  try {
    let amount;
    if (extraCredits > 0) {
      const settings = await service.getSettings();
      amount = (settings.featureReserves[meter.feature] || 0) + extraCredits;
    }
    await meter.reserve({ amount });
    return true;
  } catch (err) {
    if (!(err instanceof service.AiCreditsError)) throw err;
    res.status(200).json(creditErrorBody(err));
    return false;
  }
}

module.exports = { withAiCredits, creditErrorBody, createMeter, finalize, reserveAiCredits };
