const { test, describe } = require("node:test");
const assert = require("node:assert");
// Must come first: stops common.js -> redis.service from opening a real Redis connection.
require("../../helpers/stubRedisService");

const {
  addHealthScoreSettingQuery,
  addCampaignSettingPipelineQuery,
} = require("../../../api-server/helper/generateQuery");

const cond = (over) => ({ conditionType: "Spend", conditionOperator: "GREATER_THAN", conditionValue: 10, ...over });

describe("Filters: addHealthScoreSettingQuery (find() query)", () => {
  const OPS = {
    LESS_THAN: "$lt",
    LESS_THAN_OR_EQUAL_TO: "$lte",
    GREATER_THAN: "$gt",
    GREATER_THAN_OR_EQUAL_TO: "$gte",
    EQUAL_TO: "$eq",
    NOT_EQUAL_TO: "$ne",
  };

  for (const [name, mongoOp] of Object.entries(OPS)) {
    test(`${name} -> ${mongoOp}`, () => {
      const q = addHealthScoreSettingQuery([cond({ conditionOperator: name, conditionValue: 7 })], [], {});
      assert.deepStrictEqual(q, { spend: { [mongoOp]: 7 } });
    });
  }

  test("BETWEEN builds $gte and $lte", () => {
    const q = addHealthScoreSettingQuery([cond({ conditionOperator: "BETWEEN", conditionValue: 5, conditionMaxValue: 20 })], [], {});
    assert.deepStrictEqual(q, { spend: { $gte: 5, $lte: 20 } });
  });

  test("unknown operator falls back to $eq", () => {
    const q = addHealthScoreSettingQuery([cond({ conditionOperator: "WEIRD", conditionValue: 3 })], [], {});
    assert.deepStrictEqual(q, { spend: { $eq: 3 } });
  });

  test("string values are converted to numbers", () => {
    const q = addHealthScoreSettingQuery([cond({ conditionValue: "12.5" })], [], {});
    assert.deepStrictEqual(q, { spend: { $gt: 12.5 } });
  });

  test("metric field names: ACOS->acos, TimeInBudget->timeInBudget, ConversionRate->conversionRate", () => {
    assert.ok("acos" in addHealthScoreSettingQuery([cond({ conditionType: "ACOS" })], [], {}));
    assert.ok("timeInBudget" in addHealthScoreSettingQuery([cond({ conditionType: "TimeInBudget" })], [], {}));
    assert.ok("conversionRate" in addHealthScoreSettingQuery([cond({ conditionType: "ConversionRate" })], [], {}));
  });

  test("ACOS with useTargetAcos uses the campaign target", () => {
    const q = addHealthScoreSettingQuery(
      [cond({ conditionType: "ACOS", conditionOperator: "LESS_THAN", conditionValue: 99, useTargetAcos: true })],
      [],
      { targetAcos: 30 }
    );
    assert.deepStrictEqual(q, { acos: { $lt: 30 } });
  });

  test("Status, Type and Targeting Type conditions", () => {
    assert.deepStrictEqual(
      addHealthScoreSettingQuery([{ conditionType: "Status", conditionStringValue: "ENABLED" }], [], {}),
      { status: { $eq: "ENABLED" } }
    );
    assert.deepStrictEqual(
      addHealthScoreSettingQuery([{ conditionType: "Type", conditionStringValue: "SP" }], [], {}),
      { type: { $eq: "SP" } }
    );
    assert.deepStrictEqual(
      addHealthScoreSettingQuery([{ conditionType: "Targeting Type", conditionStringValue: "AUTO" }], [], {}),
      { targetingType: { $eq: "AUTO" } }
    );
  });

  test("Out of Budget condition", () => {
    const q = addHealthScoreSettingQuery([{ conditionType: "Out of Budget" }], [], {});
    assert.deepStrictEqual(q, { $or: [{ status: { $eq: "OUT_OF_BUDGET" } }, { isOutOfBudget: { $eq: true } }] });
  });

  test("empty conditions give an empty query", () => {
    assert.deepStrictEqual(addHealthScoreSettingQuery([], [], {}), {});
  });

  test("unknown condition type is ignored", () => {
    assert.deepStrictEqual(addHealthScoreSettingQuery([{ conditionType: "Nonsense" }], [], {}), {});
  });

  test("all AND conditions produce clean array $and", () => {
    const q = addHealthScoreSettingQuery(
      [cond({ conditionType: "Spend" }), cond({ conditionType: "Clicks", conditionValue: 5, queryOperator: "AND" })],
      [],
      {}
    );
    assert.deepStrictEqual(q, { $and: [{ spend: { $gt: 10 } }, { clicks: { $gt: 5 } }] });
  });

  test("all OR conditions produce clean array $or", () => {
    const q = addHealthScoreSettingQuery(
      [cond({ conditionType: "Spend" }), cond({ conditionType: "Clicks", conditionValue: 5, queryOperator: "OR" })],
      [],
      {}
    );
    assert.deepStrictEqual(q, { $or: [{ spend: { $gt: 10 } }, { clicks: { $gt: 5 } }] });
  });

  test("mixed AND and OR conditions preserve left-to-right logic", () => {
    const q = addHealthScoreSettingQuery(
      [
        cond({ conditionType: "Spend", conditionValue: 10 }),
        cond({ conditionType: "Clicks", conditionValue: 5, queryOperator: "OR" }),
        cond({ conditionType: "Orders", conditionValue: 2, queryOperator: "AND" })
      ],
      [],
      {}
    );
    assert.deepStrictEqual(q, {
      $and: [
        { $or: [{ spend: { $gt: 10 } }, { clicks: { $gt: 5 } }] },
        { orders: { $gt: 2 } }
      ]
    });
  });

  test("custom saved filter is parsed from its JSON query", () => {
    const filters = [{ value: "MyFilter", isDefault: false, query: '{"status":"PAUSED"}' }];
    const q = addHealthScoreSettingQuery([{ conditionType: "MyFilter" }], filters, {});
    assert.deepStrictEqual(q, { status: "PAUSED" });
  });

  test("custom filter JSON cannot pollute the prototype", () => {
    const filters = [{ value: "Evil", isDefault: false, query: '{"__proto__":{"admin":true},"a":1}' }];
    const q = addHealthScoreSettingQuery([{ conditionType: "Evil" }], filters, {});
    assert.strictEqual(({}).admin, undefined);
    assert.strictEqual(q.a, 1);
    assert.strictEqual(q.admin, undefined);
  });

  test("a default (isDefault) filter is not treated as a custom filter", () => {
    const filters = [{ value: "MyFilter", isDefault: true, query: '{"status":"PAUSED"}' }];
    assert.deepStrictEqual(addHealthScoreSettingQuery([{ conditionType: "MyFilter" }], filters, {}), {});
  });
});

