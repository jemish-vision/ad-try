const mongoose = require("mongoose");

const includedProductSchema = new mongoose.Schema({
  asin: {
    type: String,
    trim: true,
  },
  productName: {
    type: String,
    trim: true,
  },
  productGlanceViews: {
    type: Number,
    default: 0,
  },
  productUnitsSold: {
    type: Number,
    default: 0,
  },
  productRevenue: {
    type: Number,
    default: 0,
  },
  productRevenueCurrencyCode: {
    type: String,
    trim: true,
  }
});

const dealPerformanceSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    promotionId: {
      type: String,
      required: true,
      trim: true,
    },
    marketplaceId: {
      type: String,
      trim: true,
    },
    merchantId: {
      type: String,
      trim: true,
    },
    promotionName: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    glanceViews: {
      type: Number,
      default: 0,
    },
    unitsSold: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
    revenueCurrencyCode: {
      type: String,
      trim: true,
    },
    startDateTime: {
      type: Date,
    },
    endDateTime: {
      type: Date,
    },
    createdDateTime: {
      type: Date,
    },
    lastUpdatedDateTime: {
      type: Date,
    },
    includedProducts: [includedProductSchema]
  },
  { timestamps: true }
);

// Unique index to prevent duplicate deals per profile
dealPerformanceSchema.index({ profileId: 1, promotionId: 1 }, { unique: true });

// Index for dashboard queries
dealPerformanceSchema.index({ profileId: 1, startDateTime: -1, status: 1 });

module.exports = mongoose.model("dealPerformance", dealPerformanceSchema);
