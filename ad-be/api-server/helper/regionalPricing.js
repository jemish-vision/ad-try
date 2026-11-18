/**
 * Regional plan pricing.
 *
 * Country source: Cloudflare's CF-IPCountry header (set by Cloudflare at the edge; the browser cannot
 * choose it as long as the origin only accepts traffic from Cloudflare). Once an organization has paid,
 * its billingCountry is locked and used instead, so VPNs and travel don't change the price.
 *
 * Price rule (same for default and regional prices):
 *   monthly = monthlyPrice (or legacy `price`)
 *   default price:  yearly = yearlyPrice when > 0, else monthly × 10
 *   regional price: yearly = region yearlyPrice when > 0, else monthly × 12 with 20% off (rounded)
 */
const PricingRegion = require("../models/pricingRegion.model");

// Stripe amounts are in the currency's smallest unit. https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

const YEARLY_MULTIPLIER = 10;
const REGIONAL_YEARLY_DISCOUNT = 0.2;
/** Yearly price for a region left blank: 12 months less 20%, rounded to a whole amount. */
const regionalYearlyPrice = (monthly) => Math.round(Number(monthly || 0) * 12 * (1 - REGIONAL_YEARLY_DISCOUNT));
const CACHE_MS = 60 * 1000;

function currencyFactor(currency) {
  const c = String(currency || "").toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
}

/** Major units → Stripe's smallest unit (three-decimal currencies must end in 0 for Stripe). */
function toMinorUnits(amount, currency) {
  const factor = currencyFactor(currency);
  const minor = Math.round(Number(amount || 0) * factor);
  return factor === 1000 ? Math.round(minor / 10) * 10 : minor;
}

function fromMinorUnits(minor, currency) {
  return Number(minor || 0) / currencyFactor(currency);
}

const isCountryCode = (c) => typeof c === "string" && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1";

/** Visitor country from Cloudflare. XX = unknown, T1 = Tor → treated as unknown (default price). */
function getRequestCountry(req) {
  const raw = String(req?.headers?.["cf-ipcountry"] || "").trim().toUpperCase();
  if (isCountryCode(raw)) return raw;
  // Local development only: there is no Cloudflare in front of localhost.
  const dev = String(process.env.DEV_PRICING_COUNTRY || "").trim().toUpperCase();
  if (process.env.NODE_ENV !== "production" && isCountryCode(dev)) return dev;
  return null;
}

/** The country that decides a visitor's price. */
function resolvePricingCountry(org, req) {
  return { country: getRequestCountry(req), source: "ip" };
}

let regionCache = { at: 0, regions: [] };
async function getActiveRegions() {
  if (Date.now() - regionCache.at < CACHE_MS) return regionCache.regions;
  const regions = await PricingRegion.find({ isActive: true }).lean();
  regionCache = { at: Date.now(), regions };
  return regions;
}
function clearRegionCache() {
  regionCache = { at: 0, regions: [] };
}

function findRegionForCountry(regions, country) {
  if (!country) return null;
  return regions.find((r) => (r.countries || []).includes(country)) || null;
}

function defaultPlanPrice(pkg) {
  const monthly = Number(pkg?.monthlyPrice > 0 ? pkg.monthlyPrice : pkg?.price || 0);
  const yearly = Number(pkg?.yearlyPrice > 0 ? pkg.yearlyPrice : monthly * YEARLY_MULTIPLIER);
  return { monthlyPrice: monthly, yearlyPrice: yearly, currency: String(pkg?.currency || "USD").toUpperCase() };
}

/**
 * Price an organization sees and pays for one plan.
 * Falls back to the default price when the country has no region, the region doesn't price this plan,
 * or the organization is on default pricing.
 */
function priceForPlan(pkg, { region, country, source }) {
  const base = defaultPlanPrice(pkg);
  const entry =
    source !== "default" && region
      ? (region.prices || []).find((p) => String(p.packageId) === String(pkg._id) && p.isActive !== false)
      : null;
  if (!entry) {
    return { ...base, country: country || null, countrySource: source, isRegional: false, regionId: null, regionName: null };
  }
  const monthly = Number(entry.monthlyPrice || 0);
  return {
    monthlyPrice: monthly,
    yearlyPrice: Number(entry.yearlyPrice > 0 ? entry.yearlyPrice : regionalYearlyPrice(monthly)),
    currency: String(region.currency).toUpperCase(),
    country: country || null,
    countrySource: source,
    isRegional: true,
    regionId: String(region._id),
    regionName: region.name,
  };
}

/** Resolves the pricing context for an organization + request (one DB read, cached). */
async function getPricingContext(org, req) {
  const { country, source } = resolvePricingCountry(org, req);
  const region = source === "default" ? null : findRegionForCountry(await getActiveRegions(), country);
  return { country, source, region };
}

module.exports = {
  YEARLY_MULTIPLIER,
  regionalYearlyPrice,
  currencyFactor,
  toMinorUnits,
  fromMinorUnits,
  isCountryCode,
  getRequestCountry,
  resolvePricingCountry,
  getActiveRegions,
  clearRegionCache,
  findRegionForCountry,
  defaultPlanPrice,
  priceForPlan,
  getPricingContext,
};
