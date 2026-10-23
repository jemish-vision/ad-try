const mongoose = require("mongoose");

const brandAnalyticsSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      required: true,
    },
    startDate: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    endDate: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    asin: {
      type: String,
      required: true,
      trim: true,
    },
    searchQueryData: {
      searchQuery: { type: String, trim: true },
      searchQueryScore: { type: Number },
      searchQueryVolume: { type: Number },
    },
    impressionData: {
      totalQueryImpressionCount: { type: Number, default: 0 },
      asinImpressionCount: { type: Number, default: 0 },
      asinImpressionShare: { type: Number, default: 0.0 },
    },
    clickData: {
      totalClickCount: { type: Number, default: 0 },
      totalClickRate: { type: Number, default: 0.0 },
      asinClickCount: { type: Number, default: 0 },
      asinClickShare: { type: Number, default: 0.0 },
      totalSameDayShippingClickCount: { type: Number, default: 0 },
    },
    cartAddData: {
      totalCartAddCount: { type: Number, default: 0 },
      totalCartAddRate: { type: Number, default: 0.0 },
      asinCartAddCount: { type: Number, default: 0 },
      asinCartAddShare: { type: Number, default: 0.0 },
      totalSameDayShippingCartAddCount: { type: Number, default: 0 },
    },
    purchaseData: {
      totalPurchaseCount: { type: Number, default: 0 },
      totalPurchaseRate: { type: Number, default: 0.0 },
      asinPurchaseCount: { type: Number, default: 0 },
      asinPurchaseShare: { type: Number, default: 0.0 },
      totalSameDayShippingPurchaseCount: { type: Number, default: 0 },
    },

    reportPeriod: {
      type: String,
      enum: ["WEEK", "MONTH"],
      required: true,
      default: "MONTH",
    },
    periodMeta: {
      year: { type: Number },
      month: { type: String },
      week: { type: Number },
    },
  },
  { timestamps: true }
);

// Compound unique index to prevent duplicate records
brandAnalyticsSchema.index(
  {
    configId: 1,
    profileId: 1,
    asin: 1,
    startDate: 1,
    endDate: 1,
    "searchQueryData.searchQuery": 1,
  },
  { unique: true }
);

// Indexes for fast lookup, pagination, and sorting
brandAnalyticsSchema.index({ configId: 1, profileId: 1, asin: 1 });
brandAnalyticsSchema.index({ "searchQueryData.searchQuery": 1 });
brandAnalyticsSchema.index({ "searchQueryData.searchQueryVolume": -1 });

module.exports = new mongoose.model("brandAnalytics", brandAnalyticsSchema);
