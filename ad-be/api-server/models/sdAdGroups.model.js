const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const sdAdGroupSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
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
    type: {
      type: String,
      trim: true,
    },
    adGroupId: {
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
    reportDate: {
      type: String,
      trim: true,
    },
    bidOptimization: {
      type: String,
      trim: true,
      default: null,
    },
    creativeType: {
      type: String,
      trim: true,
      default: null,
    },
    costType: {
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
    timezone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

sdAdGroupSchema.index(
  { configId: 1, profileId: 1, adGroupId: 1, reportDate: 1 },
  { unique: true }
);

sdAdGroupSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

sdAdGroupSchema.index({
  configId: 1,
  profileId: 1,
  campaignId: 1,
  reportDate: 1,
});

sdAdGroupSchema.index({
  configId: 1,
  profileId: 1,
  status: 1,
  reportDate: 1,
});

// 🔵 Auto-calc before SAVE
sdAdGroupSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
sdAdGroupSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});


// --- Performance Indexing ---
sdAdGroupSchema.index({configId:1,profileId:1,campaignId:1,adGroupId:1,reportDate:1});
sdAdGroupSchema.index({ profileId: 1, reportDate: 1, status: 1, adGroupId: 1, name: 1 }, { name: "profile_reportDate_status_covered" });

// TTL index for 396-day data retention
sdAdGroupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("sdadgroups", sdAdGroupSchema);
