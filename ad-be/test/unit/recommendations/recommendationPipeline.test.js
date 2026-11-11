const { test, describe } = require("node:test");
const assert = require("node:assert");
// Stub Redis to isolate unit test
require("../../helpers/stubRedisService");
// Ensure PROCESS_LIMIT is set before loading recommendation.controller.js
if (!process.env.PROCESS_LIMIT) {
  process.env.PROCESS_LIMIT = "10";
}

const { recommendationPipeline } = require("../../../api-server/controllers/recommendation.controller");

describe("Recommendations: recommendationPipeline builder", () => {
  const sampleRule = {
    _id: "507f1f77bcf86cd799439011",
    configId: "507f1f77bcf86cd799439022",
    profileId: 12345,
    timezone: "UTC",
    reportDate: "LAST_7_DAYS",
    gridName: "targeting",
    conditions: [
      {
        conditionType: "ACOS",
        conditionOperator: "GREATER_THAN",
        conditionValue: 30,
      },
    ],
  };

  test("generates valid aggregation pipeline with $match stage", () => {
    const matchQuery = { configId: "cfg-1", profileId: 12345 };
    const pipeline = recommendationPipeline(matchQuery, "2026-10-25", sampleRule, "SP", {
      isCountOnly: true,
      hasExistingNotNew: false,
    });

    assert.ok(Array.isArray(pipeline));
    assert.ok(pipeline.length > 0);
    // First stage should match scope
    assert.deepStrictEqual(pipeline[0].$match, matchQuery);
  });

  test("empty matchQuery produces pipeline matching empty object", () => {
    const pipeline = recommendationPipeline({}, "2026-10-25", sampleRule, "SP", {
      isCountOnly: true,
      hasExistingNotNew: false,
    });
    assert.deepStrictEqual(pipeline[0].$match, {});
  });

  test("does not mutate original matchQuery", () => {
    const matchQuery = { configId: "cfg-1" };
    recommendationPipeline(matchQuery, "2026-10-25", sampleRule, "SP", {
      isCountOnly: true,
    });
    assert.deepStrictEqual(matchQuery, { configId: "cfg-1" });
  });
});
