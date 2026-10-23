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
