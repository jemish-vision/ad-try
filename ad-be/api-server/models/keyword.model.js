const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const keywordSchema = new mongoose.Schema(
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
    adGroupId: {
      type: Number,
      trim: true,
    },
    keywordId: {
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
    bid: {
      type: Number,
      trim: true,
    },
    matchType: {
      type: String,
      trim: true,
      default: null,
    },
    timezone: {
      type: String,
      trim: true,
    },
    reportDate: {
      type: String,
      trim: true,
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
    type: {
      type: String,
      trim: true,
    },
    expressions: {
      type: [
        {
          type: { type: String, trim: true },
          value: { type: String, trim: true }
        }
      ],
      default: []
    },
  },
  { timestamps: true }
);

keywordSchema.index({ updatedAt: -1 });
keywordSchema.index({ clicks: -1 });
keywordSchema.index({ impressions: -1 });
keywordSchema.index({ acos: -1 });
keywordSchema.index({ reportDate: -1 });

// 1️⃣ Unique identity
keywordSchema.index(
  {
    configId: 1,
    profileId: 1,
    keywordId: 1,
    reportDate: 1,
  },
  { unique: true }
);

// 2️⃣ Cron / dashboard
keywordSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ Rules execution
keywordSchema.index({
  configId: 1,
  profileId: 1,
  status: 1,
  reportDate: 1,
});

// 4️⃣ Campaign & ad group scoped rules
keywordSchema.index({
  configId: 1,
  profileId: 1,
  campaignId: 1,
  adGroupId: 1,
  reportDate: 1,
});


// 🔵 Auto-calc before SAVE
keywordSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
keywordSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});


// --- Performance Indexing ---
keywordSchema.index({configId:1,profileId:1,keywordId:1,campaignId:1,adGroupId:1,reportDate:1});
keywordSchema.index({name:1});
keywordSchema.index({matchType:1,name:1});
keywordSchema.index({configId:1,profileId:1,keywordId:1,campaignId:1,adGroupId:1});

// TTL index for 396-day data retention
keywordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("keyword", keywordSchema);
