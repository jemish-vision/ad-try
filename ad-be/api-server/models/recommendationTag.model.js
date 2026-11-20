const mongoose = require("mongoose");

/**
 * Tags for recommendation configurations, managed per ORGANIZATION (Recommendation → Tag Management
 * tab). Every profile / Amazon account of the organization uses the same tags; configurations only
 * select existing tags. Tag names are unique within an organization (case-insensitive).
 *
 * `configId` is only set on tags created before tags became organization-wide; those are moved to
 * their organization automatically (helpers/recommendationTags.helper.js → migrateLegacyTags).
 */
const recommendationTagSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "organization", default: null },
    configId: { type: mongoose.Schema.Types.ObjectId, ref: "config", default: null }, // legacy only
    name: { type: String, trim: true, required: true, maxlength: 40 },
    // lower-cased name: "Brand" and "brand" are the same tag
    nameKey: { type: String, trim: true, required: true },
    color: { type: String, trim: true, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  },
  { timestamps: true }
);

// One tag per name per organization (legacy tags without an organization are not constrained).
recommendationTagSchema.index(
  { organizationId: 1, nameKey: 1 },
  { unique: true, name: "org_tag_name_unique", partialFilterExpression: { organizationId: { $type: "objectId" } } }
);
recommendationTagSchema.index({ configId: 1 });

module.exports = mongoose.model("recommendationTag", recommendationTagSchema);
