const mongoose = require("mongoose");

const shipmentQueueSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      index: true
    },

    profileId: {
      type: Number,
      index: true
    },

    shipmentId: {
      type: String,
      index: true
    },

    shipmentName: {
      type: String
    },

    shipmentStatus: {
      type: String,
      index: true
    },

    shipmentCreatedAt: {
      type: Date,
      index: true
    },

    destinationFulfillmentCenterId: {
      type: String,
      index: true
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


// --- Performance Indexing ---
shipmentQueueSchema.index({configId:1,profileId:1,shipmentStatus:1,shipmentCreatedAt:1});

module.exports = new mongoose.model(
  "shipmentQueue",
  shipmentQueueSchema
);