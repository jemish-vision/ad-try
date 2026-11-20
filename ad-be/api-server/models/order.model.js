const { boolean } = require("joi");
const mongoose = require("mongoose");
const orderSchema = new mongoose.Schema(
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
      trim: true,
    },
    amazonOrderId: {
      type: String,
      trim: true,
    },
    purchaseDate: {
      type: Date,
      trim: true
    },
    orderStatus: {
      type: String,
      trim: true,
    },
    productName: {
      type: String,
      trim: true,
    },
    asin: {
      type: String,
      trim: true,
    },
    sellerSKU: {
      type: String,
      trim: true,
    },
    quantityOrdered: {
      type: String,
      trim: true,
    },
    itemPrice: {
      type: Number,
      default: 0,
    },
    deliveryDate: {
      type: Date,
      trim: true
    },
    reviewStatus: {
      type: String,
      trim: true,
    },
    reviewCancelReason: {
      type: String,
      trim: true,
    },
    reviewRequestedDate: {
      type: Date,
      trim: true
    }
  },
  { timestamps: true }
);

// 1. Unique order identity index (serves report stream upserts, point lookups, and return joins)
orderSchema.index({ amazonOrderId: 1, configId: 1, profileId: 1 }, { unique: true });

// 2. Optimized index for SKU & orderStatus lookups (serves allTimeOrders and review triggers)
orderSchema.index({ sellerSKU: 1, orderStatus: 1 });

// 3. Date-ranged order lookups (serves hourly performance tracking and organic order metrics)
orderSchema.index({ profileId: 1, purchaseDate: 1 });

module.exports = new mongoose.model("order", orderSchema);
