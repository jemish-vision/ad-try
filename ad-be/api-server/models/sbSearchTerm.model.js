const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");

const sbSearchTermReportSchema = new mongoose.Schema(
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
        campaignName: {
            type: String,
            required: true
        },
        campaignId: {
            type: Number,
            default: null
        },
        status: {
            type: String,
            trim: true,
        },
        adGroupName: {
            type: String,
        },
        adGroupId: {
            type: Number,
            trim: true,
        },
        keywordId: {
            type: Number,
            default: null,
        },
        prefix: { type: String, trim: true },
        keywordType: {
            type: String,
            default: null,
        },
        orders: {
            type: Number,
            trim: true,
            default: 0,
        },
        targeting: {
            type: String,
            trim: true,
            default: null,
        },
        searchTerm: {
            type: String,
            trim: true,
            default: null,
        },
        title: {
            type: String,
            trim: true,
            default: null,
        },
        impressions: {
            type: Number,
            default: 0
        },
        clicks: {
            type: Number,
            default: 0,
        },
        cpc: {
            type: Number,
            default: null,
        },
        ctr: {
            type: Number,
            default: null,
        },
        sales: {
            type: Number,
            trim: true,
            default: 0,
        },
        acos: {
            type: Number,
            trim: true,
            default: 0,
        },
        roas: {
            type: Number,
            trim: true,
            default: 0,
        },
        timezone: {
            type: String,
            trim: true,
        },
        spend: {
            type: Number,
            default: 0
        },
        currencyCode: {
            type: String,
            trim: true,
        },
        cvr: {
            type: Number,
            trim: true,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// Uniqueness / upsert
sbSearchTermReportSchema.index(
    { configId: 1, profileId: 1, reportDate: 1, campaignId: 1, adGroupId: 1, keywordId: 1, searchTerm: 1 },
    { unique: true }
);

// Core filters
sbSearchTermReportSchema.index({ configId: 1, profileId: 1, reportDate: -1 });

// Drilldowns
sbSearchTermReportSchema.index({ configId: 1, profileId: 1, campaignId: 1, reportDate: -1 });
sbSearchTermReportSchema.index({ configId: 1, profileId: 1, adGroupId: 1, reportDate: -1 });


// 🔵 Auto-calc before SAVE
sbSearchTermReportSchema.pre("save", function (next) {
    const m = calcMetrics(this);

    this.acos = m.acos;
    this.roas = m.roas;
    this.cpc = m.cpc;
    this.cvr = m.cvr;
    this.ctr = m.ctr;

    next();
});


// 🔵 Auto-calc before UPDATE
sbSearchTermReportSchema.pre("findOneAndUpdate", function () {
    const update = this.getUpdate();
    const tempDoc = update.$set || update;

    const m = calcMetrics(tempDoc);

    this.setUpdate({ $set: { ...tempDoc, ...m } });
});

// TTL index for 396-day data retention
sbSearchTermReportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("SBSearchTerm", sbSearchTermReportSchema);
