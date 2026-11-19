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

    return res.status(200).send({
      isSuccess: true,
      data: tags.map((t) => ({ _id: t._id, name: t.name, color: t.color || colorForTag(t.name), ruleCount: counts.get(String(t._id)) || 0 })),
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
