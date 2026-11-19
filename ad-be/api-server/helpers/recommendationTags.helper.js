/**
 * Recommendation configuration tags: find-or-create by name, validate tag ids, and attach
 * { _id, name, color } to rules for the list / modal views.
 */
const mongoose = require("mongoose");
const recommendationTagSchema = require("../models/recommendationTag.model");

const MAX_TAG_LENGTH = 40;
const MAX_TAGS_PER_RULE = 20;
// Distinct, readable on light and dark backgrounds. A tag keeps the color picked from its name.
const TAG_COLORS = ["#2563EB", "#0891B2", "#059669", "#65A30D", "#D97706", "#DC2626", "#DB2777", "#7C3AED", "#4F46E5", "#0D9488"];

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

/** "  Brand   Defense " → "Brand Defense" (max 40 chars). Empty → "". */
function normalizeTagName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

function colorForTag(name) {
  const key = normalizeTagName(name).toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

// autoIndex is off for the app connection: create the unique (configId, nameKey) index once, lazily.
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) indexesReady = recommendationTagSchema.createIndexes().catch(() => { indexesReady = null; });
  return indexesReady;
}

/** Returns the account's tag with this name, creating it when it doesn't exist. */
async function findOrCreateTag(configId, name, userId = null) {
  const clean = normalizeTagName(name);
  if (!clean) throw new Error("Tag name is required");
  await ensureIndexes();
  const filter = { configId: toObjectId(configId), nameKey: clean.toLowerCase() };
  try {
    return await recommendationTagSchema
      .findOneAndUpdate(
        filter,
        { $setOnInsert: { name: clean, color: colorForTag(clean), ...(userId && { createdBy: userId }) } },
        { upsert: true, new: true }
      )
      .lean();
  } catch (error) {
    if (error?.code === 11000) return recommendationTagSchema.findOne(filter).lean(); // created concurrently
    throw error;
  }
}

/** Keeps only valid, de-duplicated ids of tags that belong to this account (max 20). */
async function sanitizeTagIds(configId, tagIds) {
  if (!Array.isArray(tagIds)) return [];
  const unique = [...new Set(tagIds.map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (!unique.length) return [];
  const found = await recommendationTagSchema
    .find({ configId: toObjectId(configId), _id: { $in: unique.map(toObjectId) } })
    .select("_id")
    .lean();
  const ok = new Set(found.map((t) => String(t._id)));
  return unique.filter((id) => ok.has(id)).slice(0, MAX_TAGS_PER_RULE).map(toObjectId);
}

/** Adds `tags: [{ _id, name, color }]` (in the rule's order) to each rule. Missing tags are skipped. */
async function attachTags(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const ids = [...new Set(list.flatMap((r) => (r?.tagIds || []).map(String)))];
  if (!ids.length) return list.map((r) => ({ ...r, tags: [] }));
  const tags = await recommendationTagSchema
    .find({ _id: { $in: ids.map(toObjectId) } })
    .select("name color")
    .lean();
  const byId = new Map(tags.map((t) => [String(t._id), { _id: t._id, name: t.name, color: t.color || colorForTag(t.name) }]));
  return list.map((r) => ({ ...r, tags: (r?.tagIds || []).map((id) => byId.get(String(id))).filter(Boolean) }));
}

/** Tag ids for a rule copied to another account: same account → same ids; else matched/created by name. */
async function mapTagIdsToConfig(sourceConfigId, targetConfigId, tagIds, userId = null) {
  if (!Array.isArray(tagIds) || !tagIds.length) return [];
  if (String(sourceConfigId) === String(targetConfigId)) return tagIds.map(toObjectId);
  const sourceTags = await recommendationTagSchema.find({ _id: { $in: tagIds.map(toObjectId) } }).select("name").lean();
  const mapped = [];
  for (const tag of sourceTags) {
    const target = await findOrCreateTag(targetConfigId, tag.name, userId);
    if (target?._id) mapped.push(target._id);
  }
  return mapped;
}

module.exports = {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_RULE,
  TAG_COLORS,
  normalizeTagName,
  colorForTag,
  findOrCreateTag,
  sanitizeTagIds,
  attachTags,
  mapTagIdsToConfig,
};
