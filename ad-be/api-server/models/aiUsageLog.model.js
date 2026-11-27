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
    keySource: { type: String, enum: ["PLATFORM", "PERSONAL"], default: "PLATFORM" },
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
    meteredCredits: { type: Number }, // usage priced before the hold cap
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    images: { type: Number, default: 0 }, // generated images (priced per image)
    models: { type: [String], default: [] },
    calls: { type: [callSchema], default: [] },
    enforced: { type: Boolean, default: true }, // false when credit enforcement was switched off
    // Whose API key ran the request: the platform's (charged to the wallet), the organization's own
    // (PERSONAL, never charged) or both (MIXED: own key for some calls, wallet fallback for others)
    keySource: { type: String, enum: ["PLATFORM", "PERSONAL", "MIXED"], default: "PLATFORM" },
    // Held for background work that finishes after the request (A+ image batch jobs); released after 72 h if never settled
    deferred: { type: Boolean, default: false },
    settledAt: { type: Date, default: null },
    // Set while the retention job combines this log into a daily total; the log is deleted once
    // the total is saved and checked. A batch left behind by a crash is picked up on the next run.
    aggregationBatch: { type: String, default: null },
    aggregationClaimedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

aiUsageLogSchema.index({ requestId: 1 }, { unique: true });
aiUsageLogSchema.index({ organizationId: 1, createdAt: -1 });
aiUsageLogSchema.index({ status: 1, createdAt: 1 }); // stale-hold sweep
aiUsageLogSchema.index({ createdAt: -1, feature: 1 }); // Super Admin overview
// Old logs are not expired by a TTL index: the retention job (Super Admin setting) combines them
// into daily totals first, and a retention of 0 keeps every log.
aiUsageLogSchema.index({ aggregationBatch: 1 }, { partialFilterExpression: { aggregationBatch: { $type: "string" } } });

module.exports = mongoose.model("aiUsageLog", aiUsageLogSchema);
