const mongoose = require("mongoose");

const searchTermRuleHistorySchema = new mongoose.Schema(
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
      trim: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "searchTermRule",
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
  },
  { timestamps: true }
);


// --- Performance Indexing ---
searchTermRuleHistorySchema.index({ configId: 1, profileId: 1, ruleDate: 1, ruleId: 1, lastRun: 1, ruleTime: 1 });

// TTL index for 396-day data retention
searchTermRuleHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model(
  "searchTermRuleHistory",
  searchTermRuleHistorySchema
);
