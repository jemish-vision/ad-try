const mongoose = require("mongoose");

const campaignOutOfBudgetHistorySchema = new mongoose.Schema(
    {
        configId: { type: mongoose.Schema.Types.ObjectId, ref: "config", required: true },
        profileId: { type: Number, required: true },
        campaignId: { type: Number, required: true },
        adType: { type: String, enum: ["SP", "SB", "SD"], default: "SP" },
        date: { type: String, required: true },
        outOfBudget: { type: Boolean, default: true },
        budget: { type: Number, default: 0 },
        spend: { type: Number, default: 0 },
        timeInBudget: { type: Number },
        source: { type: String, default: "stream" }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

campaignOutOfBudgetHistorySchema.index(
    { configId: 1, profileId: 1, campaignId: 1, date: 1 },
    { unique: true }
);

module.exports = mongoose.model("campaignOutOfBudgetHistory", campaignOutOfBudgetHistorySchema);
