const mongoose = require("mongoose");
const campaignChangeHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    type: { type: String },
    changeLevel: {
      type: Number,
      trim: true,
    },
    changeType: {
      type: String,
      trim: true,
    },
    adGroupId: {
      type: Number,
      trim: true,
    },
    targeting: {
      type: String,
      trim: true,
      default: null
    },
    matchType: {
      type: String,
      trim: true,
      default: null
    },
    targetId: {
      type: String,
      trim: true,
      default: null
    },
    oldValue: {
      type: String,
      trim: true,
    },
    newValue: {
      type: String,
      trim: true,
    },
    updatedFrom: {
      type: String,
      trim: true,
    },
    statusHistoryEvent: { type: Boolean },
    source: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);
// TTL index for 396-day data retention
campaignChangeHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

// Compound indexes for fast history querying, sorting, and stream lookup
campaignChangeHistorySchema.index({ configId: 1, profileId: 1, type: 1, createdAt: -1 });
campaignChangeHistorySchema.index({ configId: 1, profileId: 1, changeLevel: 1, createdAt: -1 });
campaignChangeHistorySchema.index({ configId: 1, profileId: 1, source: 1, createdAt: -1 });
campaignChangeHistorySchema.index({ configId: 1, profileId: 1, changeType: 1 });
campaignChangeHistorySchema.index({ changeLevel: 1, changeType: 1, newValue: 1 });
campaignChangeHistorySchema.index({ changeLevel: 1, updatedFrom: 1 });

module.exports = new mongoose.model("campaignChangeHistory", campaignChangeHistorySchema);
