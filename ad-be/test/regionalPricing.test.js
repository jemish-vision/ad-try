const assert = require("node:assert/strict");
const path = require("node:path");
const { test, describe, beforeEach } = require("node:test");

const root = path.join(__dirname, "..");
let regionsInDb = [];
const modelPath = require.resolve(path.join(root, "api-server/models/pricingRegion.model.js"));
require.cache[modelPath] = {
  id: modelPath, filename: modelPath, loaded: true,
  exports: { find: () => ({ lean: async () => regionsInDb }) },
};

const P = require("../api-server/helper/regionalPricing");
const { payingLegacyQuery } = require("../scripts/setup-regional-pricing");

const PLAN = { _id: "p1", name: "Pro", monthlyPrice: 49, yearlyPrice: 0, currency: "USD" };
const INDIA = { _id: "r1", name: "India", currency: "INR", countries: ["IN"], prices: [{ packageId: "p1", monthlyPrice: 1999, yearlyPrice: 19999 }] };
const req = (country) => ({ headers: country ? { "cf-ipcountry": country } : {} });

describe("country detection (Cloudflare)", () => {
  test("reads CF-IPCountry; XX (unknown) and T1 (Tor) count as unknown", () => {
    assert.equal(P.getRequestCountry(req("in")), "IN");
    assert.equal(P.getRequestCountry(req("XX")), null);
    assert.equal(P.getRequestCountry(req("T1")), null);
    assert.equal(P.getRequestCountry(req()), null);
  });
  test("locked billing country wins over the IP; default mode ignores both", () => {
    assert.deepEqual(P.resolvePricingCountry({ billingCountry: "IN" }, req("US")), { country: "IN", source: "locked" });
    assert.deepEqual(P.resolvePricingCountry({}, req("US")), { country: "US", source: "ip" });
    assert.equal(P.resolvePricingCountry({ pricingMode: "default" }, req("IN")).source, "default");
  });
});

describe("plan price", () => {
  beforeEach(() => { P.clearRegionCache(); regionsInDb = [INDIA]; });

  test("default price: yearly falls back to monthly × 10 (what checkout has always charged)", () => {
    assert.deepEqual(P.defaultPlanPrice(PLAN), { monthlyPrice: 49, yearlyPrice: 490, currency: "USD" });
  });

  test("country in a region gets the regional price and currency", async () => {
    const p = P.priceForPlan(PLAN, await P.getPricingContext(null, req("IN")));
    assert.equal(p.currency, "INR");
    assert.equal(p.monthlyPrice, 1999);
    assert.equal(p.yearlyPrice, 19999);
    assert.equal(p.isRegional, true);
  });

  test("country with no region, unpriced plan, or default mode → default price", async () => {
    assert.equal(P.priceForPlan(PLAN, await P.getPricingContext(null, req("US"))).currency, "USD");
    assert.equal(P.priceForPlan({ ...PLAN, _id: "p2" }, await P.getPricingContext(null, req("IN"))).currency, "USD");
    assert.equal(P.priceForPlan(PLAN, await P.getPricingContext({ pricingMode: "default" }, req("IN"))).currency, "USD");
  });

  test("regional yearly price left blank = 12 months with 20% off, rounded", async () => {
    regionsInDb = [{ ...INDIA, prices: [{ packageId: "p1", monthlyPrice: 999, yearlyPrice: 0 }] }];
    P.clearRegionCache();
    const p = P.priceForPlan(PLAN, await P.getPricingContext(null, req("IN")));
    assert.equal(p.yearlyPrice, 9590); // 999 × 12 × 0.8 = 9590.4
    assert.equal(P.regionalYearlyPrice(2999), 28790);
  });

  test("an organization locked to India keeps INR when visiting from abroad", async () => {
    assert.equal(P.priceForPlan(PLAN, await P.getPricingContext({ billingCountry: "IN" }, req("US"))).currency, "INR");
  });
});

describe("Stripe amounts", () => {
  test("two-, zero- and three-decimal currencies", () => {
    assert.equal(P.toMinorUnits(49.99, "USD"), 4999);
    assert.equal(P.toMinorUnits(1999, "inr"), 199900);
    assert.equal(P.toMinorUnits(5000, "JPY"), 5000);
    assert.equal(P.toMinorUnits(12.345, "KWD"), 12350);
    assert.equal(P.fromMinorUnits(199900, "INR"), 1999);
    assert.equal(P.fromMinorUnits(5000, "jpy"), 5000);
  });
});

describe("setup script", () => {
  test("only paying organizations without a billing country are moved to default pricing", () => {
    const q = payingLegacyQuery(new Date("2026-01-01"));
    assert.deepEqual(q.billingCountry, { $in: [null, ""] });
    assert.deepEqual(q.pricingMode, { $ne: "default" });
    assert.equal(q.$or.length, 2);
  });
});
