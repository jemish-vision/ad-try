const mongoose = require("mongoose");

/**
 * Daily total of AI usage, kept after the request-by-request logs (aiUsageLog) pass the retention
 * period set by Super Admin. One record per organization, UTC day, user, feature, AI model(s), key
 * source and outcome (charged / not charged), so the usage charts, feature totals and filters stay exact.
 * Wallet transactions (aiCreditTransaction) are separate and never combined or deleted.
 *
 * appliedBatches lists the retention batches already added in: adding the same batch twice is
 * refused, so a retried or overlapping run never counts a request twice.
 */
const modelTotalSchema = new mongoose.Schema(
  {
    model: { type: String },
    calls: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
  },
  { _id: false }
);

const aiUsageDailySummarySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    day: { type: Date, required: true }, // UTC midnight
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    feature: { type: String, required: true },
    modelKey: { type: String, default: "" }, // models used, sorted and joined (", "); "" when none
    models: { type: [String], default: [] },
    status: { type: String, enum: ["SETTLED", "RELEASED", "EXPIRED"], required: true },
    // Whose API key ran the requests: the platform's (wallet), the organization's own, or both
    keySource: { type: String, enum: ["PLATFORM", "PERSONAL", "MIXED"], default: "PLATFORM" },
    requests: { type: Number, default: 0 },
    credits: { type: Number, default: 0 }, // deducted from the wallet
    meteredCredits: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    backgroundRequests: { type: Number, default: 0 },
    byModel: { type: [modelTotalSchema], default: [] }, // per AI model call totals
    firstRequestAt: { type: Date, default: null },
    lastRequestAt: { type: Date, default: null },
    appliedBatches: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
);

aiUsageDailySummarySchema.index({ organizationId: 1, day: 1, userId: 1, feature: 1, modelKey: 1, status: 1, keySource: 1 }, { unique: true });
aiUsageDailySummarySchema.index({ organizationId: 1, day: -1 });
aiUsageDailySummarySchema.index({ day: -1, feature: 1 }); // Super Admin overview

module.exports = mongoose.model("aiUsageDailySummary", aiUsageDailySummarySchema);
