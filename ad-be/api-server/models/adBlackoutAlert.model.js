const mongoose = require("mongoose");

const REASON_CODES = [
  "BUY_BOX_LOST",
  "PRODUCT_UNBUYABLE",
  "CREATIVE_REJECTED",
  "LISTING_SUPPRESSED",
  "LISTING_INELIGIBLE",
  "PORTFOLIO_CAP_HIT",
  "CAMPAIGN_END_DATE",
  "RULE_PAUSED_ALL_TARGETS",
  "CAMPAIGN_OUT_OF_BUDGET",
  "CAMPAIGN_OR_ADGROUP_PAUSED",
  "UNKNOWN_SERVING_HALT",
];

const adBlackoutAlertSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
    },
    profileId: {
      type: Number,
      required: true,
    },
    adType: {
      type: String,
      enum: ["SP", "SB", "SD"],
      required: true,
    },
    entityLevel: {
      type: String,
      enum: ["CAMPAIGN", "AD_GROUP"],
      required: true,
    },
    campaignId: {
      type: Number,
      required: true,
    },
    campaignName: {
      type: String,
      trim: true,
      default: "",
    },
    adGroupId: {
      type: Number,
      default: null,
    },
    adGroupName: {
      type: String,
      trim: true,
      default: null,
    },
    portfolioId: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "RESOLVED", "DISMISSED"],
      default: "ACTIVE",
      required: true,
    },
    detectedAt: {
      type: Date,
      required: true,
    },
    firstBlackoutHour: {
      type: String,
      required: true, // YYYY-MM-DD HH:00 in profile timezone
    },
    lastZeroHour: {
      type: String,
      required: true,
    },
    lastCheckedHour: {
      type: String,
      required: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    dismissedAt: {
      type: Date,
      default: null,
    },
    dismissedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    reasonCode: {
      type: String,
      enum: REASON_CODES,
      default: "UNKNOWN_SERVING_HALT",
      required: true,
    },
    reasonParams: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    plainReason: {
      type: String,
      trim: true,
      default: "",
    },
    affectedAsins: {
      type: [String],
      default: [],
    },
    affectedAdGroupIds: {
      type: [Number],
      default: [],
    },
    // Internal priority ranking baseline (never displayed as currency loss)
    baseline: {
      avgHourlyImpressions: { type: Number, default: 0 },
      sales7d: { type: Number, default: 0 },
      impressions7d: { type: Number, default: 0 },
      spend7d: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Guarantees at most one ACTIVE outage alert per entity (safe under retries/concurrency)
adBlackoutAlertSchema.index(
  { configId: 1, profileId: 1, adType: 1, entityLevel: 1, campaignId: 1, adGroupId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" }, name: "unique_active_blackout_entity" }
);

// Query & silent impact sort index for dashboard API
adBlackoutAlertSchema.index(
  { configId: 1, profileId: 1, status: 1, "baseline.sales7d": -1, "baseline.impressions7d": -1, detectedAt: -1 },
  { name: "dashboard_blackout_query" }
);

adBlackoutAlertSchema.statics.REASON_CODES = REASON_CODES;

module.exports = mongoose.models.ad_blackout_alert || mongoose.model("ad_blackout_alert", adBlackoutAlertSchema);
