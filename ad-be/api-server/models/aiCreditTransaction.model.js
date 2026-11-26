const mongoose = require("mongoose");

/**
 * Credit ledger: every change to a wallet's balance.
 * ALLOCATION — monthly allowance granted; RESET — previous period closed;
 * DEDUCTION — an AI request was charged; ADJUSTMENT — Super Admin added or removed credits;
 * PURCHASE — credits bought online (paymentId links the payment).
 * `dedupeKey` makes each event unique, so a retried reset or a repeated charge can't be written twice.
 */
const aiCreditTransactionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: "aiCreditWallet", required: true },
    type: { type: String, enum: ["ALLOCATION", "RESET", "DEDUCTION", "ADJUSTMENT", "PURCHASE"], required: true },
    credits: { type: Number, required: true }, // signed: + adds to the balance, - removes
    balanceAfter: { type: Number, default: null },
    periodStart: { type: Date, default: null },
    feature: { type: String, default: null },
    requestId: { type: String, default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "aiCreditPayment", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null }, // who used the AI / who made the adjustment
    note: { type: String, trim: true, default: null },
    dedupeKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

aiCreditTransactionSchema.index({ dedupeKey: 1 }, { unique: true });
aiCreditTransactionSchema.index({ organizationId: 1, createdAt: -1 });
aiCreditTransactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("aiCreditTransaction", aiCreditTransactionSchema);
