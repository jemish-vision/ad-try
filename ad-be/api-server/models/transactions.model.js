const mongoose = require("mongoose");

const financialTransactionSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
    },
    profileId: {
      type: Number,
      index: true
    },

    // ── Root Level Order Info ─────────────────────────────────
    amazonOrderId: {
      type: String,
      trim: true,
      index: true,
    },
    sellerOrderId: {
      type: String,
      trim: true,
    },
    marketplaceName: {
      type: String,
      trim: true,
    },
    postedDate: {
      type: Date,
    },
    reportDate: {
      type: String,
      trim: true,
    },
    transactionType: {
      type: String,
      trim: true,
      // "Order Payment", "Service Fees", "Refund", etc.
    },
    transactionStatus: {
      type: String,
      trim: true,
      // "Released", "Deferred"
    },

    // ── Item Info (from ShipmentItemList) ─────────────────────
    sellerSKU: {
      type: String,
      trim: true,
    },
    orderItemId: {
      type: String,
      trim: true,
    },
    quantityShipped: {
      type: Number,
      default: 0,
    },

    // ── Charges (from ItemChargeList) ─────────────────────────
    principal: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    shippingCharge: {
      type: Number,
      default: 0,
    },
    shippingTax: {
      type: Number,
      default: 0,
    },
    giftWrap: {
      type: Number,
      default: 0,
    },
    giftWrapTax: {
      type: Number,
      default: 0,
    },
    tcsIGST: {
      type: Number,
      default: 0,
    },

    // Total product charges = principal + tax + shippingCharge + shippingTax
    totalProductCharges: {
      type: Number,
      default: 0,
    },

    // ── Promotions (from PromotionList) ───────────────────────
    shippingPromotion: {
      type: Number,
      default: 0,
    },
    shippingTaxPromotion: {
      type: Number,
      default: 0,
    },

    // Total promotional rebates = sum of all PromotionAmount
    totalPromotionalRebates: {
      type: Number,
      default: 0,
    },

    // ── Fees (from ItemFeeList) ───────────────────────────────
    fbaPerUnitFulfillmentFee: { // FBA Pick & Pack Fee:
      type: Number,
      default: 0,
    },
    fbaWeightBasedFee: {
      type: Number,
      default: 0,
    },
    commission: {
      type: Number,
      default: 0,
    },
    fixedClosingFee: {
      type: Number,
      default: 0,
    },
    variableClosingFee: {
      type: Number,
      default: 0,
    },
    technologyFee: {
      type: Number,
      default: 0,
    },
    shippingChargeback: {
      type: Number,
      default: 0,
    },
    giftwrapChargeback: {
      type: Number,
      default: 0,
    },

    // Total Amazon fees = sum of all ItemFeeList amounts
    totalAmazonFees: {
      type: Number,
      default: 0,
    },

    // ── Tax Withheld (from ItemTaxWithheldList) ───────────────
    itemTDS: {
      type: Number,
      default: 0,
    },

    // ── Service Fee Events ────────────────────────────────────
    mfnPostageFee: {
      type: Number,
      default: 0,
    },

    // ── Ads (ProductAdsPaymentEventList) ─────────────────────
    adSpendBase: {
      type: Number,
      default: 0,
    },
    adSpendTax: {
      type: Number,
      default: 0,
    },
    adSpendTotal: {
      type: Number,
      default: 0,
    },
    adInvoiceId: {
      type: String,
      trim: true,
    },

    // ── SAFET Reimbursement Events ──────────────────────────
    safetClaimId: {
      type: String,
      trim: true,
    },
    reasonCode: {
      type: String,
      trim: true,
    },
    reimbursedAmount: {
      type: Number,
      default: 0,
    },
    safetItems: [
      {
        productDescription: { type: String, trim: true },
        quantity: { type: Number, default: 0 },
        _id: false,
      },
    ],

    // ── Other & Final Total (matches UI columns) ──────────────
    other: {
      type: Number,
      default: 0,
      // itemTDS + mfnPostageFee + tcsIGST + adSpendTotal
    },
    total: {
      type: Number,
      default: 0,
      // totalProductCharges + totalPromotionalRebates + totalAmazonFees + other
    },

    currencyCode: {
      type: String,
      default: "INR",
      trim: true,
    },

    // ── Adjustment Events ─────────────────────────────────────
    adjustmentType: {
      type: String,
      trim: true,
    },
    adjustmentAmount: {
      type: Number,
      default: 0,
    },

    // ── Raw backup (optional but recommended) ─────────────────
    rawShipmentEvent: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

financialTransactionSchema.index({ configId: 1, postedDate: -1 });
financialTransactionSchema.index({ amazonOrderId: 1, configId: 1 });
financialTransactionSchema.index({ transactionStatus: 1 });
financialTransactionSchema.index({ sellerSKU: 1 });

financialTransactionSchema.index({ amazonOrderId: 1, configId: 1, profileId: 1, transactionType: 1 });

module.exports = mongoose.model("transactions", financialTransactionSchema);