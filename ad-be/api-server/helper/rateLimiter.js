// api-server/helper/rateLimiter.js
const { RateLimiterRedis } = require('rate-limiter-flexible');
const { redisClient } = require('../services/redis.service');
const { getEndpointLimit } = require('./amazonLimitsConfig');

const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'amzn_rate',
    points: 10,     // Default fallback (overridden dynamically during consume)
    duration: 1,    // Default fallback
    useRedisPackage: true // CRITICAL: Fixes compatibility with redis v4!
});

async function checkRateLimit(profileId, url, method, isSellerAPI) {
    if (!profileId) return; // Skip if no profileId attached

    // 1. Check for global 429 block on this profile (set by response interceptor)
    const blockKey = `amzn_block_${isSellerAPI ? 'sp' : 'ads'}_${profileId}`;
    const isBlocked = await redisClient.get(blockKey);
    if (isBlocked) {
        const ttl = await redisClient.ttl(blockKey);
        throw new Error(`LOCAL_RATE_LIMIT:${ttl > 0 ? ttl * 1000 : 5000}`);
    }

    // 2. Perform normal token bucket consume
    const limit = getEndpointLimit(url, method, isSellerAPI);
    
    const pathGroup = url.split('?')[0].replace(/\/[A-Z0-9]{10,}/gi, '/:id');
    const redisKey = `${profileId}:${isSellerAPI ? 'SP' : 'ADS'}:${pathGroup}`;

    const durationToRefillOneToken = limit.rate > 0 ? (1 / limit.rate) : 1;

    try {
        await rateLimiter.consume(redisKey, 1, {
            points: limit.burst,
            duration: Math.ceil(durationToRefillOneToken)
        });
    } catch (rejection) {
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

module.exports = { checkRateLimit, blockProfileTemporarily };
