const mongoose = require("mongoose");
const recommendationTagSchema = require("../models/recommendationTag.model");
const recommendationRuleSchema = require("../models/recomandationRules.model");
const {
  normalizeTagName,
  colorForTag,
  resolveOrganizationId,
  prepareOrganization,
  createTag,
} = require("../helpers/recommendationTags.helper");
const { recommendation_logs } = require("../../winston/recommendation/logger");

const fail = (res, message) => res.status(203).send({ isSuccess: false, message });
const orgOf = (req) => resolveOrganizationId({ configId: req?.config?.configId, organizationId: req?.organizationId });

/**
 * All tags of the organization, A–Z, with usage:
 *   ruleCount      — configurations of the given profile using the tag (Recommendations filter)
 *   totalRuleCount — configurations across the whole organization (Tag Management tab)
 */
exports.getTags = async (req, res) => {
  try {
    const organizationId = await orgOf(req);
    if (!organizationId) return fail(res, "Organization not found");
    await prepareOrganization(organizationId);

    const tags = await recommendationTagSchema.find({ organizationId }).sort({ nameKey: 1 }).select("name color createdAt").lean();
    const tagIds = tags.map((t) => t._id);

    const usage = async (extraMatch) => {
      if (!tagIds.length) return new Map();
      const rows = await recommendationRuleSchema.aggregate([
        { $match: { tagIds: { $in: tagIds }, ...extraMatch } },
        { $unwind: "$tagIds" },
        { $match: { tagIds: { $in: tagIds } } },
        { $group: { _id: "$tagIds", count: { $sum: 1 } } },
      ]);
      return new Map(rows.map((r) => [String(r._id), r.count]));
    };

    const profileId = req?.body?.profileId;
    const configId = req?.config?.configId;
    const [profileCounts, totals] = await Promise.all([
      profileId && configId
        ? usage({ configId: new mongoose.Types.ObjectId(String(configId)), profileId: Number(profileId) || profileId })
        : new Map(),
      usage({}),
    ]);

    return res.status(200).send({
      isSuccess: true,
      data: tags.map((t) => ({
        _id: t._id,
        name: t.name,
        color: t.color || colorForTag(t.name),
        createdAt: t.createdAt,
        ruleCount: profileCounts.get(String(t._id)) || 0,
        totalRuleCount: totals.get(String(t._id)) || 0,
      })),
    });
  } catch (error) {
    recommendation_logs({ message: `[getTags Error] ${error?.message || error}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};

/** Creates a tag in the organization (Tag Management tab). Names are unique per organization. */
exports.createTag = async (req, res) => {
  try {
    const organizationId = await orgOf(req);
    if (!organizationId) return fail(res, "Organization not found");
    const name = normalizeTagName(req?.body?.name);
    if (!name) return fail(res, "Tag name is required");
    const tag = await createTag(organizationId, name, req?.user?._id);
    return res.status(200).send({
      isSuccess: true,
      message: "Tag created",
      data: { _id: tag._id, name: tag.name, color: tag.color || colorForTag(tag.name), ruleCount: 0, totalRuleCount: 0 },
    });
  } catch (error) {
    if (error?.code === "DUPLICATE" || error?.code === "INVALID") return fail(res, error.message);
    recommendation_logs({ message: `[createTag Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};

/** Renames a tag. Configurations keep it (they store its id), so the new name shows everywhere. */
exports.renameTag = async (req, res) => {
  try {
    const organizationId = await orgOf(req);
    const { tagId } = req?.body || {};
    if (!organizationId) return fail(res, "Organization not found");
    if (!mongoose.Types.ObjectId.isValid(tagId)) return fail(res, "Invalid tag");
    const name = normalizeTagName(req?.body?.name);
    if (!name) return fail(res, "Tag name is required");
    await prepareOrganization(organizationId);

    const nameKey = name.toLowerCase();
    const clash = await recommendationTagSchema.findOne({ organizationId, nameKey, _id: { $ne: tagId } }).select("_id").lean();
    if (clash) return fail(res, "A tag with this name already exists");

    // Color follows the name, so a renamed tag may get a new color.
    const tag = await recommendationTagSchema
      .findOneAndUpdate({ _id: tagId, organizationId }, { $set: { name, nameKey, color: colorForTag(name) } }, { new: true })
      .lean();
    if (!tag) return fail(res, "Tag not found");
    return res.status(200).send({ isSuccess: true, message: "Tag renamed", data: { _id: tag._id, name: tag.name, color: tag.color } });
  } catch (error) {
    if (error?.code === 11000) return fail(res, "A tag with this name already exists");
    recommendation_logs({ message: `[renameTag Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};

/** Deletes a tag and removes it from every configuration in the organization. */
exports.deleteTag = async (req, res) => {
  try {
    const organizationId = await orgOf(req);
    const { tagId } = req?.body || {};
    if (!organizationId) return fail(res, "Organization not found");
    if (!mongoose.Types.ObjectId.isValid(tagId)) return fail(res, "Invalid tag");
    const tagObjectId = new mongoose.Types.ObjectId(String(tagId));

    const deleted = await recommendationTagSchema.findOneAndDelete({ _id: tagObjectId, organizationId }).lean();
    if (!deleted) return fail(res, "Tag not found");
    // Tag ids are unique, so this only touches configurations of this organization.
    const result = await recommendationRuleSchema.updateMany({ tagIds: tagObjectId }, { $pull: { tagIds: tagObjectId } });
    return res.status(200).send({ isSuccess: true, message: "Tag deleted", data: { removedFromRules: result?.modifiedCount || 0 } });
  } catch (error) {
    recommendation_logs({ message: `[deleteTag Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};
