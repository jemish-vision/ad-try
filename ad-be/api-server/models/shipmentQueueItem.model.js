const mongoose = require("mongoose");

const shipmentQueueItemSchema = new mongoose.Schema(
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

    sellerSKU: {
      type: String,
      index: true
    },

    fulfillmentNetworkSKU: {
      type: String,
      index: true
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