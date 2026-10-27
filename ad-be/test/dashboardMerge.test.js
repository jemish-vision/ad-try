"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeNumericById, buildUnionSource } = require("../api-server/helper/dashboardMerge");

// --- mergeNumericById ------------------------------------------------------

test("merges a {_id:null} rollup across ad types, summing numerics", () => {
  const sp = [{ _id: null, adSales: 100, spend: 40, clicks: 5 }];
  const sb = [{ _id: null, adSales: 80, spend: 30, clicks: 4 }];
  const sd = [{ _id: null, adSales: 5, spend: 2, clicks: 1 }];
  const merged = mergeNumericById([...sp, ...sb, ...sd]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].adSales, 185);
  assert.equal(merged[0].spend, 72);
  assert.equal(merged[0].clicks, 10);
  assert.equal(merged[0]._id, null);
});

test("merges a grouped-by-date series, summing only shared dates", () => {
  const sp = [
    { _id: "2024-01-01", spend: 10, clicks: 2 },
    { _id: "2024-01-02", spend: 20, clicks: 3 },
  ];
  const sb = [
    { _id: "2024-01-01", spend: 5, clicks: 1 },
    { _id: "2024-01-03", spend: 7, clicks: 1 },
  ];
  const merged = mergeNumericById([...sp, ...sb]);
  const byDate = Object.fromEntries(merged.map((r) => [r._id, r]));
  assert.equal(byDate["2024-01-01"].spend, 15); // 10 + 5
  assert.equal(byDate["2024-01-01"].clicks, 3);
  assert.equal(byDate["2024-01-02"].spend, 20); // SP only
  assert.equal(byDate["2024-01-03"].spend, 7); // SB only
  assert.equal(merged.length, 3);
});

test("single input set passes through unchanged (values + order)", () => {
  const sp = [{ _id: "2024-01-02", spend: 20 }, { _id: "2024-01-01", spend: 10 }];
  const merged = mergeNumericById(sp);
  assert.deepEqual(merged.map((r) => r._id), ["2024-01-02", "2024-01-01"]);
  assert.equal(merged[0].spend, 20);
});

test("non-numeric fields keep the first occurrence; empty input is []", () => {
  const merged = mergeNumericById([
    { _id: "x", label: "a", n: 1 },
    { _id: "x", label: "b", n: 2 },
  ]);
  assert.equal(merged[0].label, "a");
  assert.equal(merged[0].n, 3);
  assert.deepEqual(mergeNumericById([]), []);
  assert.deepEqual(mergeNumericById(null), []);
});

// --- buildUnionSource ------------------------------------------------------

test("buildUnionSource unions the tail collections onto the first", () => {
  const src = buildUnionSource(["product_ads", "sbproductads", "sdproductads"]);
  assert.equal(src.from, "product_ads");
  assert.deepEqual(src.prependStages, [
    { $unionWith: { coll: "sbproductads", pipeline: [] } },
    { $unionWith: { coll: "sdproductads", pipeline: [] } },
  ]);
});

test("buildUnionSource with one collection emits no union stages", () => {
  const src = buildUnionSource(["sbproductads"]);
  assert.equal(src.from, "sbproductads");
  assert.deepEqual(src.prependStages, []);
});
