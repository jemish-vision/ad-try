const mongoose = require("mongoose");

/**
 * One row per metered AI request (an AI Assistant message, a listing optimization, ...).
 * Starts RESERVED when credits are held; ends SETTLED (charged), RELEASED (nothing charged:
 * failed or served from cache) or EXPIRED (the process died mid-request; the hold was returned).
 * The status change is a single atomic update, so a request is charged at most once.
 */
const callSchema = new mongoose.Schema(
  {
    provider: { type: String },
    model: { type: String },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadInputTokens: { type: Number, default: 0 },
    cacheCreationInputTokens: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
  },
  { _id: false }
);

const aiUsageLogSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: "aiCreditWallet", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    feature: { type: String, required: true },
    status: { type: String, enum: ["RESERVED", "SETTLED", "RELEASED", "EXPIRED"], default: "RESERVED" },
    failureReason: { type: String, default: null },
    reservedCredits: { type: Number, default: 0 },
    credits: { type: Number, default: 0 }, // charged
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    images: { type: Number, default: 0 }, // generated images (priced per image)
    models: { type: [String], default: [] },
    calls: { type: [callSchema], default: [] },
    enforced: { type: Boolean, default: true }, // false when credit enforcement was switched off
    // Held for background work that finishes after the request (A+ image batch jobs); released after 72 h if never settled
    deferred: { type: Boolean, default: false },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

aiUsageLogSchema.index({ requestId: 1 }, { unique: true });
aiUsageLogSchema.index({ organizationId: 1, createdAt: -1 });
aiUsageLogSchema.index({ status: 1, createdAt: 1 }); // stale-hold sweep
aiUsageLogSchema.index({ createdAt: -1, feature: 1 }); // Super Admin overview
aiUsageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 }); // keep ~13 months

module.exports = mongoose.model("aiUsageLog", aiUsageLogSchema);
