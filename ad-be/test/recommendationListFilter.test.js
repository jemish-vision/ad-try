const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const { parseRecommendationListQuery, filterSortPaginateRecommendations } = require("../api-server/helpers/recommendationListFilter.helper");

const T1 = "64b000000000000000000001";
const T2 = "64b000000000000000000002";
const item = (i, extra = {}) => ({
  count: extra.count ?? 3,
  newCount: 1,
  rule: {
    _id: `r${String(i).padStart(2, "0")}`,
    ruleName: `Rule ${i}`,
    gridName: extra.gridName || "Targeting",
    actions: extra.actions || [{ actionName: "IncreaseBid" }],
    tagIds: extra.tagIds || [],
    createdAt: new Date(2026, 0, i), // higher i = newer
  },
});
// 25 rules: 1..10 Campaign/IncreaseBudget tagged T1, 11..20 Targeting tagged T2, 21..23 no action, 24 no recommendations, 25 tagged both
const data = [
  ...Array.from({ length: 10 }, (_, k) => item(k + 1, { gridName: "Campaign", actions: [{ actionName: "IncreaseBudget" }], tagIds: [T1] })),
  ...Array.from({ length: 10 }, (_, k) => item(k + 11, { tagIds: [T2] })),
  ...Array.from({ length: 3 }, (_, k) => item(k + 21, { gridName: "Campaign", actions: [{ actionName: "None" }] })),
  item(24, { count: 0 }),
  item(25, { tagIds: [T1, T2] }),
];
const run = (body) => filterSortPaginateRecommendations(data, parseRecommendationListQuery(body));

describe("recommendations list: server-side filters + pagination", () => {
  test("only rules with recommendations; newest first; pages of `limit`", () => {
    const p1 = run({ page: 1, limit: 10 });
    assert.equal(p1.total, 24);
    assert.equal(p1.totalPages, 3);
    assert.deepEqual(p1.items.map((x) => x.rule._id).slice(0, 3), ["r25", "r23", "r22"]);
    const p3 = run({ page: 3, limit: 10 });
    assert.equal(p3.items.length, 4);
    assert.equal(p3.hasMore, false);
    const all = [...run({ page: 1, limit: 10 }).items, ...run({ page: 2, limit: 10 }).items, ...p3.items].map((x) => x.rule._id);
    assert.equal(new Set(all).size, 24); // no duplicates / gaps across pages
  });

  test("filters combine (AND) and the total / pages follow the filtered list", () => {
    const camp = run({ gridName: ["Campaign"], page: 1, limit: 5 });
    assert.equal(camp.total, 13);
    assert.equal(camp.totalPages, 3);
    assert.ok(camp.items.every((x) => x.rule.gridName === "Campaign"));
    const none = run({ gridName: ["Campaign"], actionName: ["None"], limit: 10 });
    assert.deepEqual(none.items.map((x) => x.rule._id), ["r23", "r22", "r21"]);
    const budgetOrNone = run({ actionName: ["IncreaseBudget", "None"], limit: 50 });
    assert.equal(budgetOrNone.total, 13);
  });

  test("tag filter matches any selected tag", () => {
    assert.equal(run({ tagIds: [T1], limit: 50 }).total, 11); // 10 + r25
    assert.equal(run({ tagIds: [T1, T2], limit: 50 }).total, 21);
    assert.equal(run({ tagIds: [T2], gridName: "Campaign", limit: 50 }).total, 0);
    assert.equal(run({ tagIds: [T2], gridName: "Campaign", limit: 50 }).totalUnfiltered, 24);
  });

  test("a page past the end moves to the last page (e.g. after a filter shrinks the list)", () => {
    const r = run({ tagIds: [T1], page: 9, limit: 5 });
    assert.equal(r.page, 3);
    assert.equal(r.items.length, 1);
  });

  test("query parsing: strings or arrays, limit capped at 100, no limit = whole list", () => {
    const q = parseRecommendationListQuery({ gridName: "Campaign", actionName: ["None", ""], tagIds: T1, page: "2", limit: 500 });
    assert.deepEqual(q, { gridNames: ["Campaign"], actions: ["None"], tagIds: [T1], page: 2, limit: 100 });
    assert.equal(run({}).items.length, 24);
    assert.equal(parseRecommendationListQuery({ page: -3 }).page, 1);
  });
});
