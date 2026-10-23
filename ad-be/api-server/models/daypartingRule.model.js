const mongoose = require("mongoose");

const { Schema } = mongoose;

const DaypartingSlotSchema = new Schema(
    {
        slotIndex: { type: Number, required: true },

        startTime: { type: String, required: true, match: /^([01]\d|2[0-4]):([0-5]\d)$/ },
        endTime: { type: String, required: true, match: /^([01]\d|2[0-4]):([0-5]\d)$/ },

        multiplier: { type: Number, required: true, min: 0.1, default: 1 },
        enabled: { type: Boolean, default: true },
    },
);

const DaypartingRuleSchema = new Schema(
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
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            enum: ["TARGETS", "BUDGETS", "PLACEMENTS", "KEYWORDS"],
            required: true,
        },

        frequency: {
            type: String,
            enum: ["DAILY", "WEEKDAY", "WEEKEND"],
            required: true,
            default: "DAILY",
        },

        slotType: {
            type: String,
            enum: ["1_HOUR", "2_HOUR", "3_HOUR", "4_HOUR", "6_HOUR"],
            required: true,
            default: "4_HOUR",
        },

        bidChangeType: {
            type: String,
            enum: ["MULTIPLIER", "PERCENTAGE"],
            default: "MULTIPLIER",
        },


        campaignIds: {
            SP: { type: [Number], default: [] },
            SB: { type: [Number], default: [] },
            SD: { type: [Number], default: [] },
        },

        targetingIds: {
            SP: { type: [String], default: [] },
            SB: { type: [String], default: [] },
            SD: { type: [String], default: [] },
        },

        slots: {
            type: [DaypartingSlotSchema],
            required: true,
        },

        status: {
            type: String,
            enum: ["ACTIVE", "PAUSED"],
            default: "ACTIVE",
        },
    },
    {
        timestamps: true
    }
);


// --- Performance Indexing ---
DaypartingSlotSchema.index({ configId: 1, profileId: 1, status: 1 });

module.exports = mongoose.model("daypartingRule", DaypartingRuleSchema);
