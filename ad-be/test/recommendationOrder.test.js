const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const mongoose = require("mongoose");
const { filterSortPaginateRecommendations, parseRecommendationListQuery } = require("../api-server/helpers/recommendationListFilter.helper");

describe("recommendation reordering", () => {
  const item = (id, dateOffset) => ({
    count: 5,
    newCount: 2,
    rule: {
      _id: id,
      ruleName: `Rule ${id}`,
      gridName: "Campaign",
      actions: [{ actionName: "IncreaseBudget" }],
      createdAt: new Date(2026, 0, dateOffset),
    },
  });

  const data = [
    item("rule_1", 10),
    item("rule_2", 20),
    item("rule_3", 30),
    item("rule_4", 40),
  ];

  test("default sort without orderMap is newest first", () => {
    const res = filterSortPaginateRecommendations(data, parseRecommendationListQuery({ limit: 10 }));
    assert.deepEqual(
      res.items.map((x) => x.rule._id),
      ["rule_4", "rule_3", "rule_2", "rule_1"]
    );
  });

  test("orderMap overrides default sort for mapped rules", () => {
    // Custom drag order: rule_2 at top, rule_4 second, rule_1 third
    const orderMap = new Map([
      ["rule_2", 0],
      ["rule_4", 1],
      ["rule_1", 2],
    ]);
    const res = filterSortPaginateRecommendations(data, parseRecommendationListQuery({ limit: 10 }), orderMap);
    assert.deepEqual(
      res.items.map((x) => x.rule._id),
      ["rule_2", "rule_4", "rule_1", "rule_3"]
    );
  });

  test("unmapped rules appear after mapped rules, sorted newest first", () => {
    // Only rule_1 mapped to 0
    const orderMap = new Map([
      ["rule_1", 0],
    ]);
    const res = filterSortPaginateRecommendations(data, parseRecommendationListQuery({ limit: 10 }), orderMap);
    // rule_1 first, then rule_4 (newest), rule_3, rule_2
    assert.deepEqual(
      res.items.map((x) => x.rule._id),
      ["rule_1", "rule_4", "rule_3", "rule_2"]
    );
  });

  test("reorder logic correctly merges incoming sequence into existing order", () => {
    const existingStr = ["rule_1", "rule_2", "rule_3", "rule_4"];
    const incomingStr = ["rule_3", "rule_1"]; // User dragged rule_3 above rule_1 in a filtered view
    const incomingSet = new Set(incomingStr);

    let incomingIdx = 0;
    const updated = [];
    for (const id of existingStr) {
      if (incomingSet.has(id)) {
        if (incomingIdx < incomingStr.length) {
          updated.push(incomingStr[incomingIdx++]);
        }
      } else {
        updated.push(id);
      }
    }
    while (incomingIdx < incomingStr.length) {
      updated.push(incomingStr[incomingIdx++]);
    }

    assert.deepEqual(updated, ["rule_3", "rule_2", "rule_1", "rule_4"]);
  });
});
