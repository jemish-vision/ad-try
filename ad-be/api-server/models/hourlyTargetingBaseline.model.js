const mongoose = require("mongoose");

// The deterministic _id is the concurrency constraint. No secondary index build
// or automatic collection/index provisioning is performed on application startup.
const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    configId: { type: mongoose.Schema.Types.ObjectId, required: true },
    profileId: { type: Number, required: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["SP", "SB", "SD"], required: true },
    campaignId: { type: String, required: true },
    adGroupId: { type: String, default: "" },
    targetId: { type: String, required: true },
    baselineBid: { type: Number, required: true, min: 0 },
    bootstrapSource: { type: String, required: true },
    bootstrapHistoryId: { type: String, default: null },
}, { timestamps: true, autoIndex: false, autoCreate: false });

module.exports = mongoose.models.hourlyTargetingBaseline || mongoose.model("hourlyTargetingBaseline", schema);
