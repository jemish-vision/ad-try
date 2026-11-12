const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe } = require("node:test");

const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

/* ── rate conversion + table coverage (pure) ───────────────────────────── */
stub("api-server/services/redis.service.js", { redisClient: {} });
const { toWindow } = require("../api-server/helper/rateLimiter");
const { getEndpointLimit } = require("../api-server/helper/amazonLimitsConfig");
const H = "https://sellingpartnerapi-eu.amazon.com";
const windowFor = (method, p) => toWindow(getEndpointLimit(H + p, method, true));

describe("Amazon rate → enforced window", () => {
  test("rates of 1/s or more allow floor(rate) per second", () => {
    assert.deepEqual(toWindow({ rate: 2, burst: 2 }), { points: 2, duration: 1 });
    assert.deepEqual(toWindow({ rate: 10, burst: 10 }), { points: 10, duration: 1 });
  });
  test("slower rates allow 1 request per ceil(1/rate) seconds; burst is not used", () => {
    assert.deepEqual(toWindow({ rate: 0.5, burst: 30 }), { points: 1, duration: 2 });
    assert.deepEqual(toWindow({ rate: 0.1, burst: 1 }), { points: 1, duration: 10 });
    assert.deepEqual(toWindow({ rate: 0.0167, burst: 15 }), { points: 1, duration: 60 });
  });
  test("missing/invalid rate falls back to 1 per minute", () => {
    assert.deepEqual(toWindow({}), { points: 1, duration: 60 });
  });

  test("endpoints the app calls resolve to their documented windows", () => {
    const cases = [
      ["GET", "/catalog/2022-04-01/items", { points: 2, duration: 1 }],
      ["GET", "/catalog/2020-12-01/items/B0X0000001", { points: 2, duration: 1 }],
      ["POST", "/products/fees/v0/items/B0X0000001/feesEstimate", { points: 1, duration: 1 }],
      ["GET", "/products/pricing/v0/items/B0X0000001/offers", { points: 1, duration: 2 }],
      ["POST", "/batches/products/pricing/v0/itemOffers", { points: 1, duration: 10 }],
      ["GET", "/listings/2021-08-01/items/A1SELLER", { points: 5, duration: 1 }],
      ["GET", "/listings/2021-08-01/items/A1SELLER/SKU-1", { points: 5, duration: 1 }],
      ["POST", "/reports/2021-06-30/reports", { points: 1, duration: 60 }],
      ["GET", "/reports/2021-06-30/reports/123", { points: 2, duration: 1 }],
      ["post", "/aplus/2020-11-01/contentDocuments", { points: 10, duration: 1 }],
      ["GET", "/fba/inventory/v1/summaries", { points: 2, duration: 1 }],
      ["GET", "/fba/inbound/v0/shipments", { points: 2, duration: 1 }],
      ["POST", "/solicitations/v1/orders/123/solicitations/productReviewAndSellerFeedback", { points: 1, duration: 1 }],
      ["GET", "/orders/v0/orders", { points: 1, duration: 2 }],
    ];
    for (const [m, p, expected] of cases) assert.deepEqual(windowFor(m, p), expected, `${m} ${p}`);
  });
});

/* ── amazonAxios pre-flight waits ──────────────────────────────────────── */
describe("amazonAxios pre-flight waiting", () => {
  const waits = [];
  let rejections = []; // queue of msBeforeNext values to throw before allowing
  stub("api-server/helper/common.js", { wait: async (ms) => waits.push(ms) });
  stub("api-server/helper/rateLimiter.js", {
    checkRateLimit: async () => {
      if (rejections.length) throw new Error(`LOCAL_RATE_LIMIT:${rejections.shift()}`);
    },
    blockProfileTemporarily: async () => {},
  });
  stub("api-server/services/amazonAuth.service.js", { getValidAccessToken: async () => "tok", forceRefreshOne: async () => "tok2" });
  stub("winston/utility/logger.js", { write_logs: () => {} });
  delete require.cache[require.resolve("../api-server/helper/amazonAxios")];
  const amazonAxios = require("../api-server/helper/amazonAxios");

  const adapter = async (config) => ({ data: { ok: true }, status: 200, statusText: "OK", headers: {}, config });
  const call = (isBackgroundWorker) =>
    amazonAxios({ url: `${H}/products/pricing/v0/items/B0X0000001/offers`, method: "get", headers: {}, adapter, meta: { profileId: 1, sp: true, isBackgroundWorker } });

  test("page request waits when the slot frees within 3s", async () => {
    waits.length = 0;
    rejections = [1200];
    const res = await call(false);
    assert.equal(res.status, 200);
    assert.deepEqual(waits, [1250]);
  });

  test("page request fails fast when the wait would exceed 3s", async () => {
    waits.length = 0;
    rejections = [1500, 1500]; // second wait would bring the total over 3s
    await assert.rejects(call(false), (e) => e.isRateLimit === true);
    assert.deepEqual(waits, [1550]);
  });

  test("background job keeps waiting for strict endpoints (more than the old 5 attempts)", async () => {
    waits.length = 0;
    rejections = Array(7).fill(60000); // 7 × 1 minute = within the 10-minute budget
    const res = await call(true);
    assert.equal(res.status, 200);
    assert.equal(waits.length, 7);
  });

  test("background job gives up after the 10-minute wait budget", async () => {
    waits.length = 0;
    rejections = Array(20).fill(60000);
    await assert.rejects(call(true), /wait budget exhausted/);
    assert.ok(waits.reduce((a, b) => a + b, 0) <= 10 * 60 * 1000);
  });
});
