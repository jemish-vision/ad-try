const mongoose = require("mongoose");

const reimbursementSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      index: true
    },

    profileId: {
      type: Number,
      trim: true,
      index: true
    },

    reimbursementId: {
      type: String,
      index: true
    },

    caseId: {
      type: String,
      default: null
    },

    amazonOrderId: {
      type: String,
      default: null,
      index: true
    },

    approvalDate: {
      type: Date,
      index: true
    },

    reason: {
      type: String,
      index: true
    },

    sku: {
      type: String,
      index: true
    },

    fnsku: {
      type: String,
      index: true
    },

    asin: {
      type: String,
      index: true
    },

    productName: {
      type: String
    },

    condition: {
      type: String
    },

    currencyUnit: {
      type: String
    },

    amountPerUnit: {
      type: Number,
      default: 0
    },

    amountTotal: {
      type: Number,
      default: 0
    },

    quantityReimbursedCash: {
      type: Number,
      default: 0
    },

    quantityReimbursedInventory: {
      type: Number,
      default: 0
    },

    quantityReimbursedTotal: {
      type: Number,
      default: 0
    },

    originalReimbursementId: {
      type: String,
      default: null
    },

    originalReimbursementType: {
      type: String,
      default: null
    },

    reimbursementType: {
      type: String,
      enum: [
        "CUSTOMER_RETURN",
        "WAREHOUSE_DAMAGE",
        "LOST_INBOUND",
        "LOST_OUTBOUND",
        "UNKNOWN"
      ],
      default: "UNKNOWN"
    },

    reimbursementStatus: {
      type: String,
      enum: [
        "REIMBURSED",
        "PARTIALLY_REIMBURSED",
        "PENDING"
      ],
      default: "REIMBURSED"
    }
  },
  { timestamps: true }
);

reimbursementSchema.index({
  configId: 1,
  profileId: 1,
  reimbursementId: 1
}, {
  unique: true
});


// --- Performance Indexing ---
reimbursementSchema.index({configId:1,profileId:1,sku:1});

reimbursementSchema.index({ amazonOrderId: 1, configId: 1, profileId: 1 });

module.exports = new mongoose.model("reimbursement", reimbursementSchema);