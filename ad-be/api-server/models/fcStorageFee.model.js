const mongoose = require("mongoose");

const fcStorageFeeSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      required: true,
      index: true,
    },
    profileId: {
      type: Number,
      required: true,
      index: true,
    },
    sellerId: {
      type: String,
      trim: true,
    },
    monthYear: {
      type: String, // "YYYY-MM"
      required: true,
      index: true,
    },
    fcCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
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
      index: true,
    },
    sku: {
      type: String,
      trim: true,
      index: true,
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

fcStorageFeeSchema.index(
  { configId: 1, profileId: 1, monthYear: 1, fcCode: 1, asin: 1, fnsku: 1 },
  { unique: true }
);
fcStorageFeeSchema.index({ profileId: 1, monthYear: 1, fcCode: 1 });


// Optimized Query Indexes for Storage Fees
fcStorageFeeSchema.index({ configId: 1, profileId: 1, monthYear: -1 });
fcStorageFeeSchema.index({ configId: 1, profileId: 1, monthYear: -1, estimatedMonthlyStorageFee: -1 });

module.exports = mongoose.model("fcStorageFee", fcStorageFeeSchema);
