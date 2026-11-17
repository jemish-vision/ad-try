const mongoose = require("mongoose");
const { write_logs } = require("../../winston/utility/logger");
const PricingRegion = require("../models/pricingRegion.model");
const packageSchema = require("../models/packages.model");
const organizationSchema = require("../models/organization.model");
const { isCountryCode, clearRegionCache, getRequestCountry, getPricingContext, priceForPlan } = require("../helper/regionalPricing");

const fail = (res, message, status = 200) => res.status(status).json({ isSuccess: false, message });
const serverError = (res, where, error, req) => {
  write_logs({ message: `[${where} Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
  return res.status(500).json({ isSuccess: false, message: "Something went wrong, please try again!" });
};

/** Validates and normalizes a region payload. Returns { error } or { doc }. */
async function buildRegion(body, regionId = null) {
  const name = String(body?.name || "").trim();
  if (!name) return { error: "Region name is required" };

  const currency = String(body?.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Currency must be a 3-letter ISO code (e.g. INR)" };

  const countries = [...new Set((body?.countries || []).map((c) => String(c).trim().toUpperCase()))];
  if (!countries.length) return { error: "Select at least one country" };
  const invalid = countries.filter((c) => !isCountryCode(c));
  if (invalid.length) return { error: `Invalid country code: ${invalid.join(", ")}` };

  const isActive = body?.isActive !== false;
  if (isActive) {
    const clash = await PricingRegion.find({
      isActive: true,
      countries: { $in: countries },
      ...(regionId ? { _id: { $ne: regionId } } : {}),
    }).select("name countries").lean();
    if (clash.length) {
      const taken = clash.map((r) => `${countries.filter((c) => r.countries.includes(c)).join(", ")} (in ${r.name})`);
      return { error: `Already in another active region: ${taken.join("; ")}` };
    }
  }

  const planIds = new Set((await packageSchema.find({}).select("_id").lean()).map((p) => String(p._id)));
  const prices = [];
  for (const p of body?.prices || []) {
    if (!planIds.has(String(p?.packageId))) continue;
    const monthlyPrice = Number(p.monthlyPrice || 0);
    const yearlyPrice = Number(p.yearlyPrice || 0);
    if (!(monthlyPrice >= 0) || !(yearlyPrice >= 0)) return { error: "Prices can't be negative" };
    if (p.isActive !== false && !(monthlyPrice > 0)) continue; // empty row → plan keeps its default price
    prices.push({ packageId: new mongoose.Types.ObjectId(String(p.packageId)), monthlyPrice, yearlyPrice, isActive: p.isActive !== false });
  }

  return { doc: { name, currency, countries, prices, isActive } };
}

exports.getRegions = async (req, res) => {
  try {
    const [regions, plans] = await Promise.all([
      PricingRegion.find({}).sort({ name: 1 }).lean(),
      packageSchema.find({}).select("name monthlyPrice yearlyPrice price currency isActive").sort({ price: 1 }).lean(),
    ]);
    return res.status(200).json({ isSuccess: true, data: regions, plans });
  } catch (error) {
    return serverError(res, "getRegions", error, req);
  }
};

exports.createRegion = async (req, res) => {
  try {
    const { error, doc } = await buildRegion(req.body);
    if (error) return fail(res, error);
    const region = await PricingRegion.create(doc);
    clearRegionCache();
    return res.status(200).json({ isSuccess: true, message: "Region created", data: region });
  } catch (error) {
    return serverError(res, "createRegion", error, req);
  }
};

exports.updateRegion = async (req, res) => {
  try {
    const { regionId } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(regionId)) return fail(res, "Invalid region");
    const { error, doc } = await buildRegion(req.body, regionId);
    if (error) return fail(res, error);
    const region = await PricingRegion.findByIdAndUpdate(regionId, { $set: doc }, { new: true }).lean();
    if (!region) return fail(res, "Region not found");
    clearRegionCache();
    return res.status(200).json({ isSuccess: true, message: "Region updated", data: region });
  } catch (error) {
    return serverError(res, "updateRegion", error, req);
  }
};

exports.changeRegionStatus = async (req, res) => {
  try {
    const { regionId, isActive } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(regionId)) return fail(res, "Invalid region");
    const region = await PricingRegion.findById(regionId).lean();
    if (!region) return fail(res, "Region not found");
    if (isActive) {
      // Re-activating must not create overlapping regions.
      const { error } = await buildRegion({ ...region, isActive: true }, regionId);
      if (error) return fail(res, error);
    }
    await PricingRegion.updateOne({ _id: regionId }, { $set: { isActive: Boolean(isActive) } });
    clearRegionCache();
    return res.status(200).json({ isSuccess: true, message: "Status updated" });
  } catch (error) {
    return serverError(res, "changeRegionStatus", error, req);
  }
};

exports.deleteRegion = async (req, res) => {
  try {
    const { regionId } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(regionId)) return fail(res, "Invalid region");
    await PricingRegion.deleteOne({ _id: regionId });
    clearRegionCache();
    return res.status(200).json({ isSuccess: true, message: "Region deleted" });
  } catch (error) {
    return serverError(res, "deleteRegion", error, req);
  }
};

/** Organizations with a locked billing country, default pricing, or a flagged country mismatch. */
exports.getOrganizationBilling = async (req, res) => {
  try {
    const orgs = await organizationSchema
      .find({
        $or: [
          { billingCountry: { $nin: [null, ""] } },
          { pricingMode: "default" },
          { "billingCountryMismatch.detectedAt": { $ne: null } },
        ],
      })
      .select("organizationName pricingMode billingCountry billingCountrySetAt billingCountrySource billingCountryMismatch planId endDate")
      .populate({ path: "planId", select: "name" })
      .sort({ billingCountrySetAt: -1 })
      .lean();
    return res.status(200).json({ isSuccess: true, data: orgs });
  } catch (error) {
    return serverError(res, "getOrganizationBilling", error, req);
  }
};

/**
 * Super Admin: change how an organization is priced.
 *   action "reset"   → auto pricing, billing country cleared (next checkout locks it again)
 *   action "set"     → auto pricing, billing country = country
 *   action "default" → always the plan's default price
 * Also clears a flagged mismatch.
 */
exports.updateOrganizationBilling = async (req, res) => {
  try {
    const { organizationId, action, country } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(organizationId)) return fail(res, "Invalid organization");
    const clearMismatch = { "billingCountryMismatch.pricingCountry": null, "billingCountryMismatch.cardCountry": null, "billingCountryMismatch.addressCountry": null, "billingCountryMismatch.detectedAt": null };
    let $set;
    if (action === "reset") {
      $set = { pricingMode: "auto", billingCountry: null, billingCountrySetAt: null, billingCountrySource: null, ...clearMismatch };
    } else if (action === "set") {
      const c = String(country || "").trim().toUpperCase();
      if (!isCountryCode(c)) return fail(res, "Invalid country code");
      $set = { pricingMode: "auto", billingCountry: c, billingCountrySetAt: new Date(), billingCountrySource: "admin", ...clearMismatch };
    } else if (action === "default") {
      $set = { pricingMode: "default", ...clearMismatch };
    } else if (action === "clearFlag") {
      $set = clearMismatch;
    } else {
      return fail(res, "Unknown action");
    }
    const result = await organizationSchema.updateOne({ _id: organizationId }, { $set });
    if (!result.matchedCount) return fail(res, "Organization not found");
    return res.status(200).json({ isSuccess: true, message: "Billing country updated" });
  } catch (error) {
    return serverError(res, "updateOrganizationBilling", error, req);
  }
};

/**
 * Any signed-in user: the country Cloudflare reports for this request and the region it maps to.
 * Lets Super Admin verify the Cloudflare setup.
 */
exports.detectCountry = async (req, res) => {
  try {
    const ctx = await getPricingContext(null, req);
    return res.status(200).json({
      isSuccess: true,
      data: {
        country: getRequestCountry(req),
        cfHeaderPresent: Boolean(req.headers["cf-ipcountry"]),
        regionName: ctx.region?.name || null,
        currency: ctx.region?.currency || null,
      },
    });
  } catch (error) {
    return serverError(res, "detectCountry", error, req);
  }
};

/** Super Admin: preview what a country sees for every plan. */
exports.previewCountry = async (req, res) => {
  try {
    const country = String(req.body?.country || "").trim().toUpperCase();
    if (!isCountryCode(country)) return fail(res, "Invalid country code");
    const ctx = await getPricingContext({ pricingMode: "auto", billingCountry: country }, req);
    const plans = await packageSchema.find({ isActive: true }).sort({ price: 1 }).lean();
    return res.status(200).json({
      isSuccess: true,
      data: { country, regionName: ctx.region?.name || null, plans: plans.map((p) => ({ _id: p._id, name: p.name, ...priceForPlan(p, ctx) })) },
    });
  } catch (error) {
    return serverError(res, "previewCountry", error, req);
  }
};
