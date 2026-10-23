const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const targetingSchema = new mongoose.Schema(
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
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// 1️⃣ Unique
targetingSchema.index(
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

// 2️⃣ Daily List
targetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    reportDate: -1
  },
  { name: "targeting_daily_list" }
);

// 3️⃣ Campaign View
targetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    campaignId: 1,
    reportDate: -1
  },
  { name: "targeting_campaign_view" }
);

// 4️⃣ AdGroup View
targetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    adGroupId: 1,
    reportDate: -1
  },
  { name: "targeting_adgroup_view" }
);

targetingSchema.index({
  campaignId: 1,
  adGroupId: 1,
  targetId: 1,
  profileId: 1,
  reportDate: 1
});

targetingSchema.index({
  reportDate: 1,
  campaignId: 1,
  adGroupId: 1,
  targetId: 1,
  profileId: 1
});

targetingSchema.index({
  campaignId: 1,
  adGroupId: 1,
  targetId: 1,
  profileId: 1,
  reportDate: 1,
  impressions: 1,
  clicks: 1,
  orders: 1,
  spend: 1,
  sales: 1
});

targetingSchema.index({
  configId: 1,
  profileId: 1,
  targeting: 1,
  matchType: 1
}, { name: "lookup_fast_index" });

targetingSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
  keywordType: 1,
  status: 1,
  campaignId: 1,
  targeting: 1,
  matchType: 1,
  adGroupId: 1,
  impressions: 1,
  clicks: 1,
  spend: 1,
  sales: 1,
  orders: 1
}, { name: "keyword_analysis_covered_index" });

targetingSchema.index(
  {
    configId: 1,
    profileId: 1,
    reportDate: 1,
    campaignId: 1,
    targetId: 1
  },
  { name: "keyword_analysis_campaign_target" }
);

// 🔵 Auto-calc before SAVE
targetingSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
targetingSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});

targetingSchema.index({ profileId: 1, reportDate: 1, campaignId: 1, adGroupId: 1, targeting: 1 });
targetingSchema.index({ configId: 1, profileId: 1, status: 1, reportDate: 1, targeting: 1 });

module.exports = new mongoose.model("targeting", targetingSchema);