describe("Filters: addCampaignSettingPipelineQuery ($expr pipeline)", () => {
  test("empty conditions return null", () => {
    assert.strictEqual(addCampaignSettingPipelineQuery([], {}), null);
  });

  test("single condition uses [field, value] array form", () => {
    const q = addCampaignSettingPipelineQuery([cond({ conditionOperator: "LESS_THAN", conditionValue: 4 })], {});
    assert.deepStrictEqual(q, { $lt: ["$spend", 4] });
  });

  test("BETWEEN builds $and of $gte/$lte", () => {
    const q = addCampaignSettingPipelineQuery(
      [cond({ conditionOperator: "BETWEEN", conditionValue: 1, conditionMaxValue: 9 })],
      {}
    );
    assert.deepStrictEqual(q, { $and: [{ $gte: ["$spend", 1] }, { $lte: ["$spend", 9] }] });
  });

  test("unknown operator falls back to $eq", () => {
    const q = addCampaignSettingPipelineQuery([cond({ conditionOperator: "WEIRD", conditionValue: 2 })], {});
    assert.deepStrictEqual(q, { $eq: ["$spend", 2] });
  });

  test("ACOS uses the target ACOS when requested", () => {
    const q = addCampaignSettingPipelineQuery(
      [cond({ conditionType: "ACOS", conditionOperator: "GREATER_THAN", conditionValue: 1, useTargetAcos: true })],
      { targetAcos: 25 }
    );
    assert.deepStrictEqual(q, { $gt: ["$acos", 25] });
  });

  test("conditions are combined left to right with their operators", () => {
    const q = addCampaignSettingPipelineQuery(
      [
        cond({ conditionType: "Spend", conditionValue: 1 }),
        cond({ conditionType: "Clicks", conditionValue: 2, queryOperator: "AND" }),
        cond({ conditionType: "Orders", conditionValue: 3, queryOperator: "OR" }),
      ],
      {}
    );
    assert.deepStrictEqual(q, {
      $or: [{ $and: [{ $gt: ["$spend", 1] }, { $gt: ["$clicks", 2] }] }, { $gt: ["$orders", 3] }],
    });
  });

  test("non-metric condition types are skipped", () => {
    const q = addCampaignSettingPipelineQuery([{ conditionType: "Status", conditionStringValue: "X" }], {});
    assert.strictEqual(q, null);
  });
});
