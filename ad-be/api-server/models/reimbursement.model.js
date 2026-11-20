const mongoose = require("mongoose");

const reimbursementSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config"
    },

    profileId: {
      type: Number,
      trim: true
    },

    reimbursementId: {
      type: String
    },

    caseId: {
      type: String,
      default: null
    },

    amazonOrderId: {
      type: String,
      default: null
    },

    approvalDate: {
      type: Date
    },

    reason: {
      type: String
    },

    sku: {
      type: String
    },

    fnsku: {
      type: String
    },

    asin: {
      type: String
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

// 1. Unique identity and deduplication index (serves report stream upserts and tenant prefix lookups)
reimbursementSchema.index(
  {
    configId: 1,
    profileId: 1,
    reimbursementId: 1
  },
  {
    unique: true
  }
);

// 2. Primary listing & date-range query index (serves getReimbursement pagination and pre-sorted approvalDate)
reimbursementSchema.index({
  configId: 1,
  profileId: 1,
  approvalDate: -1
});

// 3. Order & SKU lookup index (serves profitAnalysis lookups mapped by orderId and orderId+sku)
reimbursementSchema.index({
  configId: 1,
  profileId: 1,
  amazonOrderId: 1,
  sku: 1
});

// 4. SKU discrepancy check index (serves cronReminderForReimbursement)
reimbursementSchema.index({
  configId: 1,
  profileId: 1,
  sku: 1
});

module.exports = new mongoose.model("reimbursement", reimbursementSchema);