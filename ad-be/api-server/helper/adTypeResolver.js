"use strict";

// Pure name map only — a resolver must not drag in the Mongoose model layer.
const AD_TYPE_COLLECTION_NAMES = require("./adTypeCollectionNames");

const ALL_AD_TYPES = ["SP", "SB", "SD"];

// Features that only exist for SP/SB. Sponsored Display has no keywords, search
// terms or placements, so "All" on those views must merge SP+SB only. This
// mirrors the exclusion list already used by the chatbot
// (services/chatbotReporting.scope.js) — keep the two in sync.
const SD_EXCLUDED_FEATURES = ["keyword", "search_term", "placement"];

// Expand the selected ad type into the concrete list of types to query.
//   "All"          -> ["SP","SB","SD"]  (or ["SP","SB"] when excludeSD)
//   "SP"/"SB"/"SD" -> [adType]          (single selection, unchanged behaviour)
function resolveAdTypes(adType, { excludeSD = false } = {}) {
  if (adType === "All") {
    return excludeSD ? ["SP", "SB"] : [...ALL_AD_TYPES];
  }
  return [adType];
}

function collectionName(adType, collectionKey) {
  return AD_TYPE_COLLECTION_NAMES?.[adType]?.[collectionKey] || null;
}

// Build a union pipeline that runs `basePipeline` against each ad type's
// collection and tags every row with its ad type. The returned stages are meant
// to run on the FIRST ad type's collection/model (e.g.
// req.modelsByType[adTypes[0]].adTypeCampaignSchema.aggregate([...stages])); the
// remaining types are appended with $unionWith. Mirrors the hand-written union
// in controllers/customer.controller.js (getCampaignAndAdGroup).
//
//   adTypes       ordered list from resolveAdTypes (first drives the base read)
//   collectionKey key in AD_TYPE_COLLECTIONS (e.g. "campaign", "searchTerm")
//   basePipeline  array applied to every branch, OR (adType) => stages to vary a
//                 branch (e.g. a per-type $lookup into that type's own campaign
//                 collection, as getAllSearchTerms needs)
//   tagField      field recording the row's ad type (default "adType")
function buildUnionPipeline({ adTypes, collectionKey, basePipeline = [], tagField = "adType" }) {
  if (!Array.isArray(adTypes) || adTypes.length === 0) {
    throw new Error("buildUnionPipeline requires a non-empty adTypes array");
  }

  const stagesFor = (adType) => {
    const stages = typeof basePipeline === "function" ? basePipeline(adType) : basePipeline;
    return [...(Array.isArray(stages) ? stages : []), { $addFields: { [tagField]: adType } }];
  };

  const [first, ...rest] = adTypes;
  const pipeline = [...stagesFor(first)];

  for (const adType of rest) {
    const coll = collectionName(adType, collectionKey);
    if (!coll) continue;
    pipeline.push({ $unionWith: { coll, pipeline: stagesFor(adType) } });
  }

  return pipeline;
}

// Run `perType(adType)` for every resolved ad type, tag each returned row with
// its ad type, and concatenate. This is the backbone of the "All" path for
// endpoints whose existing aggregation is large or has per-type schema
// differences: each type reuses its exact, already-tested query (just without
// final DB pagination), and the rows are merged here. Simpler and lower-risk
// than normalising three schemas into one $unionWith group stage.
//   perType(adType) -> Promise<Array<row>>  (plain objects)
async function mergeAcrossAdTypes(adTypes, perType, { tagField = "adType" } = {}) {
  const perTypeRows = await Promise.all(
    (adTypes || []).map(async (adType) => {
      const rows = (await perType(adType)) || [];
      return rows.map((row) =>
        row && typeof row === "object" && !Array.isArray(row)
          ? { ...row, [tagField]: row[tagField] || adType }
          : row,
      );
    }),
  );
  return perTypeRows.flat();
}

// Sort + page an already-merged row set in memory, mirroring the DB pagination
// the single-type path does. Nulls always sort last (both directions).
function sortAndPaginate(rows, { sortField, sortDir = "desc", skip = 0, limit } = {}) {
  let out = Array.isArray(rows) ? rows : [];
  if (sortField) {
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = a?.[sortField];
      const bv = b?.[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }
  const total = out.length;
  const start = Math.max(0, Number(skip) || 0);
  const paged = typeof limit === "number" ? out.slice(start, start + limit) : out.slice(start);
  return { rows: paged, total, hasMore: start + paged.length < total };
}

module.exports = {
  ALL_AD_TYPES,
  SD_EXCLUDED_FEATURES,
  resolveAdTypes,
  collectionName,
  buildUnionPipeline,
  mergeAcrossAdTypes,
  sortAndPaginate,
};
