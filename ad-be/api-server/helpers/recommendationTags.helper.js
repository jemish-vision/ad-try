/**
 * Recommendation configuration tags — organization-wide.
 *
 * Tags belong to an organization (created / renamed / deleted in Recommendation → Tag Management).
 * A rule stores tag ids; every profile and Amazon account of the organization sees the same tags.
 * The organization of a request is taken from its Amazon account (config.organizationId), falling
 * back to the request's organization.
 */
const mongoose = require("mongoose");
const recommendationTagSchema = require("../models/recommendationTag.model");
const recommendationRuleSchema = require("../models/recomandationRules.model");
const configSchema = require("../models/config.model");

const MAX_TAG_LENGTH = 40;
const MAX_TAGS_PER_RULE = 20;
// Distinct, readable on light and dark backgrounds. A tag's color is picked from its name.
const TAG_COLORS = ["#2563EB", "#0891B2", "#059669", "#65A30D", "#D97706", "#DC2626", "#DB2777", "#7C3AED", "#4F46E5", "#0D9488"];
const LEGACY_INDEX = "configId_1_nameKey_1"; // unique per account (before tags became organization-wide)

const isId = (id) => id != null && mongoose.Types.ObjectId.isValid(String(id));
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

// autoIndex is off for the app connection: drop the old per-account unique index and create the
// per-organization one, once, lazily.
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = (async () => {
      try {
        await recommendationTagSchema.collection.dropIndex(LEGACY_INDEX);
      } catch (_) { /* not there */ }
      await recommendationTagSchema.createIndexes();
    })().catch(() => { indexesReady = null; });
  }
  return indexesReady;
}

// configId → organizationId (short cache: accounts rarely change organization)
const orgCache = new Map();
const ORG_CACHE_MS = 5 * 60 * 1000;
async function organizationOfConfig(configId) {
  if (!isId(configId)) return null;
  const key = String(configId);
  const hit = orgCache.get(key);
  if (hit && Date.now() - hit.at < ORG_CACHE_MS) return hit.orgId;
  const cfg = await configSchema.findById(key).select("organizationId").lean();
  const orgId = cfg?.organizationId ? String(cfg.organizationId) : null;
  orgCache.set(key, { orgId, at: Date.now() });
  return orgId;
}

/** Organization that owns the tags for this request: the Amazon account's organization, else the request's. */
async function resolveOrganizationId({ configId, organizationId } = {}) {
  const fromConfig = await organizationOfConfig(configId);
  if (fromConfig) return toObjectId(fromConfig);
  return isId(organizationId) ? toObjectId(organizationId) : null;
}

/**
 * Moves tags created when tags were per Amazon account (configId only) to their organization.
 * Same-name tags are merged: rules are re-pointed to the organization's tag and the duplicate removed.
 */
const migratedOrgs = new Set();
async function migrateLegacyTags(organizationId) {
  if (!organizationId || migratedOrgs.has(String(organizationId))) return;
  const configIds = (await configSchema.find({ organizationId }).select("_id").lean()).map((c) => c._id);
  if (configIds.length) {
    const legacy = await recommendationTagSchema
      .find({ configId: { $in: configIds }, $or: [{ organizationId: null }, { organizationId: { $exists: false } }] })
      .sort({ createdAt: 1 })
      .lean();
    for (const tag of legacy) {
      const keeper = await recommendationTagSchema.findOne({ organizationId, nameKey: tag.nameKey }).select("_id").lean();
      if (keeper) {
        await recommendationRuleSchema.updateMany({ tagIds: tag._id }, { $addToSet: { tagIds: keeper._id } });
        await recommendationRuleSchema.updateMany({ tagIds: tag._id }, { $pull: { tagIds: tag._id } });
        await recommendationTagSchema.deleteOne({ _id: tag._id });
      } else {
        await recommendationTagSchema.updateOne({ _id: tag._id }, { $set: { organizationId } });
      }
    }
  }
  migratedOrgs.add(String(organizationId));
}

/** Prepares the organization's tag collection (indexes + legacy migration). */
async function prepareOrganization(organizationId) {
  await ensureIndexes();
  await migrateLegacyTags(organizationId);
}

