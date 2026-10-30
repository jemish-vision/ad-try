const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const campaignsSchema = new mongoose.Schema(
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
    budget: {
      type: Number,
      trim: true,
    },
    budgetType: {
      type: String,
      trim: true,
    },
    timeInBudget: {
      type: Number,
      trim: true,
    },
    costType: {
      type: String,
      trim: true,
      default: "CPC",
    },
    targetingType: {
      type: String,
      trim: true,
      default: null,
    },
    cpc: {
      type: Number,
      trim: true,
      default: 0,
    },
    clicks: {
      type: Number,
      trim: true,
      default: 0,
    },
    impressions: {
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
    keywordBid: {
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
    // healthScore: {
    //   type: String,
    //   trim: true
    // },
    tactic: {
      type: String,
      trim: true,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    units: {
      type: Number,
      trim: true,
      default: 0,
    },
    streaming: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      spend: { type: Number, default: 0 },
      sales: { type: Number, default: 0 },
      units: { type: Number, default: 0 },
      orders: { type: Number, default: null },
      lastSyncAt: { type: Date },
    },
    budgetTracking: {
      isOutOfBudget: { type: Boolean },
      estimatedSpend: { type: Number, default: 0 },
      lastUsagePercentage: { type: Number, default: 0 },
      lastUpdated: { type: Date },
    },
    timezone: {
      type: String,
      trim: true,
    },
    lastImportRunId: {
      type: String,
      trim: true,
    },
    importSourceVersion: {
      type: Number,
    },
  },
  { timestamps: true }
);

// 1️⃣ Unique identity (REQUIRED)
campaignsSchema.index(
  { configId: 1, profileId: 1, campaignId: 1, reportDate: 1 },
  { unique: true }
);

// 2️⃣ Cron / reporting
campaignsSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ Rules execution
campaignsSchema.index({
  configId: 1,
  profileId: 1,
  status: 1,
  reportDate: 1,
});

// 4️⃣ UI listing (optional)
campaignsSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: -1,
  spend: -1,
});

campaignsSchema.index({
  configId: 1,
  profileId: 1,
  campaignId: 1,
  reportDate: -1
});

campaignsSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: -1,
  campaignId: 1,
  spend: 1,
  sales: 1,
  clicks: 1,
  impressions: 1,
  orders: 1,
  budget: 1
});

campaignsSchema.index({
  campaignId: 1,
  profileId: 1,
  reportDate: 1
});

campaignsSchema.index({
  campaignId: 1,
  profileId: 1,
  reportDate: 1,
  status: 1
});

campaignsSchema.index({
  campaignId: 1,
  profileId: 1,
  reportDate: 1,
  status: 1,
  name: 1
}, { name: "campaign_lookup_covered_index" });

campaignsSchema.index({
  profileId: 1,
  reportDate: 1,
  status: 1,
  campaignId: 1,
  name: 1
}, { name: "profile_reportDate_status_covered" });

// 🔵 Auto-calc before SAVE
campaignsSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
campaignsSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});

// TTL index for 396-day data retention
campaignsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("campaign", campaignsSchema);
