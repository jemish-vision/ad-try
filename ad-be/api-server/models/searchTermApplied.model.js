const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");

const searchTermAppliedSchema = new mongoose.Schema(
    {
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
        },
        profileId: {
            type: Number,
            trim: true,
        },
        type: {
            type: String,
            trim: true,
        },
        reportDate: {
            type: String,
            trim: true,
        },
        campaignId: {
            type: Number,
            default: null
        },
        adGroupId: {
            type: Number,
            trim: true,
        },
        keywordId: {
            type: Number,
            default: null,
        },
        searchTerm: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Uniqueness / upsert
searchTermAppliedSchema.index(
    { configId: 1, profileId: 1, reportDate: 1, campaignId: 1, adGroupId: 1, keywordId: 1, searchTerm: 1 },
    { unique: true }
);

// Core filters
searchTermAppliedSchema.index({ configId: 1, profileId: 1, reportDate: -1 });

// Drilldowns
searchTermAppliedSchema.index({ configId: 1, profileId: 1, campaignId: 1, reportDate: -1 });
searchTermAppliedSchema.index({ configId: 1, profileId: 1, adGroupId: 1, reportDate: -1 });

searchTermAppliedSchema.index({
    campaignId: 1,
    adGroupId: 1,
    keywordId: 1,
    searchTerm: 1,
    profileId: 1,
    reportDate: -1
});

searchTermAppliedSchema.index({
    configId: 1,
    profileId: 1,
    reportDate: -1,
    searchTerm: 1,
    campaignId: 1,
    adGroupId: 1
}, { name: "keyword_suggestion_main" });

searchTermAppliedSchema.index({
    configId: 1,
    profileId: 1,
    searchTerm: 1
}, { name: "searchTerm_lookup" });

module.exports = new mongoose.model("SearchTermApplied", searchTermAppliedSchema);
