const mongoose = require("mongoose");

const businessProductSalesSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },

    asin: {
      type: String,
      trim: true,
      default: null,
    },
    sku: {
      type: String,
      trim: true,
      default: null,
    },

    sales: {
      type: Number,
      trim: true,
      default: 0,
    },
    orders: {
      type: Number,
      trim: true,
      default: 0,
    },

    salesB2B: {
      type: Number,
      trim: true,
      default: 0,
    },
    ordersB2B: {
      type: Number,
      trim: true,
      default: 0,
    },

    reportDate: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// 1️⃣ Unique identity (critical)
businessProductSalesSchema.index({
  configId: 1,
  profileId: 1,
  asin: 1,
  reportDate: 1
}, { unique: true });

businessProductSalesSchema.index({
  configId: 1,
  profileId: 1,
  reportDate: 1,
  asin: 1
})


// --- Performance Indexing ---
businessProductSalesSchema.index({configId:1,profileId:1,asin:1,sku:1});

module.exports = new mongoose.model("businessProductSales", businessProductSalesSchema);
