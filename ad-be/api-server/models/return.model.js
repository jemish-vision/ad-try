const mongoose = require("mongoose");

const returnSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config"
    },

    profileId: {
      type: Number
    },

    returnSource: {
      type: String,
      enum: ["MFN", "FBA"]
    },

    reportType: {
      type: String,
      default: null
    },

    // =========================================================
    // ORDER DETAILS
    // =========================================================

    orderId: {
      type: String
    },

    orderItemId: {
      type: String
    },

    orderDate: {
      type: Date
    },

    returnRequestDate: {
      type: Date
    },

    returnRequestStatus: {
      type: String
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
      type: String
    },

    merchantSku: {
      type: String
    },

    fnsku: {
      type: String,
      default: null
    },

    returnReasonCode: {
      type: String
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
      type: String
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
      default: null
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

// 1️⃣ Primary grid listing, analytics & date-range filtering with index sort
returnSchema.index({ configId: 1, profileId: 1, returnRequestDate: -1, returnRequestStatus: 1 });

// 2️⃣ Fast order lookup for FC inventory reconciliation
returnSchema.index({ configId: 1, profileId: 1, orderId: 1 });

// 3️⃣ Order date drilldown filter
returnSchema.index({ configId: 1, profileId: 1, orderDate: -1 });

module.exports = mongoose.model("return", returnSchema);
