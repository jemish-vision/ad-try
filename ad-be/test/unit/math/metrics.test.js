const { test, describe } = require("node:test");
const assert = require("node:assert");
const { aggregateTotals, calculateMetrics } = require("../../../api-server/helper/chatbotReporting.metrics");

const base = { spend: 50, sales: 200, orders: 4, clicks: 100, impressions: 10000 };

describe("Math: ACoS, RoAS, CTR, CPC", () => {
  test("calculates all ratios correctly", () => {
    const m = calculateMetrics(base);
    assert.strictEqual(m.acos.value, 25); // 50/200*100
    assert.strictEqual(m.roas.value, 4); // 200/50
    assert.strictEqual(m.ctr.value, 1); // 100/10000*100
    assert.strictEqual(m.cpc.value, 0.5); // 50/100
    assert.strictEqual(m.cvr.value, 4); // 4/100*100
    assert.strictEqual(m.aov.value, 50); // 200/4
    for (const k of ["acos", "roas", "ctr", "cpc"]) assert.strictEqual(m[k].status, "available");
  });

  test("units are correct per metric", () => {
    const m = calculateMetrics(base);
    assert.strictEqual(m.acos.unit, "percent");
    assert.strictEqual(m.ctr.unit, "percent");
    assert.strictEqual(m.roas.unit, "multiple");
    assert.strictEqual(m.cpc.unit, "currency");
  });

  test("zero sales: ACoS is null with no_sales, never Infinity/NaN", () => {
    const m = calculateMetrics({ ...base, sales: 0 });
    assert.strictEqual(m.acos.value, null);
    assert.strictEqual(m.acos.status, "no_sales");
    assert.strictEqual(m.roas.value, 0);
  });

  test("zero spend: RoAS is null with no_spend", () => {
    const m = calculateMetrics({ ...base, spend: 0 });
    assert.strictEqual(m.roas.value, null);
    assert.strictEqual(m.roas.status, "no_spend");
    assert.strictEqual(m.acos.value, 0);
  });

  test("zero clicks: CPC and CVR are null with no_clicks", () => {
    const m = calculateMetrics({ ...base, clicks: 0 });
    assert.strictEqual(m.cpc.value, null);
    assert.strictEqual(m.cpc.status, "no_clicks");
    assert.strictEqual(m.cvr.status, "no_clicks");
  });

  test("zero impressions: CTR is null with no_impressions", () => {
    const m = calculateMetrics({ ...base, impressions: 0 });
    assert.strictEqual(m.ctr.value, null);
    assert.strictEqual(m.ctr.status, "no_impressions");
  });

  test("zero orders: AOV is null with no_orders", () => {
    const m = calculateMetrics({ ...base, orders: 0 });
    assert.strictEqual(m.aov.value, null);
    assert.strictEqual(m.aov.status, "no_orders");
  });

  test("all zeros produce no NaN or Infinity anywhere", () => {
    const m = calculateMetrics({ spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
    for (const [k, v] of Object.entries(m)) {
      assert.ok(v.value === null || Number.isFinite(v.value), `${k} must be null or finite`);
    }
  });

  test("missing (null) input gives missing_data status", () => {
    const m = calculateMetrics({ ...base, sales: null });
    assert.strictEqual(m.acos.status, "missing_data");
    assert.strictEqual(m.acos.value, null);
    assert.strictEqual(m.sales.status, "missing_data");
  });

  test("ACoS over 100% is allowed (spend greater than sales)", () => {
    const m = calculateMetrics({ ...base, spend: 300, sales: 200 });
    assert.strictEqual(m.acos.value, 150);
  });

  test("decimal currency values", () => {
    const m = calculateMetrics({ spend: 12.5, sales: 50, orders: 2, clicks: 25, impressions: 1000 });
    assert.strictEqual(m.acos.value, 25);
    assert.strictEqual(m.cpc.value, 0.5);
    assert.strictEqual(m.roas.value, 4);
  });

  test("numeric overflow throws RangeError instead of returning Infinity", () => {
    assert.throws(() => calculateMetrics({ ...base, spend: Number.MAX_VALUE, sales: 1e-300 }), RangeError);
  });

  test("rejects negative, string and NaN values", () => {
    assert.throws(() => calculateMetrics({ ...base, spend: -1 }), TypeError);
    assert.throws(() => calculateMetrics({ ...base, spend: "50" }), TypeError);
    assert.throws(() => calculateMetrics({ ...base, spend: NaN }), TypeError);
    assert.throws(() => calculateMetrics({ ...base, spend: Infinity }), TypeError);
  });

  test("rejects fractional counts", () => {
    assert.throws(() => calculateMetrics({ ...base, clicks: 1.5 }), TypeError);
  });

  test("rejects non-object totals", () => {
    assert.throws(() => calculateMetrics(null), TypeError);
    assert.throws(() => calculateMetrics([]), TypeError);
  });
});

describe("Math: aggregateTotals", () => {
  test("sums rows", () => {
    const t = aggregateTotals([base, base]);
    assert.deepStrictEqual(t, { spend: 100, sales: 400, orders: 8, clicks: 200, impressions: 20000 });
  });

  test("empty rows give zeros", () => {
    assert.deepStrictEqual(aggregateTotals([]), { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
  });

  test("one null value makes that total null, others stay numeric", () => {
    const t = aggregateTotals([base, { ...base, sales: null }]);
    assert.strictEqual(t.sales, null);
    assert.strictEqual(t.spend, 100);
  });

  test("a row with a negative value is rejected", () => {
    assert.throws(() => aggregateTotals([base, { ...base, spend: -5 }]), TypeError);
  });

  test("rejects mixed grains", () => {
    assert.throws(() => aggregateTotals([{ ...base, grain: "day" }, { ...base, grain: "week" }]), TypeError);
  });

  test("rejects rows where only some declare a grain", () => {
    assert.throws(() => aggregateTotals([{ ...base, grain: "day" }, base]), TypeError);
  });

  test("accepts rows with the same grain", () => {
    const t = aggregateTotals([{ ...base, grain: "day" }, { ...base, grain: "day" }]);
    assert.strictEqual(t.spend, 100);
  });

  test("rejects non-array input and non-object rows", () => {
    assert.throws(() => aggregateTotals({}), TypeError);
    assert.throws(() => aggregateTotals([null]), TypeError);
  });

  test("aggregate then calculate works end-to-end", () => {
    const m = calculateMetrics(aggregateTotals([base, base]));
    assert.strictEqual(m.acos.value, 25);
    assert.strictEqual(m.roas.value, 4);
  });
});
