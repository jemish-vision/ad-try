const mongoose = require("mongoose");

const placementRulesSchema = new mongoose.Schema(
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

    query: {
      SP: { type: String, trim: true, default: "" },
      SB: { type: String, trim: true, default: "" },
      SD: { type: String, trim: true, default: "" },
    },

    campaignIds: {
      SP: { type: [Number], default: [] },
      SB: { type: [Number], default: [] },
      SD: { type: [Number], default: [] },
    },
    conditions: [
      {
        conditionType: String,
        conditionOperator: String,
        conditionValue: Number,
        conditionValueType: String,
      },
    ],
    actionType: [
      {
        placement: String,
        actionName: String,
        actionValue: { type: Number, default: "" },
        actionValueType: { type: String, default: "" },
      }
    ],

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

    countryCode: { type: String, trim: true },
    timezone: { type: String, trim: true },

    isRunning: { type: Boolean, default: false },
    lastStartedAt: { type: Date },
    daysSinceCreation: { type: Number, default: 0 },
    isDaysSinceCreation: { type: Boolean, default: false },

    isHourlyBid: { type: Boolean, default: false },
    hourlyConfig: {
      frequency: { type: String, enum: ["DAILY", "WEEKDAY", "WEEKEND"], default: "DAILY" },
      slotType: { type: String, default: "2_HOUR" },
      slots: [
        {
          slotIndex: Number,
          startTime: String,
          endTime: String,
          enabled: { type: Boolean, default: true },
          actions: [
            {
              placement: String,
              actionName: String,
              actionValue: { type: Number, default: 0 },
              actionValueType: { type: String, default: "Percentage" },
            }
          ]
        }
      ]
    }
  },
  { timestamps: true }
);


// --- Performance Indexing ---
placementRulesSchema.index({configId:1,profileId:1,isActive:1});
placementRulesSchema.index({configId:1,profileId:1,isActive:1,times:1});

require("../helpers/ruleConditionSnapshotHelper").attachSnapshotLifecycle(placementRulesSchema, "placement");

module.exports = new mongoose.model("placementRule", placementRulesSchema);
