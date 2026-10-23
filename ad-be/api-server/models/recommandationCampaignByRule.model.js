const mongoose = require("mongoose");
const recommandationCampaignByRuleSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    ruleSchema: {
      type: String,
      trim: true,
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
    adGroupId: {
      type: Number,
      trim: true,
    },
    keywordId: {
      type: Number,
      trim: true,
    },
    targetId: {
      type: String,
      trim: true,
    },
    placement: {
      type: String,
      trim: true,
    },
    searchTerm: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    adGroupName: {
      type: String,
      trim: true,
    },
    targetName: {
      type: String,
      trim: true,
    },
    targetType: {
      type: String,
      trim: true,
    },
    changed: {
      type: String
    },
    oldValue: {
      type: String,
      trim: true,
      default: "",
    },
    newValue: {
      type: String,
      trim: true,
      default: "",
    },
    ruleTime: {
      type: String,
      default: "",
    },
    isReverted: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
recommandationCampaignByRuleSchema.index({configId:1,profileId:1,userId:1,ruleSchema:1,ruleId:1,ruleDate:1,ruleTime:1,type:1,campaignId:1});
recommandationCampaignByRuleSchema.index({configId:1,profileId:1,userId:1,ruleSchema:1,ruleId:1,ruleDate:1,ruleTime:1,type:1,campaignId:1,placement:1});
recommandationCampaignByRuleSchema.index({configId:1,profileId:1,userId:1,ruleSchema:1,ruleId:1,ruleDate:1,ruleTime:1,type:1,campaignId:1,adGroupId:1,targetId:1});
recommandationCampaignByRuleSchema.index({configId:1,profileId:1,userId:1,ruleSchema:1,ruleId:1,ruleDate:1,ruleTime:1,type:1,campaignId:1,adGroupId:1,keywordId:1,searchTerm:1});

module.exports = new mongoose.model("recommandationCampaignByRule", recommandationCampaignByRuleSchema);
