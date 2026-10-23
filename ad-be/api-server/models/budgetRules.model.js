const mongoose = require("mongoose");
const budgetRulesSchema = new mongoose.Schema(
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
    ruleName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    campaignIds: {
      SP: { type: [Number], default: [] },
      SB: { type: [Number], default: [] },
      SD: { type: [Number], default: [] },
    },
    query: {
      SP: { type: String, trim: true, default: "" },
      SB: { type: String, trim: true, default: "" },
      SD: { type: String, trim: true, default: "" },
    },
    conditions: [
      {
        conditionType: String,
        conditionStringValue: String,
        conditionOperator: String,
        conditionValue: Number,
        conditionValueType: String,
      },
    ],
    actionType: {
      actionName: String,
      actionValue: { type: Number, default: "" },
      actionValueType: { type: String, default: "" },
    },
    budgetThreshold: {
      minBudget: { type: Number, default: 0 },
      maxBudget: { type: Number, default: 0 },
    },
    reportDate: { type: String, trim: true, default: null },
    toDate: { type: String, trim: true, default: null },
    days: { type: [String], trim: true },
    times: { type: [String], trim: true },
    ruleType: { type: String, trim: true, default: null },
    startDate: { type: String, trim: true, default: null },
    endDate: { type: String, trim: true, default: null },
    allowMultiTimeChanges: { type: Boolean, trim: true, default: true },
    pausedBy: { type: String, trim: true },
    countryCode: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    isRunning: { type: Boolean, default: false },
    lastStartedAt: { type: Date },
    daysSinceCreation: { type: Number, default: 0 },
    isDaysSinceCreation: { type: Boolean, default: false },
    isHourlyBudget: { type: Boolean, default: false },
    isHourlyBid: { type: Boolean, default: false },
    hourlyConfig: {
      frequency: {
        type: String,
        enum: ["DAILY", "WEEKDAY", "WEEKEND"],
        default: "DAILY",
      },
      slotType: {
        type: String,
        enum: ["1_HOUR", "2_HOUR", "3_HOUR", "4_HOUR", "6_HOUR"],
        default: "2_HOUR",
      },
      slots: [
        {
          slotIndex: Number,
          startTime: String,
          endTime: String,
          enabled: { type: Boolean, default: true },
          bidPercentage: { type: Number, default: 0 },
          budgetPercentage: { type: Number, default: 0 },
          value: { type: Number, default: 0 },
          state: {
            type: String,
            enum: ["ENABLED", "PAUSED"],
            default: "ENABLED",
          },
        },
      ],
    },
  },
  { timestamps: true }
);

budgetRulesSchema.index({
  configId: 1,
  profileId: 1,
  isActive: 1,
  ruleType: 1,
});

budgetRulesSchema.index({
  userId: 1,
  configId: 1,
  createdAt: -1,
});

budgetRulesSchema.index({
  configId: 1,
  profileId: 1,
  campaignIds: 1,
  isActive: 1,
});

budgetRulesSchema.index({
  configId: 1,
  profileId: 1,
  startDate: 1,
  endDate: 1,
});



// --- Performance Indexing ---
budgetRulesSchema.index({configId:1,profileId:1,times:1});

require("../helpers/ruleConditionSnapshotHelper").attachSnapshotLifecycle(budgetRulesSchema, "budget");

module.exports = new mongoose.model("budgetRule", budgetRulesSchema);
