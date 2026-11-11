const { test, describe } = require("node:test");
const assert = require("node:assert");
const { sortAndPage, metricColumns } = require("../../../api-server/services/chatbotReporting/reportTable");

describe("Grids: sortAndPage & metricColumns (reportTable)", () => {
  const sampleRows = [
    { campaign: "Camp C", clicks: 50, spend: 100 },
    { campaign: "Camp A", clicks: 200, spend: 50 },
    { campaign: "Camp B", clicks: null, spend: 80 },
    { campaign: "Camp D", clicks: 150, spend: 30 },
  ];

  test("sortAndPage: pagination window and page metadata", () => {
    const res = sortAndPage(sampleRows, { offset: 0, limit: 2 });
    assert.strictEqual(res.rows.length, 2);
    assert.strictEqual(res.page.offset, 0);
    assert.strictEqual(res.page.limit, 2);
    assert.strictEqual(res.page.total, 4);
    assert.strictEqual(res.page.hasMore, true);

    const page2 = sortAndPage(sampleRows, { offset: 2, limit: 2 });
    assert.strictEqual(page2.rows.length, 2);
    assert.strictEqual(page2.page.hasMore, false);
  });

  test("sortAndPage: sorting numeric values with nulls last", () => {
    // Sort clicks ascending: Camp C(50), Camp D(150), Camp A(200), Camp B(null)
    const asc = sortAndPage(sampleRows, { offset: 0, limit: 4, sort: { field: "clicks", direction: "asc" } });
    assert.strictEqual(asc.rows[0].campaign, "Camp C");
    assert.strictEqual(asc.rows[1].campaign, "Camp D");
    assert.strictEqual(asc.rows[2].campaign, "Camp A");
    assert.strictEqual(asc.rows[3].campaign, "Camp B");

    // Sort clicks descending: Camp A(200), Camp D(150), Camp C(50), Camp B(null)
    const desc = sortAndPage(sampleRows, { offset: 0, limit: 4, sort: { field: "clicks", direction: "desc" } });
    assert.strictEqual(desc.rows[0].campaign, "Camp A");
    assert.strictEqual(desc.rows[1].campaign, "Camp D");
    assert.strictEqual(desc.rows[2].campaign, "Camp C");
    assert.strictEqual(desc.rows[3].campaign, "Camp B");
  });

  test("sortAndPage: tie-breaker stability using full row json", () => {
    const tiedRows = [
      { campaign: "Beta", score: 10 },
      { campaign: "Alpha", score: 10 },
    ];
    const res = sortAndPage(tiedRows, { offset: 0, limit: 2, sort: { field: "score", direction: "desc" } });
    // Stable alphabetical tie-breaker
    assert.strictEqual(res.rows[0].campaign, "Alpha");
    assert.strictEqual(res.rows[1].campaign, "Beta");
  });

  test("metricColumns: builds correct payload shape with dimension and metric metadata", () => {
    const request = {
      groupBy: ["campaign"],
      metrics: ["spend", "sales", "acos"],
    };

    const columns = metricColumns(request);
    assert.ok(Array.isArray(columns));

    const keys = columns.map(c => c.key);
    // Should include standard dimensions + grouping dimensions
    assert.ok(keys.includes("profileId"));
    assert.ok(keys.includes("campaignId"));
    assert.ok(keys.includes("name"));
    // Should include requested metrics
    assert.ok(keys.includes("spend"));
    assert.ok(keys.includes("sales"));
    assert.ok(keys.includes("acos"));

    // Verify column descriptor shape
    const spendCol = columns.find(c => c.key === "spend");
    assert.strictEqual(spendCol.type, "number");
    assert.strictEqual(spendCol.unit, "currency");
    assert.strictEqual(spendCol.nullable, true);

    const acosCol = columns.find(c => c.key === "acos");
    assert.strictEqual(acosCol.type, "number");
    assert.strictEqual(acosCol.unit, "percent");
  });
});
