"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveAdTypes,
  buildUnionPipeline,
  collectionName,
  SD_EXCLUDED_FEATURES,
} = require("../api-server/helper/adTypeResolver");

test("resolveAdTypes expands All to the three types", () => {
  assert.deepEqual(resolveAdTypes("All"), ["SP", "SB", "SD"]);
});

test("resolveAdTypes drops SD for SD-excluded features under All", () => {
  assert.deepEqual(resolveAdTypes("All", { excludeSD: true }), ["SP", "SB"]);
});

test("resolveAdTypes returns a single selection unchanged", () => {
  assert.deepEqual(resolveAdTypes("SP"), ["SP"]);
  assert.deepEqual(resolveAdTypes("SB"), ["SB"]);
  assert.deepEqual(resolveAdTypes("SD"), ["SD"]);
  // excludeSD only affects the All expansion, never a single selection
  assert.deepEqual(resolveAdTypes("SD", { excludeSD: true }), ["SD"]);
});

test("collectionName resolves per-type collections", () => {
  assert.equal(collectionName("SP", "campaign"), "campaigns");
  assert.equal(collectionName("SB", "campaign"), "sbcampaigns");
  assert.equal(collectionName("SD", "searchTerm"), "sdsearchterms");
  assert.equal(collectionName("SP", "nope"), null);
});

test("SD_EXCLUDED_FEATURES matches the chatbot exclusion list", () => {
  assert.deepEqual(SD_EXCLUDED_FEATURES, ["keyword", "search_term", "placement"]);
});

test("buildUnionPipeline tags each branch and unions the rest onto the first", () => {
  const pipeline = buildUnionPipeline({
    adTypes: ["SP", "SB", "SD"],
    collectionKey: "campaign",
    basePipeline: [{ $match: { configId: 1 } }],
  });

  // First branch: base stages + tag, no $unionWith
  assert.deepEqual(pipeline[0], { $match: { configId: 1 } });
  assert.deepEqual(pipeline[1], { $addFields: { adType: "SP" } });

  const unions = pipeline.filter((stage) => stage.$unionWith);
  assert.equal(unions.length, 2);
  assert.equal(unions[0].$unionWith.coll, "sbcampaigns");
  assert.equal(unions[1].$unionWith.coll, "sdcampaigns");
  // Each unioned branch carries the base stage and its own tag
  assert.deepEqual(unions[0].$unionWith.pipeline, [
    { $match: { configId: 1 } },
    { $addFields: { adType: "SB" } },
  ]);
});

test("buildUnionPipeline supports per-branch stages via a function basePipeline", () => {
  const pipeline = buildUnionPipeline({
    adTypes: ["SP", "SB"],
    collectionKey: "searchTerm",
    // vary the $lookup per branch to that type's own campaign collection
    basePipeline: (adType) => [
      { $match: {} },
      { $lookup: { from: collectionName(adType, "campaign"), as: "c" } },
    ],
  });

  assert.equal(pipeline[1].$lookup.from, "campaigns"); // SP branch looks up SP campaigns
  const sbBranch = pipeline.find((s) => s.$unionWith)?.$unionWith.pipeline;
  assert.equal(sbBranch[1].$lookup.from, "sbcampaigns"); // SB branch looks up SB campaigns
});

test("buildUnionPipeline with one type produces no $unionWith", () => {
  const pipeline = buildUnionPipeline({ adTypes: ["SP"], collectionKey: "campaign" });
  assert.ok(!pipeline.some((stage) => stage.$unionWith));
  assert.deepEqual(pipeline[pipeline.length - 1], { $addFields: { adType: "SP" } });
});

test("buildUnionPipeline rejects an empty type list", () => {
  assert.throws(() => buildUnionPipeline({ adTypes: [], collectionKey: "campaign" }));
});
