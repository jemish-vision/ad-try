const mongoose = require("mongoose");

const fcInventoryLedgerSchema = new mongoose.Schema(
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
    reportDate: {
      type: String,
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
      required: true,
      trim: true,
      index: true,
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

// One record per Profile + Config + Date + FC + SKU + Disposition
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

// Query indexes
fcInventoryLedgerSchema.index({
  profileId: 1,
  asin: 1,
  reportDate: -1,
});

fcInventoryLedgerSchema.index({
  profileId: 1,
  fcCode: 1,
  reportDate: -1,
});

fcInventoryLedgerSchema.index({
  profileId: 1,
  reportDate: -1,
});


// Optimized Query Indexes for Dashboard Grid and Cards
fcInventoryLedgerSchema.index({ configId: 1, profileId: 1, reportDate: -1 });
fcInventoryLedgerSchema.index({ configId: 1, profileId: 1, reportDate: -1, endingWarehouseBalance: -1 });
fcInventoryLedgerSchema.index({ configId: 1, profileId: 1, fcCode: 1, reportDate: -1 });

module.exports = mongoose.model("fcInventoryLedger", fcInventoryLedgerSchema);