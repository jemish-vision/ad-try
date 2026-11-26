const mongoose = require("mongoose");

/**
 * One AI credit purchase attempt (a Stripe Checkout session).
 * PENDING  — checkout opened, or paid with a method that confirms later (e.g. bank debit)
 * PAID     — payment confirmed and the credits were added to the wallet (creditedAt)
 * FAILED   — the payment failed (e.g. delayed bank payment rejected)
 * CANCELLED— the buyer cancelled, or the checkout expired unpaid
 * Credits are added at most once per payment (ledger dedupeKey "purchase:<paymentId>").
 */
const aiCreditPaymentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "aiCreditPackage", required: true },
    packageName: { type: String, trim: true },
    credits: { type: Number, required: true },
    amount: { type: Number, required: true }, // major units, e.g. 19.99
    currency: { type: String, uppercase: true, required: true },
    country: { type: String, default: null },
    regionId: { type: mongoose.Schema.Types.ObjectId, ref: "pricingRegion", default: null },
    status: { type: String, enum: ["PENDING", "PAID", "FAILED", "CANCELLED"], default: "PENDING" },
    stripeSessionId: { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },
    failureReason: { type: String, default: null },
    paidAt: { type: Date, default: null },
    creditedAt: { type: Date, default: null },
    // What happened, in order (checkout created, webhook events, verification)
    events: { type: [{ type: { type: String }, at: Date, source: String, detail: String, _id: false }], default: [] },
  },
  { timestamps: true, versionKey: false }
);

aiCreditPaymentSchema.index({ stripeSessionId: 1 }, { unique: true, partialFilterExpression: { stripeSessionId: { $type: "string" } } });
aiCreditPaymentSchema.index({ organizationId: 1, createdAt: -1 });
aiCreditPaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("aiCreditPayment", aiCreditPaymentSchema);
