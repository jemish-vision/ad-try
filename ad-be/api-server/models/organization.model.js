const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    organizationName: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "packages",
      default: null,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "subscriptions",
      default: null,
    },
    upcomingPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "packages",
      default: null,
    },
    upcomingSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "subscriptions",
      default: null,
    },
    upcomingStartDate: {
      type: Date,
      default: null,
    },
    isUpcomingPlanPaid: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    isTrialActive: {
      type: Boolean,
      default: false,
    },
    hasUsedTrial: {
      type: Boolean,
      default: false,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    isDataDeletionStopped: {
      type: Boolean,
      default: false,
    },
    dataDeletionStoppedAt: {
      type: Date,
      default: null,
    },
    dataDeletionStoppedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    // Competitor Price History: days of daily snapshots to keep (Enterprise feature)
    historyRetentionDays: {
      type: Number,
      enum: [7, 14, 30, 60],
      default: 30,
    },
    // Regional pricing. "auto": price by billingCountry once locked, else by the visitor's country
    // (Cloudflare CF-IPCountry). "default": always the plan's default price (customers who were already
    // paying before regional pricing, or set by Super Admin).
    pricingMode: {
      type: String,
      enum: ["auto", "default"],
      default: "auto",
    },
    // ISO country locked at the first paid checkout; renewals and plan switches keep this price.
    billingCountry: { type: String, trim: true, uppercase: true, default: null },
    billingCountrySetAt: { type: Date, default: null },
    billingCountrySource: { type: String, enum: ["checkout", "admin", null], default: null },
    // Set when the card or billing address country of a regional-price checkout is outside that region.
    billingCountryMismatch: {
      pricingCountry: { type: String, default: null },
      cardCountry: { type: String, default: null },
      addressCountry: { type: String, default: null },
      detectedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const clearCacheHook = function () {
  const { clearOrgPagePermissionCache } = require("../helper/common");
  if (clearOrgPagePermissionCache) clearOrgPagePermissionCache();
};

organizationSchema.post('save', clearCacheHook);
organizationSchema.post('findOneAndUpdate', clearCacheHook);
organizationSchema.post('updateOne', clearCacheHook);
organizationSchema.post('updateMany', clearCacheHook);
organizationSchema.post('deleteOne', clearCacheHook);
organizationSchema.post('deleteMany', clearCacheHook);

module.exports = mongoose.model("organization", organizationSchema);
