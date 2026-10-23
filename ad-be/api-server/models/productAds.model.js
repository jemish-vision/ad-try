const mongoose = require("mongoose");
const { calcMetrics } = require("../helper/common");
const productAdsSchema = new mongoose.Schema(
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
    campaignName: {
      type: String,
      trim: true,
    },
    adGroupId: {
      type: Number,
      trim: true,
    },
    adId: {
      type: Number,
      trim: true,
    },
    asins: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
      default: null,
    },
    pageType: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    adType: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    headline: {
      type: String,
      trim: true,
    },
    brandName: {
      type: String,
      trim: true,
    },
    brandLogoAssetID: {
      type: String,
      trim: true,
    },
    videoAssetIds: {
      type: Array,
      trim: true,
    },
    customImageAssetId: {
      type: String,
      trim: true,
    },
    timezone: {
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
    reportDate: {
      type: String,
      trim: true,
    },
    cpc: {
      type: Number,
      trim: true,
      default: 0,
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
productAdsSchema.index(
  {
    configId: 1,
    profileId: 1,
    adId: 1,
    reportDate: 1,
  },
  { unique: true }
);

// 2️⃣ Daily listing
productAdsSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
});

// 3️⃣ Campaign view
productAdsSchema.index({
  configId: 1,
  profileId: 1,
  campaignId: 1,
  reportDate: 1,
});

// 4️⃣ AdGroup view
productAdsSchema.index({
  configId: 1,
  profileId: 1,
  adGroupId: 1,
  reportDate: 1,
});

productAdsSchema.index({
  profileId: 1,
  sku: 1,
  reportDate: 1
})

productAdsSchema.index({
  configId: 1,
  profileId: 1,
  asins: 1,
  reportDate: 1
})

productAdsSchema.index({
  campaignId: 1,
  reportDate: 1,
  asins: 1
});

productAdsSchema.index({
  campaignId: 1,
  reportDate: 1,
  asins: 1,
  _id: 1
});

productAdsSchema.index({
  profileId: 1,
  campaignId: 1,
  adGroupId: 1,
  reportDate: 1
});

// 🔵 Auto-calc before SAVE
productAdsSchema.pre("save", function (next) {
  const m = calcMetrics(this);

  this.acos = m.acos;
  this.roas = m.roas;
  this.cpc = m.cpc;
  this.cvr = m.cvr;
  this.ctr = m.ctr;

  next();
});


// 🔵 Auto-calc before UPDATE
productAdsSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const tempDoc = update.$set || update;

  const m = calcMetrics(tempDoc);

  this.setUpdate({ $set: { ...tempDoc, ...m } });
});


// --- Performance Indexing ---
productAdsSchema.index({name:1});
productAdsSchema.index({asins:1,type:1});

// TTL index for 396-day data retention
productAdsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = new mongoose.model("product_ad", productAdsSchema);
