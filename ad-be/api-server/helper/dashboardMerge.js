"use strict";

// Pure, model-free helpers for the dashboard "All" merges (unit-testable).

// Merge aggregation result rows by their _id, summing every numeric field.
// Non-numeric fields keep the first occurrence's value. A single input row set
// passes through unchanged (order preserved). Used to combine additive per-ad-
// type aggregates (spend/sales/clicks/… grouped by null or by reportDate).
function mergeNumericById(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const key = JSON.stringify(row._id === undefined ? null : row._id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, { ...row });
    } else {
      for (const [k, v] of Object.entries(row)) {
        if (k === "_id") continue;
        if (typeof v === "number") existing[k] = (Number(existing[k]) || 0) + v;
      }
    }
  }
  return Array.from(byId.values());
}

// Build the product_ads join as one correlated $lookup PER collection plus an
// $addFields that sums their per-ASIN {_id:null} aggregates into a single `as`
// object. Deliberately separate lookups (not a $unionWith inside a $lookup):
// a correlated lookup sub-pipeline can't reliably union, and separate lookups
// work on every MongoDB version/topology. `requireAds` reproduces the original
// `$unwind "$ads"` behaviour (drop products with no ad docs in any collection).
//   collections   product_ads collection names for the resolved ad types
//   innerPipeline  the lookup's inner stages (match by $$asin + filters, then a
//                  {_id:null} $group) — identical for each collection
//   sumFields      numeric fields the $group produces, summed across collections
//   as             combined output field (object holding sumFields); default "ads"
function buildProductAdsLookupStages({ collections, innerPipeline, sumFields, as = "ads", requireAds = true }) {
  const colls = (collections || []).filter(Boolean);
  const temp = colls.map((_, i) => `__pa_${as}_${i}`);
  const lookups = colls.map((coll, i) => ({
    $lookup: { from: coll, let: { asin: "$asin" }, pipeline: innerPipeline, as: temp[i] },
  }));
  const sumObj = (sumFields || []).reduce((acc, f) => {
    acc[f] = { $add: temp.map((t) => ({ $ifNull: [{ $arrayElemAt: [`$${t}.${f}`, 0] }, 0] })) };
    return acc;
  }, {});
  const stages = [
    ...lookups,
    {
      $addFields: {
        [as]: sumObj,
        __adsDocs: { $add: temp.map((t) => ({ $size: `$${t}` })) },
      },
    },
  ];
  if (requireAds) stages.push({ $match: { __adsDocs: { $gt: 0 } } });
  stages.push({ $project: { ...temp.reduce((a, t) => ({ ...a, [t]: 0 }), {}), __adsDocs: 0 } });
  return stages;
}

module.exports = { mergeNumericById, buildProductAdsLookupStages };
