const mongoose = require("mongoose");

/**
 * Whether an organization's AI requests use its own provider API keys (aiProviderKey) instead of
 * the platform's keys and the AI credit wallet.
 * allowWalletFallback: when the organization's key for a provider is missing or fails, use the
 * platform's key and charge wallet credits. Off by default: nothing is charged without consent.
 */
const aiKeySettingSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    usePersonalKeys: { type: Boolean, default: false },
    allowWalletFallback: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, versionKey: false }
);

aiKeySettingSchema.index({ organizationId: 1 }, { unique: true });

module.exports = mongoose.model("aiKeySetting", aiKeySettingSchema);
