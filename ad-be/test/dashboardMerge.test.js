"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeNumericById, buildProductAdsLookupStages } = require("../api-server/helper/dashboardMerge");

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

// --- buildProductAdsLookupStages ------------------------------------------

const INNER = [{ $match: { $expr: { $eq: ["$$asin", "$asins"] } } }, { $group: { _id: null, adSales: { $sum: "$sales" }, spend: { $sum: "$spend" } } }];

test("three collections → three lookups + summed $addFields + requireAds match", () => {
  const stages = buildProductAdsLookupStages({
    collections: ["product_ads", "sbproductads", "sdproductads"],
    innerPipeline: INNER,
    sumFields: ["adSales", "spend"],
  });
  const lookups = stages.filter((s) => s.$lookup);
  assert.equal(lookups.length, 3);
  assert.deepEqual(lookups.map((l) => l.$lookup.from), ["product_ads", "sbproductads", "sdproductads"]);
  // each lookup is correlated on asin and reuses the inner pipeline
  assert.deepEqual(lookups[0].$lookup.let, { asin: "$asin" });
  assert.equal(lookups[0].$lookup.pipeline, INNER);
  assert.deepEqual(lookups.map((l) => l.$lookup.as), ["__pa_ads_0", "__pa_ads_1", "__pa_ads_2"]);

  const addFields = stages.find((s) => s.$addFields);
  // combined ads.adSales = sum of each lookup's first-doc adSales (0 when absent)
  assert.deepEqual(addFields.$addFields.ads.adSales, {
    $add: [
      { $ifNull: [{ $arrayElemAt: ["$__pa_ads_0.adSales", 0] }, 0] },
      { $ifNull: [{ $arrayElemAt: ["$__pa_ads_1.adSales", 0] }, 0] },
      { $ifNull: [{ $arrayElemAt: ["$__pa_ads_2.adSales", 0] }, 0] },
    ],
  });
  assert.ok(addFields.$addFields.ads.spend);
  // requireAds (default) drops products with no ad docs in any collection
  const match = stages.find((s) => s.$match);
  assert.deepEqual(match, { $match: { __adsDocs: { $gt: 0 } } });
  // temp + bookkeeping fields are projected away
  const project = stages[stages.length - 1].$project;
  assert.deepEqual(project, { __pa_ads_0: 0, __pa_ads_1: 0, __pa_ads_2: 0, __adsDocs: 0 });
});

test("single collection → one lookup, same combine shape", () => {
  const stages = buildProductAdsLookupStages({
    collections: ["sbproductads"],
    innerPipeline: INNER,
    sumFields: ["adSales"],
  });
  assert.equal(stages.filter((s) => s.$lookup).length, 1);
  assert.equal(stages[0].$lookup.from, "sbproductads");
  const addFields = stages.find((s) => s.$addFields);
  assert.deepEqual(addFields.$addFields.ads.adSales, {
    $add: [{ $ifNull: [{ $arrayElemAt: ["$__pa_ads_0.adSales", 0] }, 0] }],
  });
});

test("requireAds=false emits no gating $match", () => {
  const stages = buildProductAdsLookupStages({
    collections: ["product_ads", "sbproductads"],
    innerPipeline: INNER,
    sumFields: ["adSales"],
    requireAds: false,
  });
  assert.equal(stages.some((s) => s.$match), false);
});
