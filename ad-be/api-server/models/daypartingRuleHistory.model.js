const mongoose = require("mongoose");
const { Schema } = mongoose;

const DaypartingRuleHistorySchema = new Schema(
    {
        ruleId: {
            type: Schema.Types.ObjectId,
            ref: "daypartingRule",
            required: true,
            index: true,
        },

        configId: {
            type: Schema.Types.ObjectId,
            ref: "config",
            required: true,
            index: true,
        },

        profileId: {
            type: Number,
            required: true,
            index: true,
        },

        slotIndex: {
            type: Number,
            required: true,
        },

        startTime: {
            type: String,
            required: true,
        },

        endTime: {
            type: String,
            required: true,
        },

        multiplier: {
            type: Number,
            required: true,
        },

        baseTargetingBid: {
            type: Object,
            default: {},
        },

        baseAppliedTargetingBid: {
            type: Object,
            default: {},
        },

        appliedTargetingBid: {
            type: Object,
            default: {},
        },

        baseBudget: {
            type: Object,
            default: {},
        },

        baseAppliedBudget: {
            type: Object,
            default: {},
        },

        appliedBudget: {
            type: Object,
            default: {},
        },

        basePlacementBid: {
            type: Object,
            default: {},
        },

        baseAppliedPlacementBid: {
            type: Object,
            default: {},
        },

        appliedPlacementBid: {
            type: Object,
            default: {},
        },

        executionState: {
            type: String,
            enum: ["PENDING", "APPLIED", "REVERTED"],
            default: "PENDING",
            index: true,
        },

        executedAt: {
            type: Date,
            default: Date.now,
        },

        revertedAt: {
            type: Date,
        },

        error: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

/* ---------- INDEXES ---------- */
DaypartingRuleHistorySchema.index({
    ruleId: 1,
    configId: 1,
    profileId: 1,
    executionState: 1,
});

// TTL index for 396-day data retention
DaypartingRuleHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.model(
    "daypartingRuleHistory",
    DaypartingRuleHistorySchema
);
