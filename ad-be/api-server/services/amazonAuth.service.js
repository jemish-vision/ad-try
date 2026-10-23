require("dotenv").config();
const crypto = require("crypto");
const axios = require("axios");
const configSchema = require("../models/config.model");
const sellerConfigSchema = require("../models/sellerConfig.model");
const profileSchema = require("../models/profiles.model");
const {
  isRedisReady,
  readAuthToken,
  writeAuthToken,
  acquireAuthLock,
  extendAuthLock,
  commitTokenIfOwner,
  releaseAuthLock,
} = require("./redis.service");
const {
  AUTH_REFRESH_BUFFER_MS,
  AUTH_TOKEN_DEFAULT_TTL_SECONDS,
  AUTH_LOCK_TTL_MS,
  AUTH_LOCK_WAIT_MS,
  AUTH_LOCK_POLL_MIN_MS,
  AUTH_LOCK_POLL_MAX_MS,
  AUTH_LWA_TIMEOUT_MS,
} = require("../constants/amazonAuth.constants");
const { write_logs } = require("../../winston/utility/logger");
const { handleAutoDisconnectAds, handleAutoDisconnectSP } = require("../helper/disconnectHelper");

/**
 * Validate and normalize identity parameters.
 */
function normalizeIdentity({ kind, configId, profileId }) {
  if (kind !== "ads" && kind !== "sp") {
    throw new Error(`Invalid auth kind: "${kind}". Must be "ads" or "sp".`);
  }
  if (!configId) {
    throw new Error("Missing configId for Amazon authentication.");
  }
  const normalizedConfigId = String(configId).trim();
  let normalizedProfileId = null;

  if (kind === "sp") {
    if (profileId === undefined || profileId === null || isNaN(Number(profileId))) {
      throw new Error(`Missing or invalid profileId for SP-API authentication: "${profileId}".`);
    }
    normalizedProfileId = Number(profileId);
  } else if (profileId !== undefined && profileId !== null && !isNaN(Number(profileId))) {
    normalizedProfileId = Number(profileId);
  }

  return {
    kind,
    configId: normalizedConfigId,
    profileId: normalizedProfileId,
  };
}

function getTokenKey(kind, configId, profileId) {
  if (kind === "ads") {
    return `amzn:auth:v1:ads:${configId}:token`;
  }
  return `amzn:auth:v1:sp:${configId}:${profileId}:token`;
}

function getLockKey(kind, configId, profileId) {
  if (kind === "ads") {
    return `amzn:auth:v1:ads:${configId}:lock`;
  }
  return `amzn:auth:v1:sp:${configId}:${profileId}:lock`;
}

const { decrypt } = require("../helper/crypto.helper");

const safeDecrypt = (val) => {
  if (!val) return val;
  try {
    return decrypt(val);
  } catch (err) {
    return val;
  }
};

/**
 * Fetch refresh credentials from MongoDB for the targeted identity.
 */
async function loadCredentials({ kind, configId, profileId }) {
  if (kind === "ads") {
    const config = await configSchema.findById(configId);
    if (!config || !config.isActive) {
      return null;
    }
    return {
      clientId: config.adsClientId || process.env.AMAZON_ADS_CLIENT_ID,
      clientSecret: safeDecrypt(config.adsClientSeceret) || process.env.AMAZON_ADS_CLIENT_SECRET,
      refreshToken: safeDecrypt(config.adsRefressToken),
    };
  } else {
    const cfg = await sellerConfigSchema.findOne({ configId, profileId });
    if (!cfg || !cfg.isActive) {
      return null;
    }
    return {
      clientId: cfg.spClientId || process.env.AMAZON_SP_CLIENT_ID || process.env.AMAZON_ADS_CLIENT_ID,
      clientSecret: safeDecrypt(cfg.spClientSecret) || process.env.AMAZON_SP_CLIENT_SECRET || process.env.AMAZON_ADS_CLIENT_SECRET,
      refreshToken: safeDecrypt(cfg.spRefreshToken),
    };
  }
}

