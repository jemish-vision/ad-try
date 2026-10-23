const mongoose = require("mongoose");

const returnSchema = new mongoose.Schema(
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

    returnSource: {
      type: String,
      enum: ["MFN", "FBA"],
      index: true
    },

    reportType: {
      type: String,
      default: null
    },

    // =========================================================
    // ORDER DETAILS
    // =========================================================

    orderId: {
      type: String,
      index: true
    },

    orderItemId: {
      type: String,
      index: true
    },

    orderDate: {
      type: Date,
      index: true
    },

    returnRequestDate: {
      type: Date,
      index: true
    },

    returnRequestStatus: {
      type: String,
      index: true
    },

    aToZClaim: {
      type: Boolean,
      default: false
    },

    isPrime: {
      type: Boolean,
      default: false
    },

    // =========================================================
    // ITEM DETAILS
    // =========================================================

    itemName: {
      type: String
    },

    asin: {
      type: String,
      index: true
    },

    merchantSku: {
      type: String,
      index: true
    },

    fnsku: {
      type: String,
      default: null
    },

    returnReasonCode: {
      type: String,
      index: true
    },

    inPolicy: {
      type: Boolean,
      default: false
    },

    returnQuantity: {
      type: Number,
      default: 0
    },

    resolution: {
      type: String,
      default: null
    },

    invoiceNumber: {
      type: String,
      default: null
    },

    category: {
      type: String,
      default: null
    },

    refundAmount: {
      type: Number,
      default: 0
    },

    currencyCode: {
      type: String,
      default: "USD"
    },

    // =========================================================
    // LABEL DETAILS
    // =========================================================

    trackingId: {
      type: String,
      index: true
    },

    returnCarrier: {
      type: String,
      default: null
    },

    labelCost: {
      type: Number,
      default: 0
    },

    labelType: {
      type: String,
      default: null
    },

    labelToBePaidBy: {
      type: String,
      default: null
    },

    // =========================================================
    // RETURN DETAILS
    // =========================================================

    returnDeliveryDate: {
      type: Date,
      default: null
    },

    returnType: {
      type: String,
      default: null
    },

    orderAmount: {
      type: Number,
      default: 0
    },

    orderQuantity: {
      type: Number,
      default: 0
    },

    // =========================================================
    // SAFET CLAIM DETAILS
    // =========================================================

    safetActionReason: {
      type: String,
      default: null
    },

    safetClaimId: {
      type: String,
      default: null,
      index: true
    },

    safetClaimState: {
      type: String,
      default: null
    },

    safetClaimCreationTime: {
      type: Date,
      default: null
    },

    safetClaimReimbursementAmount: {
      type: Number,
      default: 0
    },

    fulfillmentCenterId: {
      type: String,
      default: null
    },

    detailedDisposition: {
      type: String,
      default: null
    },

    licensePlateNumber: {
      type: String,
      default: null
    },

    customerComments: {
      type: String,
      default: null
    },
  },
  {
    timestamps: true
  }
);

returnSchema.index(
  {
    configId: 1,
    profileId: 1,
    returnSource: 1,
    orderId: 1,
    orderItemId: 1
  },
  {
    unique: true
  }
);

module.exports = mongoose.model("return", returnSchema);
