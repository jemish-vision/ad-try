const mongoose = require("mongoose");
const camapignSettingSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    minTargetCPC: {
      type: Number,
      default: 0,
      trim: true,
    },
    maxTargetCPC: {
      type: Number,
      default: 0,
      trim: true,
    },
    limitValue: {
      type: Number,
      default: 0,
      trim: true,
    },
    TOStargetAcos: {
      type: Number,
      default: 0,
    },
    PPtargetAcos: {
      type: Number,
      default: 0,
    },
    ROStargetAcos: {
      type: Number,
      default: 0,
    },
    TOSPercentage: {
      type: Number,
      default: 0,
    },
    excludeAdjustedCampaign: {
      type: Boolean,
    },
    defaultOrder: {
      type: Number,
    },
    defaultBid: {
      type: Number,
      default: 0,
      trim: true,
    },
    targetAcos: {
      type: Number,
      default: 0,
    },
    bidLimitTargetACOS: {
      type: Number, default: 0
    },
    productEligibilityThreshold: {
      type: Number
    },

    // Rules Settings
    budgetRuleSetting: {
      minBudget: { type: Number, default: 0 },
      maxBudget: { type: Number, default: 0 },
    },

    placementRuleSetting: {
      minBid: { type: Number, default: 0 },
      maxBid: { type: Number, default: 0 },
    },

    targetingRuleSetting: {
      minBid: { type: Number, default: 0 },
      maxBid: { type: Number, default: 0 },
    },

    searchTermRuleSetting: {
      campaignPrefix: { type: String, default: "", trim: true },
    },

  },
  { timestamps: true }
);

// --- Performance Indexing ---
camapignSettingSchema.index({configId:1,profileId:1});
camapignSettingSchema.index({profileId:1});

module.exports = new mongoose.model("camapignSetting", camapignSettingSchema);
