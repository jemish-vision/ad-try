const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const placementSchema = new mongoose.Schema(
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
    currencyCode: {
      type: String,
      trim: true,
    },
    campaignId: {
      type: Number,
      trim: true,
    },
    campaignName: {
      type: String,
      trim: true,
      default: null,
    },
    campaignStatus: {
      type: String,
      trim: true,
      default: null,
    },
    reportDate: {
      type: String,
      trim: true,
    },
    campaignBudget: {
      type: Number,
      trim: true,
      default: 0,
    },
    campaignBudgetType: {
      type: String,
      trim: true,
      default: null,
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
    impressions: {
      type: Number,
      trim: true,
      default: 0,
    },
    cvr: {
      type: Number,
      trim: true,
      default: 0,
    },
    ctr: {
      type: Number,
      trim: true,
      default: 0,
    },
    cpc: {
      type: Number,
      trim: true,
      default: 0,
    },
    placement: {
      type: String,
      trim: true,
    },
    conversion: {
      type: Number,
      trim: true,
      default: 0,
    },
    biddingStartegy: {
      type: String,
      trim: true,
      default: "",
    },
    keywordBid: {
      type: Number,
      default: 0,
    },
    units: {
      type: Number,
      default: 0,
    },
    placementModifier: {
      type: Number,
      default: 0,
    },
    targetAcos: {
      type: Number,
      default: 0,
    },
    targetCpc: {
      type: Number,
      default: 0,
    },
    newKeywordBid: {
      type: Number,
      default: 0,
    },

    isAudience: {
      type: Boolean,
      default: false,
    },
    isBusiness: {
      type: Boolean,
      default: false,
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

// 1️⃣ Unique identity (critical)
placementSchema.index(
  {
    configId: 1,
    profileId: 1,
    campaignId: 1,
    placement: 1,
    reportDate: 1,
  },
  { unique: true }
);

// 2️⃣ Daily cron & dashboard
placementSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ Placement rules
placementSchema.index({
  configId: 1,
  profileId: 1,
  placement: 1,
  reportDate: 1,
});

// 4️⃣ Campaign-level rules
placementSchema.index({
  configId: 1,
  profileId: 1,
  campaignId: 1,
  reportDate: 1,
});


// 🔵 Auto-calc before SAVE
placementSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
placementSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});

// TTL index for 396-day data retention
placementSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("placement", placementSchema);
