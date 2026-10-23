const mongoose = require("mongoose");

const searchTermRulesSchema = new mongoose.Schema(
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
        operator: String,
        conditionType: String,
        conditionOperator: String,
        conditionValue: Number,
        conditionMaxValue: Number,
        conditionValueType: String,
        useTargetAcos: Boolean,
      },
    ],
    actionType: {
      placement: String,
      actionName: String,
      actionValue: { type: String, default: "" },
      actionValueType: { type: String, default: "" },
    },

    ruleType: { type: String, trim: true, default: null },

    reportDate: { type: String, trim: true, default: null },
    toDate: { type: String, trim: true, default: null },

    countryCode: { type: String, trim: true },
    timezone: { type: String, trim: true },
  },
  { timestamps: true }
);

require("../helpers/ruleConditionSnapshotHelper").attachSnapshotLifecycle(searchTermRulesSchema, "searchTerm");

module.exports = new mongoose.model("searchTermRule", searchTermRulesSchema);
