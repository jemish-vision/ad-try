const { test, describe } = require("node:test");
const assert = require("node:assert");
const { sanitizeQueryObject, SAFE_OPERATORS } = require("../../../api-server/helper/sanitizeQuery");

describe("Filters: sanitizeQueryObject", () => {
  test("keeps whitelisted operators", () => {
    const q = { spend: { $gt: 10, $lte: 100 }, status: { $in: ["ENABLED"] } };
    assert.deepStrictEqual(sanitizeQueryObject(q), q);
  });

  test("removes dangerous operators ($where, $function, $accumulator)", () => {
    const out = sanitizeQueryObject({ status: "A", $where: "sleep(5000)", $function: {} });
    assert.deepStrictEqual(out, { status: "A" });
  });

  test("removes dangerous operators nested inside $and / $or arrays", () => {
    const out = sanitizeQueryObject({ $and: [{ a: 1 }, { $where: "1" }, { b: { $gt: 2 } }] });
    assert.deepStrictEqual(out, { $and: [{ a: 1 }, {}, { b: { $gt: 2 } }] });
  });

  test("removes dangerous operators deep in nested objects", () => {
    const out = sanitizeQueryObject({ a: { b: { $where: "x", c: 1 } } });
    assert.deepStrictEqual(out, { a: { b: { c: 1 } } });
  });

  test("keeps arithmetic operators used by $expr rules", () => {
    const q = { $expr: { $gt: [{ $divide: ["$spend", "$budget"] }, 0.8] } };
    assert.deepStrictEqual(sanitizeQueryObject(q), q);
  });

  test("handles primitives, null and undefined", () => {
    assert.strictEqual(sanitizeQueryObject(5), 5);
    assert.strictEqual(sanitizeQueryObject("x"), "x");
    assert.strictEqual(sanitizeQueryObject(null), null);
    assert.strictEqual(sanitizeQueryObject(undefined), undefined);
  });

  test("empty object and empty array stay empty", () => {
    assert.deepStrictEqual(sanitizeQueryObject({}), {});
    assert.deepStrictEqual(sanitizeQueryObject([]), []);
  });

  test("does not mutate the input", () => {
    const input = { a: 1, $where: "x" };
    sanitizeQueryObject(input);
    assert.deepStrictEqual(input, { a: 1, $where: "x" });
  });

  test("whitelist does not contain code-execution operators", () => {
    for (const bad of ["$where", "$function", "$accumulator", "$merge", "$out"]) {
      assert.ok(!SAFE_OPERATORS.has(bad), `${bad} must not be allowed`);
    }
  });
});
