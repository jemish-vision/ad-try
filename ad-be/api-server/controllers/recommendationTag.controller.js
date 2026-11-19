const mongoose = require("mongoose");
const recommendationTagSchema = require("../models/recommendationTag.model");
const recommendationRuleSchema = require("../models/recomandationRules.model");
const { findOrCreateTag, normalizeTagName, colorForTag } = require("../helpers/recommendationTags.helper");
const { recommendation_logs } = require("../../winston/recommendation/logger");

const fail = (res, message) => res.status(203).send({ isSuccess: false, message });

/**
 * All tags of the account, A–Z. With profileId, each tag also gets `ruleCount` (rules of that
 * profile using it), so the Recommendations filter can show only tags that are in use.
 */
exports.getTags = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    if (!configId) return fail(res, "Account not found");
    const tags = await recommendationTagSchema.find({ configId }).sort({ nameKey: 1 }).select("name color").lean();

    const profileId = req?.body?.profileId;
    let counts = new Map();
    if (profileId) {
      const rows = await recommendationRuleSchema.aggregate([
        { $match: { configId: new mongoose.Types.ObjectId(String(configId)), profileId: Number(profileId) || profileId, tagIds: { $exists: true, $ne: [] } } },
        { $unwind: "$tagIds" },
        { $group: { _id: "$tagIds", count: { $sum: 1 } } },
      ]);
      counts = new Map(rows.map((r) => [String(r._id), r.count]));
    }

    // Usage across all profiles of the account (shown before renaming / deleting a tag)
    const totalRows = await recommendationRuleSchema.aggregate([
      { $match: { configId: new mongoose.Types.ObjectId(String(configId)), tagIds: { $exists: true, $ne: [] } } },
      { $unwind: "$tagIds" },
      { $group: { _id: "$tagIds", count: { $sum: 1 } } },
    ]);
    const totals = new Map(totalRows.map((r) => [String(r._id), r.count]));

    return res.status(200).send({
      isSuccess: true,
      data: tags.map((t) => ({
        _id: t._id,
        name: t.name,
        color: t.color || colorForTag(t.name),
        ruleCount: counts.get(String(t._id)) || 0,
        totalRuleCount: totals.get(String(t._id)) || 0,
      })),
    });
  } catch (error) {
    recommendation_logs({ message: `[getTags Error] ${error?.message || error}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};

/** Creates a tag (or returns the existing one with the same name, case-insensitive). */
exports.createTag = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    if (!configId) return fail(res, "Account not found");
    const name = normalizeTagName(req?.body?.name);
    if (!name) return fail(res, "Tag name is required");
    const tag = await findOrCreateTag(configId, name, req?.user?._id);
    return res.status(200).send({
      isSuccess: true,
      message: "Tag saved",
      data: { _id: tag._id, name: tag.name, color: tag.color || colorForTag(tag.name) },
    });
  } catch (error) {
    recommendation_logs({ message: `[createTag Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};

/** Renames a tag. Rules keep their tag (they store its id). Fails if another tag already has the name. */
exports.renameTag = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { tagId } = req?.body || {};
    if (!configId) return fail(res, "Account not found");
    if (!mongoose.Types.ObjectId.isValid(tagId)) return fail(res, "Invalid tag");
    const name = normalizeTagName(req?.body?.name);
    if (!name) return fail(res, "Tag name is required");

    const nameKey = name.toLowerCase();
    const clash = await recommendationTagSchema.findOne({ configId, nameKey, _id: { $ne: tagId } }).select("_id").lean();
    if (clash) return fail(res, "A tag with this name already exists");

    // Color follows the name, so a renamed tag may get a new color.
    const tag = await recommendationTagSchema
      .findOneAndUpdate({ _id: tagId, configId }, { $set: { name, nameKey, color: colorForTag(name) } }, { new: true })
      .lean();
    if (!tag) return fail(res, "Tag not found");
    return res.status(200).send({ isSuccess: true, message: "Tag renamed", data: { _id: tag._id, name: tag.name, color: tag.color } });
  } catch (error) {
    if (error?.code === 11000) return fail(res, "A tag with this name already exists");
    recommendation_logs({ message: `[renameTag Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};

/** Deletes a tag and removes it from every recommendation configuration of the account. */
exports.deleteTag = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const { tagId } = req?.body || {};
    if (!configId) return fail(res, "Account not found");
    if (!mongoose.Types.ObjectId.isValid(tagId)) return fail(res, "Invalid tag");
    const tagObjectId = new mongoose.Types.ObjectId(String(tagId));

    const deleted = await recommendationTagSchema.findOneAndDelete({ _id: tagObjectId, configId }).lean();
    if (!deleted) return fail(res, "Tag not found");
    const result = await recommendationRuleSchema.updateMany({ configId, tagIds: tagObjectId }, { $pull: { tagIds: tagObjectId } });
    return res.status(200).send({ isSuccess: true, message: "Tag deleted", data: { removedFromRules: result?.modifiedCount || 0 } });
  } catch (error) {
    recommendation_logs({ message: `[deleteTag Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return fail(res, "Something went wrong, please try again!");
  }
};
