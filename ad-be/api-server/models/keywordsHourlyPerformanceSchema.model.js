const mongoose = require("mongoose");

const keywordsHourlyPerformanceSchema = new mongoose.Schema(
  {
    configId: { type: mongoose.Schema.Types.ObjectId, ref: "config", required: true },
    profileId: { type: Number, trim: true, required: true },
    marketplaceId: { type: String, required: true },

    // Time
    reportDate: { type: String, trim: true, default: null },
    startTime: { type: String, trim: true, default: null },
    endTime: { type: String, trim: true, default: null },
    type: { type: String },

    // Campaign hierarchy
    campaignId: { type: Number, required: true },
    adGroupId: { type: Number, required: true },

    // Targeting
    keywordId: { type: Number },
    keywordText: { type: String },
    matchType: { type: String },

    placement: { type: String },

    // Metrics
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    spends: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    units: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },

    currency: { type: String },

    // Retention & Consolidation Flag
    isHourlyAggregated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

keywordsHourlyPerformanceSchema.index({ profileId: 1, marketplaceId: 1, reportDate: 1 });
keywordsHourlyPerformanceSchema.index({ campaignId: 1, adGroupId: 1 });
keywordsHourlyPerformanceSchema.index({ keywordId: 1, matchType: 1 });
keywordsHourlyPerformanceSchema.index({ reportDate: 1, startTime: 1, endTime: 1 });
keywordsHourlyPerformanceSchema.index({ configId: 1 });
keywordsHourlyPerformanceSchema.index({ configId: 1, profileId: 1, reportDate: 1, campaignId: 1, adGroupId: 1, keywordId: 1, startTime: 1, placement: 1 });
keywordsHourlyPerformanceSchema.index({ reportDate: 1, isHourlyAggregated: 1 });

// TTL index for 396-day data retention
keywordsHourlyPerformanceSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.model("KeywordsHourlyPerformance", keywordsHourlyPerformanceSchema);

