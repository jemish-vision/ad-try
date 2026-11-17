const mongoose = require("mongoose");

/**
 * Regional pricing: a group of countries that see and pay plan prices in one currency.
 * Countries that are not in any active region pay the plan's default price (packages.monthlyPrice /
 * yearlyPrice / currency). A country can belong to only one active region (enforced in the controller).
 */
const regionPriceSchema = new mongoose.Schema(
  {
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "packages", required: true },
    monthlyPrice: { type: Number, min: 0, default: 0 },
    // 0 / empty → monthlyPrice × 10, the same rule as the default price
    yearlyPrice: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const pricingRegionSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    // ISO 3166-1 alpha-2, upper case (the format of Cloudflare's CF-IPCountry header)
    countries: [{ type: String, trim: true, uppercase: true }],
    // ISO 4217, upper case
    currency: { type: String, trim: true, uppercase: true, required: true },
    prices: [regionPriceSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pricingRegionSchema.index({ countries: 1, isActive: 1 });

module.exports = mongoose.model("pricingRegion", pricingRegionSchema);
