const mongoose = require("mongoose");

/**
 * Tags for recommendation configurations (rules). Created from the Recommendation Configuration
 * form; shown (read-only) and filterable in the Recommendations list. Scoped to the Amazon Ads
 * account (configId), so every profile of the account shares the same tag list.
 */
const recommendationTagSchema = new mongoose.Schema(
  {
    configId: { type: mongoose.Schema.Types.ObjectId, ref: "config", required: true },
    name: { type: String, trim: true, required: true, maxlength: 40 },
    // lower-cased name: one tag per name per account ("Brand" and "brand" are the same tag)
    nameKey: { type: String, trim: true, required: true },
    color: { type: String, trim: true, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  },
  { timestamps: true }
);

recommendationTagSchema.index({ configId: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model("recommendationTag", recommendationTagSchema);
