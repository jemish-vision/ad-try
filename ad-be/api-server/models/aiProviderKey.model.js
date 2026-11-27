const mongoose = require("mongoose");

/**
 * An organization's own API key for one AI provider. When the organization turns its own keys on
 * (aiKeySetting), AI requests use this key and no AI wallet credits are charged.
 * The key itself is only stored encrypted (services/aiKeys/aiKeyCrypto) and is never sent back to
 * the browser: only keyHint (e.g. "sk-ant-…a1B2") is shown.
 */
const aiProviderKeySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    provider: { type: String, enum: ["anthropic", "openai", "gemini"], required: true },
    encryptedKey: { type: String, required: true, select: false },
    keyHint: { type: String, required: true },
    // VALID: the provider accepted it. INVALID: rejected (revoked, wrong or expired).
    // RATE_LIMITED / QUOTA_EXCEEDED: accepted but out of requests or billing quota at the provider.
    // UNVERIFIED: the provider couldn't be reached when it was checked.
    status: { type: String, enum: ["VALID", "INVALID", "RATE_LIMITED", "QUOTA_EXCEEDED", "UNVERIFIED"], default: "UNVERIFIED" },
    statusMessage: { type: String, default: null },
    lastValidatedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, versionKey: false }
);

aiProviderKeySchema.index({ organizationId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model("aiProviderKey", aiProviderKeySchema);
