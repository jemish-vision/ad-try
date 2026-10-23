const mongoose = require("mongoose");
const placementRuleHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    ruleDate: {
      type: String,
      trim: true,
    },
    ruleTime: {
      type: String,
      default: "",
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "placementRule",
    },
    conditionSnapshot: mongoose.Schema.Types.Mixed,
    ruleName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    lastRun: {
      type: String,
      trim: true,
    },
    remark: { type: String }
  },
  { timestamps: true }
);

// --- Performance Indexing ---
placementRuleHistorySchema.index({ configId: 1, profileId: 1, ruleId: 1 });
placementRuleHistorySchema.index({ configId: 1, profileId: 1, ruleDate: 1, ruleId: 1, lastRun: 1, ruleTime: 1 });

// TTL index for 396-day data retention
placementRuleHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model(
  "placementRuleHistory",
  placementRuleHistorySchema
);
