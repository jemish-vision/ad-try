const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const sbTargetingSchema = new mongoose.Schema(
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
    campaignId: {
      type: Number,
      trim: true,
    },
    adGroupId: {
      type: Number,
      trim: true,
    },
    targetId: {
      type: String,
      trim: true,
    },
    targeting: {
      type: String,
      trim: true,
    },
    reportDate: {
      type: String,
      trim: true,
    },
    keywordType: {
      type: String,
      trim: true,
      default: null,
    },
    matchType: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      trim: true,
      default: null,
    },
    impressions: {
      type: Number,
      trim: true,
      default: 0,
    },
    clicks: {
      type: Number,
      trim: true,
      default: 0,
    },
    sales: {
      type: Number,
      trim: true,
      default: 0,
    },
    spend: {
      type: Number,
      trim: true,
      default: 0,
    },
    orders: {
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
    keywordBid: {
      type: Number,
      trim: true,
      default: 0,
      set: v => (v != null ? parseFloat(v) || 0 : 0),
      get: v => {
        if (v == null) return 0;

        if (typeof v === "object" && v.toString) {
          return parseFloat(v.toString());
        }

        return v;
      },

    },
    topOfSearchImpressionShare: {
      type: Number,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

sbTargetingSchema.index(
  { configId: 1, profileId: 1, campaignId: 1, adGroupId: 1, targetId: 1, reportDate: 1 },
  { unique: true }
);

// Core filters
sbTargetingSchema.index({ configId: 1, profileId: 1, reportDate: -1 });

// Drilldowns
sbTargetingSchema.index({ configId: 1, profileId: 1, campaignId: 1, reportDate: -1 });
sbTargetingSchema.index({ configId: 1, profileId: 1, adGroupId: 1, reportDate: -1 });



sbTargetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    campaignId: 1,
    adGroupId: 1,
    targetId: 1,
    reportDate: 1
  },
  { unique: true, name: "uniq_targeting_per_day" }
);

sbTargetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    reportDate: -1
  },
  { name: "targeting_daily_list" }
);

sbTargetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    campaignId: 1,
    reportDate: -1
  },
  { name: "targeting_campaign_view" }
);

sbTargetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    adGroupId: 1,
    reportDate: -1
  },
  { name: "targeting_adgroup_view" }
);

// 🔵 Auto-calc before SAVE
sbTargetingSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
sbTargetingSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});


// --- Performance Indexing ---
sbTargetingSchema.index({ profileId: 1, adGroupId: 1, status: 1 });
sbTargetingSchema.index({ configId: 1, profileId: 1, targeting: 1, targetId: 1, reportDate: 1 });
sbTargetingSchema.index({ profileId: 1, reportDate: 1, campaignId: 1, adGroupId: 1, targeting: 1 });
sbTargetingSchema.index({ configId: 1, profileId: 1, status: 1, reportDate: 1, targeting: 1 });

// TTL index for 396-day data retention
sbTargetingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("sbtargeting", sbTargetingSchema);
