const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const sbCampaignsSchema = new mongoose.Schema(
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
    name: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    startDate: {
      type: String,
      trim: true,
    },
    endDate: {
      type: String,
      trim: true,
      default: null,
    },
    reportDate: {
      type: String,
      trim: true,
    },
    costType: {
      type: String,
      trim: true,
    },
    budget: {
      type: Number,
      trim: true,
    },
    budgetType: {
      type: String,
      trim: true,
    },
    isMultiAdGroupsEnabled: {
      type: Boolean,
    },
    productLocation: {
      type: String,
      trim: true,
    },
    bidOptimization: {
      type: Boolean,
    },
    bidOptimizationStrategy: {
      type: String,
      trim: true,
    },
    keywordBid: {
      type: Number,
      trim: true,
      default: 0,
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
    cpc: {
      type: Number,
      trim: true,
      default: 0,
    }
  },
  { timestamps: true }
);

// 1️⃣ Unique identity (REQUIRED)
sbCampaignsSchema.index(
  { configId: 1, profileId: 1, campaignId: 1, reportDate: 1 },
  { unique: true }
);

// 2️⃣ Cron / reporting
sbCampaignsSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ Rules execution
sbCampaignsSchema.index({
  configId: 1,
  profileId: 1,
  status: 1,
  reportDate: 1,
});

// 4️⃣ UI listing (optional)
sbCampaignsSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: -1,
  spend: -1,
});

sbCampaignsSchema.index({
  profileId: 1,
  reportDate: 1,
  status: 1,
  campaignId: 1,
  name: 1
}, { name: "profile_reportDate_status_covered" });

// 🔵 Auto-calc before SAVE
sbCampaignsSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
sbCampaignsSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});

// TTL index for 396-day data retention
sbCampaignsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("sbcampaigns", sbCampaignsSchema);
