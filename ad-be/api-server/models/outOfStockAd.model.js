const mongoose = require("mongoose");

/**
 * Advertised products that are out of stock (dashboard "Out-of-Stock Products in Running Ads").
 * One document per profile + ASIN, rebuilt once a day by the "Out Of Stock Ads" queue job
 * (services/automation/outOfStockAds.service.js). The dashboard only reads this collection.
 */
const campaignRefSchema = new mongoose.Schema(
  {
    campaignId: { type: Number },
    campaignName: { type: String, trim: true },
    adType: { type: String, trim: true }, // "SP" | "SD"
    campaignStatus: { type: String, trim: true },
    targetingType: { type: String, trim: true },
    budget: { type: Number },
    budgetType: { type: String, trim: true },
    startDate: { type: String, trim: true },
    endDate: { type: String, trim: true },
    adGroupId: { type: Number },
    adId: { type: Number },
    spend7d: { type: Number, default: 0 }, // ad spend on this product ad over the last 7 days
  },
  { _id: false }
);

const outOfStockAdSchema = new mongoose.Schema(
  {
    configId: { type: mongoose.Schema.Types.ObjectId, ref: "config", required: true },
    profileId: { type: Number, required: true },
    asin: { type: String, trim: true, required: true },
    sku: { type: String, trim: true, default: null },
    title: { type: String, trim: true, default: null },
    imageUrl: { type: String, trim: true, default: null },
    availability: { type: String, trim: true }, // Amazon Ads product availability, e.g. OUT_OF_STOCK
    availabilitySource: { type: String, enum: ["ads_api", "stored"], default: "ads_api" },
    campaigns: [campaignRefSchema],
    campaignCount: { type: Number, default: 0 },
    spend7d: { type: Number, default: 0 },
    runId: { type: String, required: true },
    checkedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

outOfStockAdSchema.index({ configId: 1, profileId: 1, asin: 1 }, { unique: true });
outOfStockAdSchema.index({ configId: 1, profileId: 1, spend7d: -1 });

module.exports = mongoose.model("out_of_stock_ad", outOfStockAdSchema);
