const { test, describe, mock, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const root = path.resolve(__dirname, "../../../api-server");
const placementModel = require(path.join(root, "models/placementRules.model"));
const targetingModel = require(path.join(root, "models/targetingRuleSchema.model"));
const budgetModel = require(path.join(root, "models/budgetRules.model"));
const searchTermModel = require(path.join(root, "models/searchTermRules.model"));

const {
  checkDuplicatePlacementRule,
  checkDuplicateTargetingRule,
  checkDuplicateBudgetRule,
  checkDuplicateSearchTermRule,
  checkDuplicateDaypartingRule,
  checkDuplicateRecommandationRule,
  isDuplicatePlacementRule,
  isDuplicateBudgetRule,
} = require(path.join(root, "helper/ruleChecker"));

const c = (over = {}) => ({
  conditionType: "Spend",
  conditionStatus: "ENABLED",
  conditionStringValue: "x",
  conditionOperator: "GREATER_THAN",
  conditionValue: 10,
  conditionValueType: "NUMBER",
  ...over,
});
const rule = (id, conditions, extra = {}) => ({ _id: id, conditions, ...extra });

describe("Logic: placement rule duplicate detection (normalization + dedupe)", () => {
  test("identical conditions are a duplicate and the matching rule is returned", () => {
    const existing = rule("r1", [c()]);
    assert.strictEqual(checkDuplicatePlacementRule([existing], [c()]), existing);
  });

  test("condition ORDER does not matter", () => {
    const a = c({ conditionType: "Spend" });
    const b = c({ conditionType: "Clicks", conditionOperator: "LESS_THAN" });
    const existing = rule("r1", [a, b]);
    assert.ok(checkDuplicatePlacementRule([existing], [b, a]));
  });

  test("a different condition type is not a duplicate", () => {
    assert.strictEqual(checkDuplicatePlacementRule([rule("r1", [c()])], [c({ conditionType: "Clicks" })]), false);
  });

  test("a different operator is not a duplicate", () => {
    assert.strictEqual(
      checkDuplicatePlacementRule([rule("r1", [c()])], [c({ conditionOperator: "LESS_THAN" })]),
      false
    );
  });

  test("the threshold value is ignored: same type and operator with another value IS a duplicate", () => {
    assert.ok(checkDuplicatePlacementRule([rule("r1", [c({ conditionValue: 10 })])], [c({ conditionValue: 999 })]));
  });

  test("different number of conditions is not a duplicate", () => {
    assert.strictEqual(checkDuplicatePlacementRule([rule("r1", [c()])], [c(), c({ conditionType: "Clicks" })]), false);
  });

  test("the rule being edited is excluded (excludeRuleId), string or ObjectId-like", () => {
    const existing = rule("r1", [c()]);
    assert.strictEqual(checkDuplicatePlacementRule([existing], [c()], "r1"), false);
    assert.strictEqual(checkDuplicatePlacementRule([rule({ toString: () => "r1" }, [c()])], [c()], "r1"), false);
  });

  test("another rule with the same conditions still matches when editing a different rule", () => {
    const other = rule("r2", [c()]);
    assert.strictEqual(checkDuplicatePlacementRule([rule("r1", [c()]), other], [c()], "r1"), other);
  });

  test("no existing rules, or rules without conditions, give false", () => {
    assert.strictEqual(checkDuplicatePlacementRule([], [c()]), false);
    assert.strictEqual(checkDuplicatePlacementRule([{ _id: "r1" }], [c()]), false);
  });

  test("numbers and numeric strings normalize to the same type string", () => {
    const existing = rule("r1", [c({ conditionType: 5 })]);
    assert.ok(checkDuplicatePlacementRule([existing], [c({ conditionType: "5" })]));
  });

  test("normalization does not change the caller's data", () => {
    const incoming = [c({ conditionType: "B" }), c({ conditionType: "A" })];
    const copy = JSON.parse(JSON.stringify(incoming));
    checkDuplicatePlacementRule([rule("r1", incoming)], incoming);
    assert.deepStrictEqual(incoming, copy);
  });

  test("matching is case-sensitive today (GREATER_THAN vs greater_than differ)", () => {
    assert.strictEqual(
      checkDuplicatePlacementRule([rule("r1", [c()])], [c({ conditionOperator: "greater_than" })]),
      false
    );
  });
});

describe("Logic: targeting rule duplicate detection", () => {
  test("also compares conditionStatus", () => {
    const existing = rule("r1", [c({ conditionStatus: "ENABLED" })]);
    assert.ok(checkDuplicateTargetingRule([existing], [c({ conditionStatus: "ENABLED" })]));
    assert.strictEqual(checkDuplicateTargetingRule([existing], [c({ conditionStatus: "PAUSED" })]), false);
  });

  test("order independent, excludeRuleId honored", () => {
    const a = c({ conditionType: "Spend" });
    const b = c({ conditionType: "Orders" });
    assert.ok(checkDuplicateTargetingRule([rule("r1", [a, b])], [b, a]));
    assert.strictEqual(checkDuplicateTargetingRule([rule("r1", [a, b])], [b, a], "r1"), false);
  });
});

describe("Logic: budget rule duplicate detection", () => {
  test("also compares conditionStringValue", () => {
    const existing = rule("r1", [c({ conditionStringValue: "A" })]);
    assert.ok(checkDuplicateBudgetRule([existing], [c({ conditionStringValue: "A" })]));
    assert.strictEqual(checkDuplicateBudgetRule([existing], [c({ conditionStringValue: "B" })]), false);
  });
});

describe("Logic: search term and recommendation duplicate detection", () => {
  test("search term: same type and operator is a duplicate, other type is not", () => {
    const existing = rule("r1", [c()]);
    assert.ok(checkDuplicateSearchTermRule([existing], [c()]));
    assert.strictEqual(checkDuplicateSearchTermRule([existing], [c({ conditionType: "Clicks" })]), false);
  });

  test("recommendation: grid name must match as well", () => {
    const existing = rule("r1", [c()], { gridName: "campaign" });
    assert.ok(checkDuplicateRecommandationRule([existing], [c()], "campaign"));
    assert.strictEqual(checkDuplicateRecommandationRule([existing], [c()], "keyword"), false);
  });

  test("recommendation: rules with no grid name are skipped", () => {
    assert.strictEqual(checkDuplicateRecommandationRule([rule("r1", [c()])], [c()], "campaign"), false);
  });
});

describe("Logic: dayparting slot duplicate detection", () => {
  const slot = (over = {}) => ({ startTime: "09:00", endTime: "12:00", multiplier: 1.5, enabled: true, ...over });

  test("same slots and type is a duplicate", () => {
    const existing = { _id: "r1", type: "campaign", slots: [slot()] };
    assert.strictEqual(checkDuplicateDaypartingRule([existing], [slot()], "campaign"), existing);
  });

  test("slot order does not matter", () => {
    const s1 = slot();
    const s2 = slot({ startTime: "13:00", endTime: "18:00" });
    const existing = { _id: "r1", type: "campaign", slots: [s1, s2] };
    assert.ok(checkDuplicateDaypartingRule([existing], [s2, s1], "campaign"));
  });

  test("different type, time or multiplier is not a duplicate", () => {
    const existing = { _id: "r1", type: "campaign", slots: [slot()] };
    assert.strictEqual(checkDuplicateDaypartingRule([existing], [slot()], "adgroup"), false);
    assert.strictEqual(checkDuplicateDaypartingRule([existing], [slot({ startTime: "10:00" })], "campaign"), false);
    assert.strictEqual(checkDuplicateDaypartingRule([existing], [slot({ endTime: "13:00" })], "campaign"), false);
    assert.strictEqual(checkDuplicateDaypartingRule([existing], [slot({ multiplier: 2 })], "campaign"), false);
  });

  test("different slot count is not a duplicate", () => {
    const existing = { _id: "r1", type: "campaign", slots: [slot()] };
    assert.strictEqual(checkDuplicateDaypartingRule([existing], [slot(), slot({ startTime: "20:00" })], "campaign"), false);
  });

  test("multiplier strings and numbers compare equal", () => {
    const existing = { _id: "r1", type: "campaign", slots: [slot({ multiplier: "1.5" })] };
    assert.ok(checkDuplicateDaypartingRule([existing], [slot({ multiplier: 1.5 })], "campaign"));
  });

  test("rules without slots or type are skipped", () => {
    assert.strictEqual(checkDuplicateDaypartingRule([{ _id: "r1", type: "campaign" }], [slot()], "campaign"), false);
    assert.strictEqual(checkDuplicateDaypartingRule([{ _id: "r1", slots: [slot()] }], [slot()], "campaign"), false);
  });
});

describe("Logic: async isDuplicate* wrappers query by owner and return a boolean", () => {
  afterEach(() => mock.restoreAll());

  const stubFind = (model, rules) =>
    mock.method(model, "find", () => ({ lean: async () => rules }));

  test("placement: true when a matching rule exists, queried by config, user and profile", async () => {
    const find = stubFind(placementModel, [rule("r1", [c()])]);
    assert.strictEqual(await isDuplicatePlacementRule("cfg", "usr", 123, [c()]), true);
    assert.deepStrictEqual(find.mock.calls[0].arguments[0], { configId: "cfg", userId: "usr", profileId: 123 });
  });

  test("placement: false when nothing matches", async () => {
    stubFind(placementModel, [rule("r1", [c({ conditionType: "Clicks" })])]);
    assert.strictEqual(await isDuplicatePlacementRule("cfg", "usr", 123, [c()]), false);
  });
});

void targetingModel;
void budgetModel;
void searchTermModel;
