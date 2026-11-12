// api-server/helper/rateLimiter.js
const { RateLimiterRedis } = require('rate-limiter-flexible');
const { redisClient } = require('../services/redis.service');
const { getEndpointLimit } = require('./amazonLimitsConfig');

/**
 * Ads API limiter — unchanged behaviour: 10 requests / second per profile + path.
 *
 * Note: rate-limiter-flexible reads only `customDuration` from consume() options; per-call
 * `points` / `duration` are ignored. Before this fix every SP-API endpoint was therefore capped at
 * this default too, and the limits in amazonLimitsConfig.js never took effect.
 */
const adsRateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'amzn_rate',
    points: 10,
    duration: 1,
    useRedisPackage: true // CRITICAL: Fixes compatibility with redis v4!
});

/**
 * Converts Amazon's token-bucket limit (requests/second + burst) into a fixed window the limiter can
 * enforce. Burst is intentionally not used (safe side: only the first requests of a run are slower).
 *   rate >= 1/s  → floor(rate) requests per 1 second      (e.g. 2/s  → 2 per 1s)
 *   rate <  1/s  → 1 request per ceil(1/rate) seconds     (e.g. 0.5/s → 1 per 2s, 0.0167/s → 1 per 60s)
 */
function toWindow(limit) {
    const rate = Number(limit?.rate);
    if (!(rate > 0)) return { points: 1, duration: 60 };
    if (rate >= 1) return { points: Math.floor(rate), duration: 1 };
    return { points: 1, duration: Math.ceil(1 / rate) };
}

// One limiter per distinct window (a handful in total), created lazily and reused.
const spLimiters = new Map();
function getSpLimiter({ points, duration }) {
    const key = `${points}:${duration}`;
    if (!spLimiters.has(key)) {
        spLimiters.set(key, new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: `amzn_rate_sp_${points}p_${duration}s`,
            points,
            duration,
            useRedisPackage: true,
        }));
    }
    return spLimiters.get(key);
}

async function checkRateLimit(profileId, url, method, isSellerAPI) {
    if (!profileId) return; // Skip if no profileId attached

    // 1. Check for global 429 block on this profile (set by response interceptor)
    const blockKey = `amzn_block_${isSellerAPI ? 'sp' : 'ads'}_${profileId}`;
    const isBlocked = await redisClient.get(blockKey);
    if (isBlocked) {
        const ttl = await redisClient.ttl(blockKey);
        throw new Error(`LOCAL_RATE_LIMIT:${ttl > 0 ? ttl * 1000 : 5000}`);
    }

    // 2. Consume from the limiter for this profile + endpoint
    const pathGroup = url.split('?')[0].replace(/\/[A-Z0-9]{10,}/gi, '/:id');
    const redisKey = `${profileId}:${isSellerAPI ? 'SP' : 'ADS'}:${pathGroup}`;

    const limiter = isSellerAPI
        ? getSpLimiter(toWindow(getEndpointLimit(url, method, isSellerAPI)))
        : adsRateLimiter;

    try {
        await limiter.consume(redisKey, 1);
    } catch (rejection) {
        // A store (Redis) error is not a rate-limit decision: fail open and let Amazon's own 429
        // handling act as the backstop rather than failing the request.
        if (rejection instanceof Error) return;
        throw new Error(`LOCAL_RATE_LIMIT:${rejection.msBeforeNext}`);
    }
}

async function blockProfileTemporarily(profileId, isSellerAPI, waitTimeMs) {
    if (!profileId) return;
    const blockKey = `amzn_block_${isSellerAPI ? 'sp' : 'ads'}_${profileId}`;
    const ttlSeconds = Math.ceil(waitTimeMs / 1000);
    if (ttlSeconds > 0) {
        await redisClient.set(blockKey, 'BLOCKED', { EX: ttlSeconds });
    }
}

module.exports = { checkRateLimit, blockProfileTemporarily, toWindow };
