/**
 * Recommendations list (Recommendation → Recommendations tab): filter + sort + paginate on the
 * server. Items are { rule, count, newCount, fromDate, toDate } from the recommendation counts.
 *
 * Filters (all optional, combined with AND; values within one filter are OR):
 *   gridNames  — Affected Parameter, e.g. ["Campaign", "Targeting"]
 *   actions    — action names, e.g. ["IncreaseBid"]; "None" = rules without an action (out of budget)
 *   tagIds     — rules having ALL of these tags
 */
const MAX_LIMIT = 100;

const toList = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v.trim()] : [])
  .map((x) => String(x).trim())
  .filter(Boolean);

/** Reads list filters + paging from the request body. */
function parseRecommendationListQuery(body = {}) {
  const limitRaw = Number(body?.limit);
  return {
    gridNames: toList(body?.gridName ?? body?.gridNames),
    actions: toList(body?.actionName ?? body?.actions),
    tagIds: toList(body?.tagIds),
    page: Math.max(1, Math.floor(Number(body?.page)) || 1),
    // No limit → whole list (older clients).
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(MAX_LIMIT, Math.floor(limitRaw)) : null,
  };
}

const realActions = (rule) =>
  (Array.isArray(rule?.actions) ? rule.actions : []).filter(
    (a) => a && a.actionName && String(a.actionName).toLowerCase() !== "none"
  );

function matchesFilters(rule, { gridNames = [], actions = [], tagIds = [] }) {
  if (gridNames.length && !gridNames.includes(rule?.gridName)) return false;
  if (actions.length) {
    const acts = realActions(rule);
    const matchesNone = actions.includes("None") && acts.length === 0;
    const matchesAction = acts.some((a) => actions.includes(a.actionName));
    if (!matchesNone && !matchesAction) return false;
  }
  if (tagIds.length) {
    const ruleTags = (rule?.tagIds || []).map(String);
    if (!tagIds.every((id) => ruleTags.includes(id))) return false;
  }
  return true;
}

const createdTime = (rule) => {
  const t = new Date(rule?.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * @returns {{ items, total, totalUnfiltered, page, limit, totalPages, hasMore }}
 *   Only rules with recommendations (count > 0) are listed.
 *   Custom orderMap (rule._id -> index) takes priority; rules not in orderMap sort newest first.
 *   A page past the end is moved to the last page (e.g. after a filter shrinks the list).
 */
function filterSortPaginateRecommendations(computed, query, orderMap = null) {
  const withData = (computed || []).filter((item) => item?.rule && item.count > 0);
  const filtered = withData
    .filter((item) => matchesFilters(item.rule, query))
    .sort((a, b) => {
      if (orderMap && orderMap.size > 0) {
        const aId = String(a.rule?._id);
        const bId = String(b.rule?._id);
        const hasA = orderMap.has(aId);
        const hasB = orderMap.has(bId);
        if (hasA && hasB) {
          return orderMap.get(aId) - orderMap.get(bId);
        }
        // Newly created / unmapped rules appear on top of mapped rules
        if (!hasA && hasB) return -1;
        if (hasA && !hasB) return 1;
      }
      return createdTime(b.rule) - createdTime(a.rule) || String(b.rule._id).localeCompare(String(a.rule._id));
    });

  const total = filtered.length;
  const limit = query.limit || total || 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(query.page || 1, totalPages);
  const items = query.limit ? filtered.slice((page - 1) * limit, page * limit) : filtered;

  return { items, total, totalUnfiltered: withData.length, page, limit: query.limit || total, totalPages, hasMore: page < totalPages };
}

module.exports = { MAX_LIMIT, parseRecommendationListQuery, matchesFilters, filterSortPaginateRecommendations };
