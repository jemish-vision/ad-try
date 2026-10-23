const mongoose = require("mongoose");

const holidayActionHistorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    holidayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "holiday",
    },
    startDate: {
      type: String,
      trim: true,
    },
    endDate: {
      type: String,
      trim: true,
      default: null,
    },
    protectionAction: {
      type: String,
      enum: [null, "PAUSE_RULES", "REDUCE_BIDS", "PAUSE_CAMPAIGNS"],
      trim: true,
      default: null
    },
    executionState: {
      type: String,
      enum: ["APPLIED", "REVERTED"],
      default: "PENDING",
      index: true,
    },
    pauseRuleAction: {
      type: Object,
      default: {},
    },
    pauseCampaignAction: {
      type: Object,
      default: {},
    }
  },
  { timestamps: true }
);


// --- Performance Indexing ---
holidayActionHistorySchema.index({ configId: 1, profileId: 1, holidayId: 1 });
holidayActionHistorySchema.index({ configId: 1, profileId: 1, holidayId: 1, protectionAction: 1, executionState: 1 });

// TTL index for 396-day data retention
holidayActionHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("holidayActionHistories", holidayActionHistorySchema);
