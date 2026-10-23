const mongoose = require("mongoose");

const campaignBidThresholdSchema = new mongoose.Schema(
    {
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
            required: true,
        },

        profileId: {
            type: Number,
            default: true,
        },

        campaignId: {
            type: Number,
            default: true,
        },

        maxBid: {
            type: Number,
            default: true,
        },

        minBid: {
            type: Number,
            default: 1,
        },

        targetACOS: {
            type: Number,
        },
    },
    { timestamps: true }
);

campaignBidThresholdSchema.index({
    campaignId: 1
});


// --- Performance Indexing ---
campaignBidThresholdSchema.index({configId:1,profileId:1});

module.exports = mongoose.model("campaignBidThreshold", campaignBidThresholdSchema);