/**
 * Call Amazon LwA to exchange refresh token for an access token.
 * Retries network errors, 429, and 5xx; fails fast on 4xx (invalid_grant, bad client credentials).
 */
async function exchangeLwA({ clientId, clientSecret, refreshToken, kind, configId }) {
  const authUrl = process.env.AUTH_LINK || "https://api.amazon.com/auth/o2/token";
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(
        authUrl,
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: AUTH_LWA_TIMEOUT_MS,
        }
      );

      if (response.status === 200 && response.data?.access_token) {
        const expiresIn = Math.max(1, Number(response.data.expires_in) || AUTH_TOKEN_DEFAULT_TTL_SECONDS);
        return {
          accessToken: response.data.access_token,
          expiresIn,
        };
      }
      throw new Error(`Unexpected Amazon LwA response: ${JSON.stringify(response.data)}`);
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      const errCode = err?.response?.data?.error;
      const errDesc = err?.response?.data?.error_description || err.message;

      // 400 invalid_grant or invalid_client: deterministic failure, never retry
      if (errCode === "invalid_grant" || errCode === "invalid_client" || (status >= 400 && status < 500 && status !== 429)) {
        const fatalErr = new Error(`Amazon LwA ${errCode || 'auth_error'}: ${errDesc}`);
        fatalErr.status = status || 400;
        fatalErr.isInvalidGrant = errCode === "invalid_grant";
        throw fatalErr;
      }

      // Retryable errors: 429, 5xx, or network timeouts
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 6000) + Math.floor(Math.random() * 500);
        write_logs({
          message: `[amazonAuth] LwA exchange attempt ${attempt} failed for ${kind}:${configId} (${err.message}). Retrying in ${backoffMs}ms...`,
          log_type: "warn",
        });
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }
  }

  throw lastError || new Error("Failed to exchange token with Amazon LwA");
}

/**
 * Persist actual token expiration to MongoDB for audit and migration.
 * (Never subtract 300s here).
 */
async function persistTokenToMongo({ kind, configId, profileId, accessToken, expiresIn, expiresAt }) {
  try {
    if (kind === "ads") {
      await configSchema.updateOne(
        { _id: configId },
        {
          $set: {
            adsAccessToken: accessToken,
            tokenExpire: expiresIn,
            adsTokenExpiresAt: expiresAt,
          },
        }
      );
    } else {
      await sellerConfigSchema.updateOne(
        { configId, profileId },
        {
          $set: {
            spAccessToken: accessToken,
            tokenExpire: expiresIn,
            spTokenExpiresAt: expiresAt,
          },
        }
      );
    }
  } catch (err) {
    write_logs({
      message: `[amazonAuth] Warning: Mongo token persist failed for ${kind}:${configId} (non-fatal, Redis is source of truth): ${err.message}`,
      log_type: "warn",
    });
  }
}

/**
 * Handle targeted disconnection when Amazon returns invalid_grant.
 */
async function handleTargetedDisconnect({ kind, configId, profileId, reason }) {
  try {
    if (kind === "ads") {
      await handleAutoDisconnectAds({ configId, reason });
    } else {
      await handleAutoDisconnectSP({ configId, profileId, reason });
    }
  } catch (err) {
    write_logs({
      message: `[amazonAuth] Failed to execute targeted disconnect for ${kind}:${configId}: ${err.message}`,
      log_type: "error",
    });
  }
}

/**
 * Internal single-flight refresh coordination under a distributed Redis lock.
 */
