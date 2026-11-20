const mongoose = require("mongoose");

const shipmentQueueSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config"
    },

    profileId: {
      type: Number
    },

    shipmentId: {
      type: String
    },

    shipmentName: {
      type: String
    },

    shipmentStatus: {
      type: String
    },

    shipmentCreatedAt: {
      type: Date
    },

    destinationFulfillmentCenterId: {
      type: String
    },

    labelPrepType: {
      type: String
    },

    boxContentsSource: {
      type: String
    },

    shipFromAddress: {
      name: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      stateOrProvinceCode: String,
      countryCode: String,
      postalCode: String
    }
  },
  { timestamps: true }
);

// 1. Unique identity and deduplication index (serves report stream upserts, point lookups, and queue item joins)
shipmentQueueSchema.index(
  {
    configId: 1,
    profileId: 1,
    shipmentId: 1
  },
  {
    unique: true
  }
);

// 2. Primary chronological listing & range query index (serves getAllShippingQueue and date pagination)
shipmentQueueSchema.index({
  configId: 1,
  profileId: 1,
  shipmentCreatedAt: -1
});

// 3. Status filter & date index (serves getAllShippingQueue status filters and cronReminderForReimbursement)
shipmentQueueSchema.index({
  configId: 1,
  profileId: 1,
  shipmentStatus: 1,
  shipmentCreatedAt: -1
});

module.exports = new mongoose.model(
  "shipmentQueue",
  shipmentQueueSchema
);