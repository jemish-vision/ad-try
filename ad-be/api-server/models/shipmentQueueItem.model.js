const mongoose = require("mongoose");

const shipmentQueueItemSchema = new mongoose.Schema(
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

    sellerSKU: {
      type: String
    },

    fulfillmentNetworkSKU: {
      type: String
    },

    quantityShipped: {
      type: Number,
      default: 0
    },

    quantityReceived: {
      type: Number,
      default: 0
    },

    quantityInCase: {
      type: Number,
      default: 0
    },

    prepDetailsList: [
      {
        prepInstruction: String,
        prepOwner: String
      }
    ]
  },
  { timestamps: true }
);

// Unique identity and deduplication index (serves report stream upserts, shipment lookups, and queue item joins)
shipmentQueueItemSchema.index(
  {
    configId: 1,
    profileId: 1,
    shipmentId: 1,
    sellerSKU: 1
  },
  {
    unique: true
  }
);

module.exports = new mongoose.model(
  "shipmentQueueItem",
  shipmentQueueItemSchema
);