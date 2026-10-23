const mongoose = require("mongoose");

const inventoryAgingConfigSchema = new mongoose.Schema(
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
        },
        sku: {
            type: String,
            trim: true,
        },
        // If total orders in the lookback period < this value → product is "Dead Inventory"
        minOrders: {
            type: Number,
            default: 10,
        },
        // How many days of sales history to look back when computing avg daily orders
        lookbackDays: {
            type: Number,
            default: 30,
        },
        isEnabled: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Unique per profile + SKU
inventoryAgingConfigSchema.index(
    { configId: 1, profileId: 1, sku: 1 },
    { unique: true }
);

inventoryAgingConfigSchema.index({ configId: 1, profileId: 1 });

module.exports = new mongoose.model("inventoryAgingConfig", inventoryAgingConfigSchema);
