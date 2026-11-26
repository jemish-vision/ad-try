const mongoose = require("mongoose");

/**
 * One AI credit wallet per organization. All team members draw from it.
 * Spendable = monthly credits left (allocated - used) + purchased credits left - reserved (stored as `balance`).
 *  - allocated: monthly allowance granted at the last reset, plus admin adjustments this period
 *  - used: monthly credits charged for finished AI requests this period (purchased usage: purchasedUsed)
 *  - reserved: credits held for AI requests that are still running
 */
const aiCreditWalletSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true }, // exclusive: the next reset
    monthlyLimit: { type: Number, default: 0 }, // allowance that was granted at the last reset
    limitSource: { type: String, enum: ["PLAN", "OVERRIDE", "DEFAULT"], default: "DEFAULT" },
    // Super Admin per-organization allowance; null = use the plan (or the global default)
    monthlyLimitOverride: { type: Number, default: null },
    allocated: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    // Total spendable = (allocated - used) + purchasedBalance - reserved, kept in step by every update
    balance: { type: Number, default: 0 },
    // Purchased credits left. They never expire and survive the monthly reset; spent after the monthly credits.
    purchasedBalance: { type: Number, default: 0 },
    purchasedUsed: { type: Number, default: 0 }, // purchased credits spent this period (reporting)
    lifetimePurchased: { type: Number, default: 0 },
    // Lifetime totals, for reporting
    lifetimeUsed: { type: Number, default: 0 },
    lifetimeInputTokens: { type: Number, default: 0 },
    lifetimeOutputTokens: { type: Number, default: 0 },
    lastResetAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

aiCreditWalletSchema.index({ organizationId: 1 }, { unique: true });
aiCreditWalletSchema.index({ periodEnd: 1 }); // monthly reset sweep

module.exports = mongoose.model("aiCreditWallet", aiCreditWalletSchema);
