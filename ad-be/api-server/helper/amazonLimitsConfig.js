// api-server/helper/amazonLimitsConfig.js

/**
 * SP-API Uses strict Token Bucket.
 * RATE = Tokens added per second.
 * BURST = Maximum bucket capacity (NOT maximum concurrency).
 */
const spApiLimits = [
    // --- ORDERS API (v0) ---
    { regex: /^\/orders\/v0\/orders$/, method: 'GET', rate: 0.5, burst: 30 },
    { regex: /^\/orders\/v0\/orders\/[^/]+$/, method: 'GET', rate: 0.5, burst: 30 },
    { regex: /^\/orders\/v0\/orders\/[^/]+\/orderItems$/, method: 'GET', rate: 0.5, burst: 30 },

    // --- REPORTS API (2021-06-30) ---
    { regex: /^\/reports\/2021-06-30\/reports$/, method: 'POST', rate: 0.0167, burst: 15 }, 
    { regex: /^\/reports\/2021-06-30\/reports$/, method: 'GET', rate: 0.0222, burst: 10 },
    { regex: /^\/reports\/2021-06-30\/reports\/[^/]+$/, method: 'GET', rate: 2.0, burst: 15 },
    { regex: /^\/reports\/2021-06-30\/documents\/[^/]+$/, method: 'GET', rate: 0.0167, burst: 15 },

    // --- FEEDS API (2021-06-30) ---
    { regex: /^\/feeds\/2021-06-30\/feeds$/, method: 'POST', rate: 0.0083, burst: 15 },
    { regex: /^\/feeds\/2021-06-30\/feeds$/, method: 'GET', rate: 0.0222, burst: 10 },
    { regex: /^\/feeds\/2021-06-30\/feeds\/[^/]+$/, method: 'GET', rate: 2.0, burst: 15 },
    { regex: /^\/feeds\/2021-06-30\/documents$/, method: 'POST', rate: 0.0083, burst: 15 },
    
    // --- CATALOG ITEMS API (2022-04-01) ---
    { regex: /^\/catalog\/2022-04-01\/items$/, method: 'GET', rate: 2.0, burst: 2 },
    { regex: /^\/catalog\/2022-04-01\/items\/[^/]+$/, method: 'GET', rate: 2.0, burst: 2 },

    // --- LISTINGS ITEMS API (2021-08-01) ---
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/, method: 'GET', rate: 5.0, burst: 10 },
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/, method: 'PUT', rate: 5.0, burst: 10 },
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/, method: 'PATCH', rate: 5.0, burst: 10 },

    // --- PRODUCT PRICING API (v0) ---
    { regex: /^\/products\/pricing\/v0\/price$/, method: 'GET', rate: 0.5, burst: 1 },
    { regex: /^\/products\/pricing\/v0\/competitivePrice$/, method: 'GET', rate: 0.5, burst: 1 },
    { regex: /^\/products\/pricing\/v0\/items\/[^/]+\/offers$/, method: 'GET', rate: 0.5, burst: 1 },

    // --- PRODUCT TYPE DEFINITIONS API ---
    { regex: /^\/definitions\/2020-09-01\/productTypes/, method: 'GET', rate: 5.0, burst: 10 },

    // --- FBA INVENTORY API (v1) ---
    { regex: /^\/fba\/inventory\/v1\/summaries$/, method: 'GET', rate: 2.0, burst: 2 },
    
    // --- FINANCES API (v0) ---
    { regex: /^\/finances\/v0\/financialEventGroups$/, method: 'GET', rate: 0.5, burst: 30 },
    { regex: /^\/finances\/v0\/financialEvents$/, method: 'GET', rate: 0.5, burst: 30 },
];

/**
 * Fallback limits for SP-API if a route isn't defined above.
 */
const DEFAULT_SP_API_LIMIT = { rate: 0.0167, burst: 15 };

/**
 * Conservative limit for Ads API since it doesn't have fixed limits.
 * Leans heavily on Retry-After 429 header.
 */
const ADS_API_LIMIT = { rate: 2.0, burst: 10 };

function getEndpointLimit(url, method, isSellerAPI) {
    if (!isSellerAPI) return ADS_API_LIMIT;

    let pathOnly = url;
    try {
        pathOnly = new URL(url).pathname;
    } catch (e) {
        pathOnly = url.split('?')[0]; 
    }
    
    for (const route of spApiLimits) {
        if (route.method === method.toUpperCase() && route.regex.test(pathOnly)) {
            return { rate: route.rate, burst: route.burst };
        }
    }
    return DEFAULT_SP_API_LIMIT;
}

module.exports = { getEndpointLimit };