async function refreshWithLock({ kind, configId, profileId, tokenKey, lockKey, existingPayload, isForce, rejectedToken }) {
  const owner = crypto.randomUUID();
  const acquired = await acquireAuthLock(lockKey, owner, AUTH_LOCK_TTL_MS);

  // 1. Winner Path: Acquired the lock
  if (acquired) {
    let renewInterval = null;
    try {
      // Lease renewal heartbeat while LwA is in progress
      renewInterval = setInterval(() => {
        extendAuthLock(lockKey, owner, AUTH_LOCK_TTL_MS).catch(() => {});
      }, Math.floor(AUTH_LOCK_TTL_MS / 2));

      // Recheck Redis inside lock (another server might have finished right before we acquired)
      if (!isForce) {
        const recheck = await readAuthToken(tokenKey);
        if (recheck && recheck.pttl > AUTH_REFRESH_BUFFER_MS && recheck.payload?.accessToken) {
          return recheck.payload.accessToken;
        }
      } else if (rejectedToken) {
        const recheck = await readAuthToken(tokenKey);
        if (recheck && recheck.payload?.accessToken && recheck.payload.accessToken !== rejectedToken) {
          return recheck.payload.accessToken;
        }
      }

      // Load refresh credentials
      const credentials = await loadCredentials({ kind, configId, profileId });
      if (!credentials || !credentials.refreshToken) {
        const notFoundErr = new Error(`Credentials or refresh token missing/inactive for ${kind}:${configId}`);
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      // Exchange with Amazon LwA
      const lwaResult = await exchangeLwA({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: credentials.refreshToken,
        kind,
        configId,
      });

      // Persist to Mongo (actual expiry, no buffer subtraction)
      const actualExpiresAt = new Date(Date.now() + lwaResult.expiresIn * 1000);
      await persistTokenToMongo({
        kind,
        configId,
        profileId,
        accessToken: lwaResult.accessToken,
        expiresIn: lwaResult.expiresIn,
        expiresAt: actualExpiresAt,
      });

      // Commit to Redis with Lua check ensuring this worker still owns the lock
      const tokenPayload = {
        accessToken: lwaResult.accessToken,
        issuedAt: Date.now(),
      };
      const committed = await commitTokenIfOwner(
        lockKey,
        owner,
        tokenKey,
        tokenPayload,
        lwaResult.expiresIn
      );

      if (!committed) {
        write_logs({
          message: `[amazonAuth] Lock ownership lost before commit for ${kind}:${configId}. Reading winner token from Redis.`,
          log_type: "warn",
        });
        const winnerToken = await readAuthToken(tokenKey);
        if (winnerToken && winnerToken.payload?.accessToken) {
          return winnerToken.payload.accessToken;
        }
        return lwaResult.accessToken;
      }

      write_logs({
        message: `[amazonAuth] Successfully refreshed and committed token for ${kind}:${configId} (TTL ${lwaResult.expiresIn}s)`,
        log_type: "info",
      });

      return lwaResult.accessToken;
    } catch (err) {
      if (err.isInvalidGrant) {
        await handleTargetedDisconnect({
          kind,
          configId,
          profileId,
          reason: `Amazon LWA invalid_grant: ${err.message}`,
        });
      }

      // Preemptive refresh failure fallback: if token still has positive TTL, return it
      if (!isForce && existingPayload?.accessToken) {
        const currentToken = await readAuthToken(tokenKey);
        if (currentToken && currentToken.pttl > 0 && currentToken.payload?.accessToken) {
          write_logs({
            message: `[amazonAuth] Preemptive refresh failed for ${kind}:${configId}. Falling back to unexpired token (PTTL: ${currentToken.pttl}ms): ${err.message}`,
            log_type: "warn",
          });
          return currentToken.payload.accessToken;
        }
      }

      throw err;
    } finally {
      if (renewInterval) clearInterval(renewInterval);
      await releaseAuthLock(lockKey, owner).catch(() => {});
    }
  }

  // 2. Waiter Path: Did not acquire lock. Poll Redis with randomized jitter
  const deadline = Date.now() + AUTH_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const sleepMs =
      Math.floor(Math.random() * (AUTH_LOCK_POLL_MAX_MS - AUTH_LOCK_POLL_MIN_MS + 1)) +
      AUTH_LOCK_POLL_MIN_MS;
    await new Promise((res) => setTimeout(res, sleepMs));

    const check = await readAuthToken(tokenKey);
    if (check && check.payload?.accessToken) {
      if (isForce && rejectedToken) {
        if (check.payload.accessToken !== rejectedToken) {
          return check.payload.accessToken;
        }
      } else if (check.pttl > AUTH_REFRESH_BUFFER_MS) {
        return check.payload.accessToken;
      }
    }
  }

  const timeoutErr = new Error(`Timeout waiting for distributed token refresh on ${kind}:${configId}`);
  timeoutErr.status = 503;
  timeoutErr.code = "AUTH_COORDINATION_TIMEOUT";
  throw timeoutErr;
}

