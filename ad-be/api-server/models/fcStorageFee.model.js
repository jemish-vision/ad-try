const mongoose = require("mongoose");

const fcStorageFeeSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
    },
    profileId: {
      type: Number,
      required: true,
    },
    sellerId: {
      type: String,
      trim: true,
    },
    monthYear: {
      type: String, // "YYYY-MM"
      required: true,
    },
    fcCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "IN",
    },
    asin: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    fnsku: {
      type: String,
      trim: true,
    },
    productName: {
      type: String,
      trim: true,
      default: "",
    },
    fulfillmentCenter: {
      type: String,
      trim: true,
    },
    averageQuantityOnHand: {
      type: Number,
      default: 0,
    },
    averageQuantityPendingRemoval: {
      type: Number,
      default: 0,
    },
    totalAverageQuantity: {
      type: Number,
      default: 0,
    },
    estimatedMonthlyStorageFee: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    volumeCubicFeet: {
      type: Number,
      default: 0,
    },
    productSizeTier: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// 1. Unique identity and deduplication index (serves report stream upserts and warehouse lookups)
fcStorageFeeSchema.index(
  { configId: 1, profileId: 1, monthYear: 1, fcCode: 1, asin: 1, fnsku: 1 },
  { unique: true }
);

// 2. Primary listing, KPI aggregation, and sorted fee index (serves getFcStorageFees, exists, and latest month sort)
fcStorageFeeSchema.index({
  configId: 1,
  profileId: 1,
  monthYear: -1,
  estimatedMonthlyStorageFee: -1,
});

module.exports = mongoose.model("fcStorageFee", fcStorageFeeSchema);
