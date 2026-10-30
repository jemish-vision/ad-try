const mongoose = require("mongoose");

const conditionSchema = new mongoose.Schema(
  {
    conditionType: {
      type: String,
      trim: true,
    },
    conditionOperator: {
      type: String,
      trim: true,
      default: "",
    },
    conditionValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Out of Budget only: look-back period ("LAST_7_DAYS" | "LAST_14_DAYS" | "LAST_30_DAYS" | "CUSTOM")
    oobPeriod: {
      type: String,
      trim: true,
      default: "",
    },
    // Out of Budget only: number of days the campaign must have been continuously out of budget
    oobDays: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

const actionSchema = new mongoose.Schema(
  {
    actionName: {
      type: String,
      trim: true,
      enum: [
        // Campaign
        "SetBudget",
        "IncreaseBudget",
        "DecreaseBudget",
        "CampaignEnable",
        "CampaignPause",
        // Placement / Targeting bid actions
        "SetBid",
        "IncreaseBid",
        "DecreaseBid",
        // Targeting toggle
        "EnableTargeting",
        "PauseTargeting",
        // Search Term
        "AddAsTargeting",
        "AddAsNegativeTargeting",
      ],
    },
    actionValue: {
      type: Number,
      default: null,
    },
    actionValueType: {
      type: String,
      trim: true,
      enum: ["Number", "Percentage", ""],
      default: "",
    },
    // Only used when gridName === "Placement" and actionName is a bid action
    placementType: {
      type: String,
      trim: true,
      enum: ["Top of Search", "Rest of Search", "Product Page", "Product pages", ""],
      default: "",
    },
    // Only used when gridName === "Search Term"
    matchType: {
      type: String,
      trim: true,
      enum: ["Exact", "Phrase", ""],
      default: "",
    },
  },
  { _id: false }
);

const recommendationRuleSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    profileId: {
      type: Number,
      trim: true,
      required: true,
    },

    ruleName: {
      type: String,
      trim: true,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    gridName: {
      type: String,
      trim: true,
      enum: ["Campaign", "Placement", "Targeting", "Search Term"],
      required: true,
    },

    // ── Date filter ───────────────────────────────────────────────────────────
    reportDate: {
      type: String,
      trim: true,
      enum: [
        "TODAY",
        "YESTERDAY",
        "LAST_7_DAYS",
        "THIS_WEEK",
        "LAST_WEEK",
        "LAST_30_DAYS",
        "THIS_MONTH",
        "LAST_MONTH",
        "YEAR_TO_DATE",
        "LIFETIME",
      ],
      default: null,
    },

    // ── Conditions (AND logic, multiple allowed) ───────────────────────────────
    conditions: {
      type: [conditionSchema],
      default: [],
    },

    actions: {
      type: [actionSchema],
      default: [],
    },

    query: { type: String, trim: true, default: "" },

    // ── Campaign Selection (Include / Exclude) ──────────────────────────────────
    campaignSelectionType: {
      type: String,
      trim: true,
      enum: ["ALL", "INCLUDE", "EXCLUDE"],
      default: "ALL",
    },
    campaignIds: {
      SP: [{ type: Number }],
      SB: [{ type: Number }],
      SD: [{ type: Number }],
    },

    // ── Miscellaneous ─────────────────────────────────────────────────────────
    countryCode: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    isRunning: {
      type: Boolean,
      default: false,
    },
    lastStartedAt: { type: Date },

    isDeleted: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);

// Fast lookup by profile + active status + gridName
recommendationRuleSchema.index({
  configId: 1,
  profileId: 1,
  isActive: 1,
  gridName: 1,
});

// User dashboard queries (list by user, newest first)
recommendationRuleSchema.index({
  userId: 1,
  configId: 1,
  createdAt: -1,
});


// --- Performance Indexing ---
conditionSchema.index({ isActive: 1, isDeleted: 1 });
conditionSchema.index({ _id: 1, isActive: 1 });
conditionSchema.index({ _id: 1, isActive: 1, isDeleted: 1 });
conditionSchema.index({ configId: 1, profileId: 1, isActive: 1, isDeleted: 1 });

module.exports = mongoose.model("recommendationRule", recommendationRuleSchema);