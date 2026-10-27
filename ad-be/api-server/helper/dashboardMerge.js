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

// Build a $lookup source that spans several collections: the pipeline starts on
// the first and $unionWith's the rest, so the lookup's own stages then run over
// the combined documents. One collection → no union stages.
function buildUnionSource(collectionNames) {
  const names = (collectionNames || []).filter(Boolean);
  const [first, ...rest] = names;
  return {
    from: first,
    prependStages: rest.map((coll) => ({ $unionWith: { coll, pipeline: [] } })),
  };
}

module.exports = { mergeNumericById, buildUnionSource };
