const mongoose = require("mongoose");
const budgetRulesHistorySchema = new mongoose.Schema(
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
      ref: "budgetRule",
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
    remark: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// 1. Fast history lookup by date
budgetRulesHistorySchema.index(
  {
    configId: 1,
    profileId: 1,
    ruleId: 1,
    ruleDate: 1,
  }
);

// 2. Fast daily history lookup (profile-wise)
budgetRulesHistorySchema.index({
  configId: 1,
  profileId: 1,
  ruleDate: -1,
});

// 3. Rule execution history (rule-wise)
budgetRulesHistorySchema.index({
  configId: 1,
  ruleId: 1,
  ruleDate: -1,
});


// --- Performance Indexing ---
budgetRulesHistorySchema.index({ configId: 1, profileId: 1, ruleDate: 1, ruleId: 1, lastRun: 1, ruleTime: 1 });

// TTL index for 396-day data retention
budgetRulesHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model(
  "budgetRulesHistory",
  budgetRulesHistorySchema
);
