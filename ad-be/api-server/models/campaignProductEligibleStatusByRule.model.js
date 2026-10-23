const mongoose = require("mongoose");
const campaignProductEligibleStatusByRuleSchema = new mongoose.Schema(
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
    ruleDate: {
      type: String
    },
    type: { type: String },
    campaignId: {
      type: Number,
      trim: true,
    },

    totalProduct: {
      type: Number,
      trim: true,
    },
    inStockProduct: {
      type: Number,
      trim: true,
    },
    availabilityRatio: {
      type: Number,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("campaignProductEligibleStatusByRule", campaignProductEligibleStatusByRuleSchema);
