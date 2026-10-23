// models/searchTermBlock.model.js

const mongoose = require("mongoose");

const searchTermBlockSchema = new mongoose.Schema({
    configId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "config",
    },
    profileId: Number,
    campaignId: Number,
    adGroupId: Number,
    searchTerm: String,
    reason: {
        type: String, // NEVER_RECOMMANDED
        default: "NEVER_RECOMMANDED"
    }
}, {
    timestamps: true
});

// Prevent duplicates
searchTermBlockSchema.index({
    configId: 1,
    profileId: 1,
    campaignId: 1,
    adGroupId: 1,
    searchTerm: 1
}, { unique: true });

module.exports = mongoose.model("SearchTermBlock", searchTermBlockSchema);