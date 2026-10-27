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

// --- Performance Indexing ---
orderSchema.index({configId:1,profileId:1,marketplaceId:1,amazonOrderId:1});


// Optimized Index for getSPProduct Aggregation Pipeline Lookups
orderSchema.index({ sellerSKU: 1, orderStatus: 1 });

// Supports date-ranged order lookups (e.g. hourly performance tracking), so the
// purchaseDate range can be served by an index instead of a collection scan.
orderSchema.index({ profileId: 1, purchaseDate: 1 });

module.exports = new mongoose.model("order", orderSchema);
