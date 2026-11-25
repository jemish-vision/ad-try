const mongoose = require("mongoose");

/**
 * One AI credit wallet per organization. All team members draw from it.
 * Balance for the current period = allocated - used - reserved (stored as `balance`).
 *  - allocated: monthly allowance granted at the last reset, plus admin adjustments this period
 *  - used: credits charged for finished AI requests this period
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
    balance: { type: Number, default: 0 }, // allocated - used - reserved, kept in step by every update
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
