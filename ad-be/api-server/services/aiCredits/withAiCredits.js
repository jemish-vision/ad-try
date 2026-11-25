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
 */
const crypto = require('crypto');
const service = require('./aiCredit.service');
const { runWithAiMeter } = require('./aiUsageMeter');
const { write_logs } = require('../../../winston/utility/logger');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

function createMeter({ feature, requestId, organizationId, userId }) {
  const meter = {
    feature,
    requestId,
    organizationId,
    userId,
    calls: [],
    hold: null,
    failed: false,
    failureReason: null,
    pendingReserve: null,
    /** Hold credits for this request (once). Throws AiCreditsError when the wallet can't cover it. */
    reserve() {
      if (meter.hold) return Promise.resolve(meter.hold);
      if (!meter.pendingReserve) {
        meter.pendingReserve = service
          .reserve({ organizationId, userId, feature, requestId })
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
    markFailed(reason) {
      meter.failed = true;
      if (!meter.failureReason) meter.failureReason = String(reason || 'Request failed').slice(0, 300);
    },
  };
  return meter;
}

function responseFailed(res) {
  return res.statusCode >= 400 || res.statusCode === 203;
}

async function finalize(meter, res) {
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
}

function withAiCredits(feature, handler) {
  if (!service.FEATURES[feature]) throw new Error(`withAiCredits: unknown feature ${feature}`);

  return async function meteredHandler(req, res, next) {
    const organizationId = req.organizationId || req.user?.organizationId;
    if (req.isMockTestingUser || req.user?.isMockUser || !organizationId) return handler(req, res, next);

    const clientId = String(req.headers?.['x-ai-request-id'] || '');
    const requestId = REQUEST_ID_RE.test(clientId) ? `${organizationId}:${clientId}` : crypto.randomUUID();
    const meter = createMeter({ feature, requestId, organizationId, userId: req.user?._id || req.user?.id || null });
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

module.exports = { withAiCredits, creditErrorBody, createMeter, finalize };
