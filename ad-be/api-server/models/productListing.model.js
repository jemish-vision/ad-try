const mongoose = require("mongoose");
const productListingSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    marketplaceId: {
      type: String,
      trim: true
    },
    asin: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    itemName: {
      type: String,
      trim: true,
    },
    productType: {
      type: String,
      trim: true,
    },
    imageURL: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      trim: true,
    },
    basePrice: {
      type: Number,
      trim: true,
      default: 0
    },
    sellingPrice: {
      type: Number,
      trim: true,
      default: 0
    },
    maximumRetailPrice: {
      type: Number,
      trim: true,
      default: 0
    },
    status: {
      type: [String],
      trim: true,
    },
    fbmQuantity: {
      type: Number
    },
    reviewRequestDelay: {
      type: Number,
      default: 7
    },
    reviewRequestEnable: {
      type: Boolean,
      default: true
    },
    notifyMeOnOrder: {
      type: Boolean,
      trim: true,
      default: false
    },
    classificationRank: { type: Number, default: 0 },
    classificationTitle: { type: String, trim: true, default: null },
    classificationLink: { type: String, trim: true, default: null },
    displayGroupRanks: { type: Number, default: 0 },
    displayGroupRank: { type: Number, default: 0 },
    displayGroupTitle: { type: String, trim: true, default: null },
    displayGroupLink: { type: String, trim: true, default: null },
    classificationRanks: { type: Array, default: [] },
    displayGroupRanksList: { type: Array, default: [] },
    productCreatedDate: {
      type: Date,
    },
    productUpdatedDate: {
      type: Date,
    },
    notifyOnLowStock: {
      type: Boolean,
      trim: true,
      default: false
    },
    isFavorite: {
      type: Boolean,
      default: false
    },

    // ── AI Listing Optimization ───────────────────────────────
    aiOptimizationScore: { type: Number, default: null },
    aiLastAnalyzedAt: { type: Date, default: null },
    aiOptimizationStatus: { type: String, enum: ['pending', 'analyzed', 'applied', null], default: null },
    aiCachedResult: { type: Object, default: null },   // full AI parsedContent
    aiAnalyzedChecksum: { type: String, default: null },   // MD5(title|price|mrp)

    // Live attributes fetched from Amazon SP-API (title, bullets, description, keywords)
    liveAttributes: { type: Object, default: null },  // raw attributes object from SP-API
    liveAttributesFetchedAt: { type: Date, default: null },  // when we last fetched from Amazon
  },
  { timestamps: true }
);

// 1️⃣ Unique identity: covers SyncProductListing upsert and findOne({ configId, profileId, sku }) in 0ms
productListingSchema.index(
  { configId: 1, profileId: 1, sku: 1, asin: 1 },
  { unique: true, name: "configId_1_profileId_1_sku_1_asin_1" }
);

// 2️⃣ Cross-collection $lookup and ASIN queries
productListingSchema.index({ profileId: 1, asin: 1 });

// 3️⃣ Optimized Index for getSPProduct Pipeline Filters & creation-date sorting
productListingSchema.index({ configId: 1, profileId: 1, isFavorite: 1, productCreatedDate: -1 });

module.exports = new mongoose.model("productlisting", productListingSchema);