/**
 * Public API: getValidAccessToken
 * Retrieves a valid access token for the given identity, performing preemptive refresh
 * under a Redis lock when PTTL <= 300,000ms.
 */
async function getValidAccessToken({ kind, configId, profileId }) {
  const identity = normalizeIdentity({ kind, configId, profileId });
  const tokenKey = getTokenKey(identity.kind, identity.configId, identity.profileId);
  const lockKey = getLockKey(identity.kind, identity.configId, identity.profileId);

  // 1. Read token and PTTL atomically from Redis
  let cached = null;
  try {
    cached = await readAuthToken(tokenKey);
  } catch (err) {
    const coordErr = new Error(`Redis unavailable during token retrieval: ${err.message}`);
    coordErr.status = 503;
    coordErr.code = "AUTH_COORDINATION_UNAVAILABLE";
    throw coordErr;
  }

  // 2. If token exists and PTTL > 300,000ms, return immediately
  if (cached && cached.pttl > AUTH_REFRESH_BUFFER_MS && cached.payload?.accessToken) {
    return cached.payload.accessToken;
  }

  // 3. Otherwise, trigger refresh under lock
  return await refreshWithLock({
    kind: identity.kind,
    configId: identity.configId,
    profileId: identity.profileId,
    tokenKey,
    lockKey,
    existingPayload: cached?.payload,
    isForce: false,
  });
}

/**
 * Public API: forceRefreshOne
 * Forces a refresh for a specific identity, e.g., when receiving an authentic 401 from Amazon.
 */
async function forceRefreshOne({ kind, configId, profileId, rejectedToken, reason }) {
  const identity = normalizeIdentity({ kind, configId, profileId });
  const tokenKey = getTokenKey(identity.kind, identity.configId, identity.profileId);
  const lockKey = getLockKey(identity.kind, identity.configId, identity.profileId);

  write_logs({
    message: `[amazonAuth] Force refresh requested for ${identity.kind}:${identity.configId} (reason: ${reason || '401_retry'})`,
    log_type: "info",
  });

  return await refreshWithLock({
    kind: identity.kind,
    configId: identity.configId,
    profileId: identity.profileId,
    tokenKey,
    lockKey,
    existingPayload: null,
    isForce: true,
    rejectedToken,
  });
}

/**
 * Public API: seedAccessToken
 * Seeds Redis with a newly minted access token (e.g. from initial OAuth exchange or manual reconnect).
 */
async function seedAccessToken({ kind, configId, profileId, accessToken, expiresIn }) {
  const identity = normalizeIdentity({ kind, configId, profileId });
  const tokenKey = getTokenKey(identity.kind, identity.configId, identity.profileId);
  const ttl = Math.max(1, Number(expiresIn) || AUTH_TOKEN_DEFAULT_TTL_SECONDS);

  const payload = {
    accessToken,
    issuedAt: Date.now(),
  };

  await writeAuthToken(tokenKey, payload, ttl);
  write_logs({
    message: `[amazonAuth] Seeded new token in Redis for ${identity.kind}:${identity.configId} (TTL ${ttl}s)`,
    log_type: "info",
  });
}

/**
 * Public API: invalidateAccessToken
 * Invalidates the Redis access token for an identity (e.g. upon disconnect or credential revocation).
 */
async function invalidateAccessToken({ kind, configId, profileId }) {
  const identity = normalizeIdentity({ kind, configId, profileId });
  const tokenKey = getTokenKey(identity.kind, identity.configId, identity.profileId);
  if (isRedisReady()) {
    const { deleteWithLog } = require("./redis.service");
    await deleteWithLog(tokenKey);
  }
}

module.exports = {
  getValidAccessToken,
  forceRefreshOne,
  seedAccessToken,
  invalidateAccessToken,
  normalizeIdentity,
  getTokenKey,
  getLockKey,
};
