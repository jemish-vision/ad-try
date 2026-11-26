const mongoose = require("mongoose");

/** Global AI credit settings (a single document, key "global"), edited by Super Admin. */
const modelRateSchema = new mongoose.Schema(
  {
    model: { type: String, trim: true, required: true }, // exact model id or a prefix, e.g. "gpt-4o-mini" or "claude-"
    inputCreditsPer1K: { type: Number, min: 0, required: true },
    outputCreditsPer1K: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

/**
 * Buying a custom number of credits (instead of a package): one flat price per 1,000 credits,
 * optionally a different rate per pricing region (charged in the region's currency).
 */
const customRegionRateSchema = new mongoose.Schema(
  {
    regionId: { type: mongoose.Schema.Types.ObjectId, ref: "pricingRegion", required: true },
    ratePer1K: { type: Number, min: 0, required: true },
  },
  { _id: false }
);
const customPurchaseSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    ratePer1K: { type: Number, min: 0, default: 0 }, // price of 1,000 credits in `currency`
    currency: { type: String, uppercase: true, trim: true, default: "USD" },
    minCredits: { type: Number, min: 1, default: 100 },
    maxCredits: { type: Number, min: 1, default: 50000 },
    step: { type: Number, min: 1, default: 50 }, // amounts must be a multiple of this
    regionalRates: { type: [customRegionRateSchema], default: [] },
  },
  { _id: false }
);

const aiCreditSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global" },
    enforcementEnabled: { type: Boolean, default: true }, // off = track usage only, never block or charge
    defaultMonthlyCredits: { type: Number, min: 0, default: 500 }, // for plans without their own allowance
    inputCreditsPer1K: { type: Number, min: 0, default: 1 },
    outputCreditsPer1K: { type: Number, min: 0, default: 4 },
    minimumChargePerRequest: { type: Number, min: 0, default: 0 },
    creditsPerImage: { type: Number, min: 0, default: 10 }, // each AI-generated image (A+ Content)
    modelRates: { type: [modelRateSchema], default: [] },
    // Credits held while a request runs; the request needs at least this much available.
    featureReserves: { type: Map, of: Number, default: {} },
    customPurchase: { type: customPurchaseSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, versionKey: false }
);

aiCreditSettingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model("aiCreditSetting", aiCreditSettingSchema);
