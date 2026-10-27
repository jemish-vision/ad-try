"use strict";

// Merge per-rule recommendation count arrays across ad types.
//
// Each input list holds items of the shape { rule, fromDate, toDate, count,
// newCount } (one per active rule for a single ad type). Under "All" the same
// rule is computed once per ad type against that type's partitioned collections;
// this merges those lists by rule._id, summing count/newCount. A rule's identity
// and date window are the same across types, so the first occurrence seeds the
// row and later ones only add to its totals. Pure + model-free (unit-testable).
function mergeRecommendationCountsByRule(lists) {
  const byRule = new Map();
  for (const list of lists || []) {
    for (const item of list || []) {
      if (!item || !item.rule) continue;
      const key = String(item.rule._id);
      const existing = byRule.get(key);
      if (!existing) {
        byRule.set(key, { ...item, count: Number(item.count) || 0, newCount: Number(item.newCount) || 0 });
      } else {
        existing.count += Number(item.count) || 0;
        existing.newCount += Number(item.newCount) || 0;
      }
    }
  }
  return Array.from(byRule.values());
}

module.exports = { mergeRecommendationCountsByRule };
