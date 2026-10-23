const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      trim: true,
    },

    sellerId: {
      type: String,
      trim: true,
    },
    asin: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },

    name: {
      type: String,
      trim: true,
    },

    fulfillmentType: {
      type: String, // "FBA | FBM"
      trim: true,
    },

    currentStock: {
      type: Number,
    },
    inboundStock: {
      type: Number,
    },
    reservedStock: {
      type: Number,
    },
    totalStock: {
      type: Number,
    },

    salesPerDay: {
      type: Number,
    },
    daysLeft: {
      type: Number,
    },

    status: {
      type: String,
      trim: true,
      enum: ["HEALTHY", "MEDIUM", "LOW", "OUT_OF_STOCK", "DEAD_INVENTORY"]
    },

    // ── Aging Tracker Fields ──────────────────────────────────────────────
    agingBucket: {
      type: String,
      trim: true,
      enum: ["30", "60", "90", "180+", null],
      default: null,
    },
    deadInventoryStatus: {
      type: String,
      trim: true,
      enum: ["ACTIVE", "DEAD", null],
      default: null,
    },
    suggestion: {
      type: String,
      trim: true,
      enum: ["DISCOUNT", "REMOVE", "MONITOR", null],
      default: null,
    },
    // Prevents notification spam — only alert once per 24h per SKU
    lastNotifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

inventorySchema.index(
  { profileId: 1, sellerId: 1, sku: 1 },
  { unique: true }
);

inventorySchema.index({
  configId: 1,
  profileId: 1,
  asin: 1
})

module.exports = new mongoose.model("inventory", inventorySchema);
