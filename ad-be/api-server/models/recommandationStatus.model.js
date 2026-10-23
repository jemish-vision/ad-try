const mongoose = require("mongoose");
const recommandationStatusSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    campaignId: {
      type: Number,
      trim: true,
    },
    adGroupId: {
      type: Number,
      trim: true,
    },
    targetId: {
      type: String,
      trim: true,
    },
    keywordId: {
      type: Number,
      trim: true,
    },
    placement: {
      type: String,
      trim: true,
    },
    targeting: {
      type: String,
      trim: true,
    },
    keywordType: {
      type: String,
      trim: true,
    },
    matchType: {
      type: String,
      trim: true,
    },
    searchTerm: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    budget: {
      type: Number,
      trim: true,
    },
    placementBid: {
      type: Number,
      trim: true,
    },
    targetingBid: {
      type: Number,
      trim: true,
    },
    impression: {
      type: Number,
      trim: true,
    },
    clicks: {
      type: Number,
      trim: true,
    },
    orders: {
      type: Number,
      trim: true,
    },
    sales: {
      type: Number,
      trim: true,
    },
    spend: {
      type: Number,
      trim: true,
    },

    reportDate: {
      type: String,
      trim: true,
    },

    isNew: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

recommandationStatusSchema.index(
  {
    configId: 1,
    profileId: 1,
    ruleId: 1,
    campaignId: 1,
    adGroupId: 1,
    keywordId: 1,
    targetId: 1,
    placement: 1,
    searchTerm: 1,
    reportDate: 1
  },
  { unique: true }
);

recommandationStatusSchema.index({
  configId: 1,
  profileId: 1,
  ruleId: 1,
  reportDate: -1
});

recommandationStatusSchema.index({
  configId: 1,
  profileId: 1,
  ruleId: 1,
  isNew: 1,
  reportDate: 1
}, { name: "config_profile_rule_isNew_reportDate" });

recommandationStatusSchema.index({
  profileId: 1,
  campaignId: 1,
  reportDate: -1
});

recommandationStatusSchema.index({
  profileId: 1,
  campaignId: 1,
  adGroupId: 1
});

module.exports = new mongoose.model("recommandationStatus", recommandationStatusSchema);
