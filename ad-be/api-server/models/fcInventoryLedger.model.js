const mongoose = require("mongoose");

const fcInventoryLedgerSchema = new mongoose.Schema(
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
    reportDate: {
      type: String,
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
      required: true,
      trim: true,
    },
    fnsku: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    disposition: {
      type: String,
      trim: true,
      default: "SELLABLE",
    },
    startingWarehouseBalance: {
      type: Number,
      default: 0,
    },
    inTransitBetweenWarehouses: {
      type: Number,
      default: 0,
    },
    receipts: {
      type: Number,
      default: 0,
    },
    customerShipments: {
      type: Number,
      default: 0,
    },
    customerReturns: {
      type: Number,
      default: 0,
    },
    vendorReturns: {
      type: Number,
      default: 0,
    },
    warehouseTransfers: {
      type: Number,
      default: 0,
    },
    foundInventory: {
      type: Number,
      default: 0,
    },
    lostInventory: {
      type: Number,
      default: 0,
    },
    damagedInventory: {
      type: Number,
      default: 0,
    },
    disposedInventory: {
      type: Number,
      default: 0,
    },
    otherEvents: {
      type: Number,
      default: 0,
    },
    endingWarehouseBalance: {
      type: Number,
      default: 0,
    },
    unfulfillableBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// 1️⃣ Unique identity for upserts: One record per Profile + Config + Date + FC + SKU + Disposition
// Serves 100% of queries: upserts, profile queries, date queries, date-range filters, and reverse reportDate sorts
fcInventoryLedgerSchema.index(
  {
    configId: 1,
    profileId: 1,
    reportDate: 1,
    fcCode: 1,
    sku: 1,
    disposition: 1,
  },
  { unique: true }
);

module.exports = mongoose.model("fcInventoryLedger", fcInventoryLedgerSchema);
