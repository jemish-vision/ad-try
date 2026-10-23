const mongoose = require("mongoose");

const metricSnapshotSchema = new mongoose.Schema(
  {
    conditionSnapshot: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now,
    },
    date: {
      type: String,
      default: "",
    },
    time: {
      type: String,
      default: "",
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    spend: {
      type: Number,
      default: 0,
    },
    sales: {
      type: Number,
      default: 0,
    },
    orders: {
      type: Number,
      default: 0,
    },
    acos: {
      type: Number,
      default: 0,
    },
    roas: {
      type: Number,
      default: 0,
    },
    cpc: {
      type: Number,
      default: 0,
    },
    ctr: {
      type: Number,
      default: 0,
    },
    settingValue: {
      type: String,
      default: "",
    },
    eventType: {
      type: String,
      default: "CRON_SNAPSHOT", // "INITIAL_EXECUTION", "CRON_SNAPSHOT", "MANUAL_SNAPSHOT", "SETTING_CHANGED"
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: true, timestamps: true }
);

const affectedCampaignByRuleSchema = new mongoose.Schema(
  {
    conditionSnapshot: mongoose.Schema.Types.Mixed,
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
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
      type: String,
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
      type: String,
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
    // --- Lifecycle State Management ---
    isActive: {
      type: Boolean,
      default: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    // --- Current Metrics Summary Cache ---
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    spend: {
      type: Number,
      default: 0,
    },
    sales: {
      type: Number,
      default: 0,
    },
    orders: {
      type: Number,
      default: 0,
    },
    acos: {
      type: Number,
      default: 0,
    },
    roas: {
      type: Number,
      default: 0,
    },
    cpc: {
      type: Number,
      default: 0,
    },
    ctr: {
      type: Number,
      default: 0,
    },
    // --- Historical Metric Snapshots Timeline ---
    metricsHistory: [metricSnapshotSchema],
  },
  { timestamps: true }
);

// --- Performance Indexing ---
affectedCampaignByRuleSchema.index({ profileId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, ruleTime: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, type: 1, campaignId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, ruleTime: 1, type: 1, campaignId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, campaignId: 1, reportDate: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, status: 1 });
affectedCampaignByRuleSchema.index({ campaignId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, type: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, ruleTime: 1, type: 1, campaignId: 1, placement: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, campaignId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, type: 1, ruleId: 1, ruleDate: 1, ruleTime: 1, campaignId: 1, adGroupId: 1, keywordId: 1, searchTerm: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, type: 1, ruleId: 1, ruleDate: 1, ruleTime: 1, campaignId: 1, searchTerm: 1 });
affectedCampaignByRuleSchema.index({ profileId: 1, campaignId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, type: 1, campaignId: 1, targetId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, userId: 1, ruleSchema: 1, ruleId: 1, ruleDate: 1, ruleTime: 1, type: 1, campaignId: 1, adGroupId: 1, targetId: 1 });
affectedCampaignByRuleSchema.index({ configId: 1, profileId: 1, ruleId: 1, isActive: 1, campaignId: 1, targetId: 1 });

module.exports = new mongoose.model("affectedCampaignByRule", affectedCampaignByRuleSchema);
