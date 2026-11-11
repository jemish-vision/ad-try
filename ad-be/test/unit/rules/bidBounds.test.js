const { test, describe } = require("node:test");
const assert = require("node:assert");
// Stub Redis service before requiring common to prevent dangling sockets
require("../../helpers/stubRedisService");

const { applyMinMax } = require("../../../api-server/helper/common");

describe("Rule Engine: applyMinMax (Bid & Budget Bounds Safety)", () => {
  test("returns original value when within min and max", () => {
    assert.strictEqual(applyMinMax(1.5, 0.5, 3.0), 1.5);
    assert.strictEqual(applyMinMax(2.0, 1.0, 5.0), 2.0);
  });

  test("clamps to min when value is below minimum threshold", () => {
    assert.strictEqual(applyMinMax(0.2, 0.5, 3.0), 0.5);
    assert.strictEqual(applyMinMax(0.01, 0.1, 5.0), 0.1);
  });

  test("clamps to max when value is above maximum threshold", () => {
    assert.strictEqual(applyMinMax(4.5, 0.5, 3.0), 3.0);
    assert.strictEqual(applyMinMax(100.0, 1.0, 15.0), 15.0);
  });

  test("respects exact boundaries", () => {
    assert.strictEqual(applyMinMax(0.5, 0.5, 3.0), 0.5);
    assert.strictEqual(applyMinMax(3.0, 0.5, 3.0), 3.0);
  });

  test("handles undefined min (only max bound applies)", () => {
    assert.strictEqual(applyMinMax(0.05, undefined, 5.0), 0.05);
    assert.strictEqual(applyMinMax(6.5, undefined, 5.0), 5.0);
  });

  test("handles undefined max (only min bound applies)", () => {
    assert.strictEqual(applyMinMax(0.1, 0.5, undefined), 0.5);
    assert.strictEqual(applyMinMax(2.5, 0.5, undefined), 2.5);
  });

  test("handles both min and max undefined (returns original value untouched)", () => {
    assert.strictEqual(applyMinMax(7.25, undefined, undefined), 7.25);
  });

  test("works with decimal precision for bid calculations", () => {
    const rawMultiplierBid = Number((1.23 * 1.15).toFixed(2)); // 1.41
    const boundedBid = applyMinMax(rawMultiplierBid, 0.20, 2.50);
    assert.strictEqual(boundedBid, 1.41);
  });
});
