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
    displayGroupRanks: { type: Number, default: 0 },
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
    aiOptimizationScore:  { type: Number,  default: null },
    aiLastAnalyzedAt:     { type: Date,    default: null },
    aiOptimizationStatus: { type: String,  enum: ['pending', 'analyzed', 'applied', null], default: null },
    aiCachedResult:       { type: Object,  default: null },   // full AI parsedContent
    aiAnalyzedChecksum:   { type: String,  default: null },   // MD5(title|price|mrp)

    // Live attributes fetched from Amazon SP-API (title, bullets, description, keywords)
    liveAttributes:          { type: Object, default: null },  // raw attributes object from SP-API
    liveAttributesFetchedAt: { type: Date,   default: null },  // when we last fetched from Amazon
  },
  { timestamps: true }
);

productListingSchema.index({
  configId: 1,
  profileId: 1,
  marketplaceId: 1,
  productType: 1,
  asin: 1
})

productListingSchema.index({
  sku: "text",
  asin: "text",
  itemName: "text"
})

productListingSchema.index({
  productCreatedDate: -1
})

productListingSchema.index({
  profileId: 1,
  asin: 1
})


// Optimized Index for getSPProduct Pipeline Filters
productListingSchema.index({ configId: 1, profileId: 1, isFavorite: 1, productCreatedDate: -1 });

module.exports = new mongoose.model("productlisting", productListingSchema);
