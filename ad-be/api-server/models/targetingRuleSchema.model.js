const mongoose = require("mongoose");
const targetingRuleSchema = new mongoose.Schema(
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
    conditions: [
      {
        conditionType: String,
        conditionStatus: String,
        conditionOperator: String,
        conditionValue: Number,
        conditionValueType: String,
        targetingTypes: { type: [String], trim: true },
        campaigns: { type: Array, default: [] },
        adGroups: { type: Array, default: [] },
      },
    ],
    query: {
      SP: { type: String, trim: true, default: "" },
      SB: { type: String, trim: true, default: "" },
      SD: { type: String, trim: true, default: "" },
    },
    actionType: {
      actionName: String,
      actionValue: { type: Number, default: "" },
      actionValueType: { type: String, default: "" },
    },
    bidThreshold: {
      minBid: { type: Number, default: 0 },
      maxBid: { type: Number, default: 0 },
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
    isHourlyBid: { type: Boolean, default: false },
    targetingIds: {
      SP: { type: [String], default: [] },
      SB: { type: [String], default: [] },
      SD: { type: [String], default: [] },
    },
    hourlyConfig: {
      frequency: { type: String, enum: ["DAILY", "WEEKDAY", "WEEKEND"], default: "DAILY" },
      slotType: { type: String, enum: ["1_HOUR", "2_HOUR", "3_HOUR", "4_HOUR", "6_HOUR"], default: "2_HOUR" },
      targetingType: { type: String, enum: ["TARGETS", "KEYWORDS"], default: "TARGETS" },
      targetingIds: {
        SP: { type: [String], default: [] },
        SB: { type: [String], default: [] },
        SD: { type: [String], default: [] },
      },
      slots: [{
        slotIndex: { type: Number },
        startTime: { type: String },
        endTime: { type: String },
        enabled: { type: Boolean, default: true },
        bidPercentage: { type: Number, default: 0 },
        value: { type: Number, default: 0 },
        state: { type: String, enum: ["ENABLED", "PAUSED"], default: "ENABLED" },
      }],
    },
  },
  { timestamps: true }
);

// --- Performance Indexing ---
targetingRuleSchema.index({configId:1,profileId:1,isActive:1});
targetingRuleSchema.index({configId:1,profileId:1,times:1});

require("../helpers/ruleConditionSnapshotHelper").attachSnapshotLifecycle(targetingRuleSchema, "targeting");

module.exports = new mongoose.model("targetingRule", targetingRuleSchema);
