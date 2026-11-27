const mongoose = require("mongoose");

/**
 * Whether an organization's AI requests use its own provider API keys (aiProviderKey) instead of
 * the platform's keys and the AI credit wallet. Providers without a saved key keep using the
 * platform's keys and AI credits.
 */
const aiKeySettingSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", required: true },
    usePersonalKeys: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, versionKey: false }
);

aiKeySettingSchema.index({ organizationId: 1 }, { unique: true });

module.exports = mongoose.model("aiKeySetting", aiKeySettingSchema);