/** Creates a tag in the organization. Throws { code: "DUPLICATE" } when the name is taken. */
async function createTag(organizationId, name, userId = null) {
  const clean = normalizeTagName(name);
  if (!clean) throw Object.assign(new Error("Tag name is required"), { code: "INVALID" });
  await prepareOrganization(organizationId);
  const nameKey = clean.toLowerCase();
  if (await recommendationTagSchema.exists({ organizationId, nameKey })) {
    throw Object.assign(new Error("A tag with this name already exists"), { code: "DUPLICATE" });
  }
  try {
    const doc = await recommendationTagSchema.create({ organizationId, name: clean, nameKey, color: colorForTag(clean), ...(userId && { createdBy: userId }) });
    return doc.toObject();
  } catch (error) {
    if (error?.code === 11000) throw Object.assign(new Error("A tag with this name already exists"), { code: "DUPLICATE" });
    throw error;
  }
}

/** The organization's tag with this name, creating it if missing (used when copying rules across organizations). */
async function findOrCreateTag(organizationId, name, userId = null) {
  const clean = normalizeTagName(name);
  if (!clean) throw new Error("Tag name is required");
  await ensureIndexes();
  const filter = { organizationId: toObjectId(organizationId), nameKey: clean.toLowerCase() };
  try {
    return await recommendationTagSchema
      .findOneAndUpdate(filter, { $setOnInsert: { name: clean, color: colorForTag(clean), ...(userId && { createdBy: userId }) } }, { upsert: true, new: true })
      .lean();
  } catch (error) {
    if (error?.code === 11000) return recommendationTagSchema.findOne(filter).lean();
    throw error;
  }
}

/** Keeps only valid, de-duplicated ids of the organization's tags (max 20). Existing tags only. */
async function sanitizeTagIds(organizationId, tagIds) {
  if (!organizationId || !Array.isArray(tagIds)) return [];
  const unique = [...new Set(tagIds.map(String).filter(isId))];
  if (!unique.length) return [];
  await migrateLegacyTags(organizationId);
  const found = await recommendationTagSchema
    .find({ organizationId: toObjectId(organizationId), _id: { $in: unique.map(toObjectId) } })
    .select("_id")
    .lean();
  const ok = new Set(found.map((t) => String(t._id)));
  return unique.filter((id) => ok.has(id)).slice(0, MAX_TAGS_PER_RULE).map(toObjectId);
}

/** Adds `tags: [{ _id, name, color }]` (in the rule's order) to each rule. Deleted tags are skipped. */
async function attachTags(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const ids = [...new Set(list.flatMap((r) => (r?.tagIds || []).map(String)))].filter(isId);
  if (!ids.length) return list.map((r) => ({ ...r, tags: [] }));
  const tags = await recommendationTagSchema.find({ _id: { $in: ids.map(toObjectId) } }).select("name color").lean();
  const byId = new Map(tags.map((t) => [String(t._id), { _id: t._id, name: t.name, color: t.color || colorForTag(t.name) }]));
  return list.map((r) => ({ ...r, tags: (r?.tagIds || []).map((id) => byId.get(String(id))).filter(Boolean) }));
}

/** Tag ids for a rule copied to another Amazon account: same organization → same ids; else matched/created by name. */
async function mapTagIdsToConfig(sourceConfigId, targetConfigId, tagIds, userId = null) {
  if (!Array.isArray(tagIds) || !tagIds.length) return [];
  const [sourceOrg, targetOrg] = await Promise.all([organizationOfConfig(sourceConfigId), organizationOfConfig(targetConfigId)]);
  if (!targetOrg) return [];
  if (sourceOrg && sourceOrg === targetOrg) return tagIds.filter(isId).map(toObjectId);
  const sourceTags = await recommendationTagSchema.find({ _id: { $in: tagIds.filter(isId).map(toObjectId) } }).select("name").lean();
  const mapped = [];
  for (const tag of sourceTags) {
    const target = await findOrCreateTag(targetOrg, tag.name, userId);
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
  organizationOfConfig,
  resolveOrganizationId,
  migrateLegacyTags,
  prepareOrganization,
  createTag,
  findOrCreateTag,
  sanitizeTagIds,
  attachTags,
  mapTagIdsToConfig,
  _resetCachesForTests: () => { orgCache.clear(); migratedOrgs.clear(); indexesReady = null; },
};
