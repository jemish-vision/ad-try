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
    // searchListingsItems (GET /items/{sellerId}) — used by the paginated product listing sync
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+$/, method: 'GET', rate: 5.0, burst: 5 },
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/, method: 'GET', rate: 5.0, burst: 10 },
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/, method: 'PUT', rate: 5.0, burst: 10 },
    { regex: /^\/listings\/2021-08-01\/items\/[^/]+\/[^/]+$/, method: 'PATCH', rate: 5.0, burst: 10 },

    // --- PRODUCT PRICING API (v0) ---
    { regex: /^\/products\/pricing\/v0\/price$/, method: 'GET', rate: 0.5, burst: 1 },
    { regex: /^\/products\/pricing\/v0\/competitivePrice$/, method: 'GET', rate: 0.5, burst: 1 },
    { regex: /^\/products\/pricing\/v0\/items\/[^/]+\/offers$/, method: 'GET', rate: 0.5, burst: 1 },

    // --- PRODUCT PRICING BATCH (v0) — getItemOffersBatch, up to 20 ASINs per request ---
    { regex: /^\/batches\/products\/pricing\/v0\/itemOffers$/, method: 'POST', rate: 0.1, burst: 1 },

    // --- PRODUCT FEES API (v0) ---
    { regex: /^\/products\/fees\/v0\/items\/[^/]+\/feesEstimate$/, method: 'POST', rate: 1.0, burst: 2 },

    // --- CATALOG ITEMS API (2020-12-01) — older version still used by order.controller ---
    { regex: /^\/catalog\/2020-12-01\/items$/, method: 'GET', rate: 2.0, burst: 2 },
    { regex: /^\/catalog\/2020-12-01\/items\/[^/]+$/, method: 'GET', rate: 2.0, burst: 2 },

    // --- ORDERS API (2026-01-01) — rate not yet verified against Amazon docs; mirrors v0 getOrders entry above ---
    { regex: /^\/orders\/2026-01-01\/orders$/, method: 'GET', rate: 0.5, burst: 30 },

    // --- A+ CONTENT API (2020-11-01): all operations 10/s, burst 10 ---
    { regex: /^\/aplus\/2020-11-01\//, method: 'GET', rate: 10.0, burst: 10 },
    { regex: /^\/aplus\/2020-11-01\//, method: 'POST', rate: 10.0, burst: 10 },

    // --- UPLOADS API (2020-11-01): createUploadDestinationForResource ---
    { regex: /^\/uploads\/2020-11-01\/uploadDestinations\//, method: 'POST', rate: 0.1, burst: 5 },

    // --- FBA INBOUND (v0) ---
    { regex: /^\/fba\/inbound\/v0\/shipments$/, method: 'GET', rate: 2.0, burst: 30 },
    { regex: /^\/fba\/inbound\/v0\/shipments\/[^/]+\/items$/, method: 'GET', rate: 2.0, burst: 30 },

    // --- SOLICITATIONS API (v1) ---
    { regex: /^\/solicitations\/v1\/orders\/[^/]+/, method: 'GET', rate: 1.0, burst: 5 },
    { regex: /^\/solicitations\/v1\/orders\/[^/]+/, method: 'POST', rate: 1.0, burst: 5 },

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

function getEndpointLimit(url, method = 'GET', isSellerAPI) {
    if (!isSellerAPI) return ADS_API_LIMIT;

    let pathOnly = url;
    try {
        pathOnly = new URL(url).pathname;
    } catch (e) {
        pathOnly = url.split('?')[0]; 
    }
    
    const normalizedMethod = String(method || 'GET').toUpperCase();
    for (const route of spApiLimits) {
        if (route.method === normalizedMethod && route.regex.test(pathOnly)) {
            return { rate: route.rate, burst: route.burst };
        }
    }
    return DEFAULT_SP_API_LIMIT;
}

module.exports = { getEndpointLimit };
