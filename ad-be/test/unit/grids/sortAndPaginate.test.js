const { test, describe } = require("node:test");
const assert = require("node:assert");
const { sortAndPaginate } = require("../../../api-server/helper/adTypeResolver");

describe("Grids: sortAndPaginate (adTypeResolver)", () => {
  const sampleData = [
    { id: 1, name: "Campaign Gamma", spend: 300, acos: 25.5 },
    { id: 2, name: "Campaign Alpha", spend: 100, acos: 15.0 },
    { id: 3, name: "Campaign Beta", spend: 200, acos: null },
    { id: 4, name: "Campaign Delta", spend: 50, acos: 40.0 },
    { id: 5, name: "Campaign Epsilon", spend: null, acos: 10.0 },
  ];

  test("Pagination: first page with limit", () => {
    const result = sortAndPaginate(sampleData, { skip: 0, limit: 2 });
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.total, 5);
    assert.strictEqual(result.hasMore, true);
    assert.strictEqual(result.rows[0].id, 1);
    assert.strictEqual(result.rows[1].id, 2);
  });

  test("Pagination: middle and last page", () => {
    const page2 = sortAndPaginate(sampleData, { skip: 2, limit: 2 });
    assert.strictEqual(page2.rows.length, 2);
    assert.strictEqual(page2.rows[0].id, 3);
    assert.strictEqual(page2.rows[1].id, 4);
    assert.strictEqual(page2.hasMore, true);

    const lastPage = sortAndPaginate(sampleData, { skip: 4, limit: 2 });
    assert.strictEqual(lastPage.rows.length, 1);
    assert.strictEqual(lastPage.rows[0].id, 5);
    assert.strictEqual(lastPage.hasMore, false);
  });

  test("Pagination: skip beyond total returns empty rows", () => {
    const result = sortAndPaginate(sampleData, { skip: 10, limit: 5 });
    assert.deepStrictEqual(result.rows, []);
    assert.strictEqual(result.total, 5);
    assert.strictEqual(result.hasMore, false);
  });

  test("Pagination: negative or invalid skip defaults to 0", () => {
    const resNegative = sortAndPaginate(sampleData, { skip: -5, limit: 2 });
    assert.strictEqual(resNegative.rows.length, 2);
    assert.strictEqual(resNegative.rows[0].id, 1);

    const resInvalid = sortAndPaginate(sampleData, { skip: "not-a-number", limit: 2 });
    assert.strictEqual(resInvalid.rows.length, 2);
    assert.strictEqual(resInvalid.rows[0].id, 1);
  });

  test("Pagination: undefined limit returns all rows from skip", () => {
    const result = sortAndPaginate(sampleData, { skip: 2 });
    assert.strictEqual(result.rows.length, 3);
    assert.strictEqual(result.total, 5);
    assert.strictEqual(result.hasMore, false);
  });

  test("Sorting: numeric ascending and descending", () => {
    const asc = sortAndPaginate(sampleData, { sortField: "spend", sortDir: "asc" });
    assert.strictEqual(asc.rows[0].spend, 50);
    assert.strictEqual(asc.rows[1].spend, 100);
    assert.strictEqual(asc.rows[2].spend, 200);
    assert.strictEqual(asc.rows[3].spend, 300);
    // Nulls sort last in both directions
    assert.strictEqual(asc.rows[4].spend, null);

    const desc = sortAndPaginate(sampleData, { sortField: "spend", sortDir: "desc" });
    assert.strictEqual(desc.rows[0].spend, 300);
    assert.strictEqual(desc.rows[1].spend, 200);
    assert.strictEqual(desc.rows[2].spend, 100);
    assert.strictEqual(desc.rows[3].spend, 50);
    assert.strictEqual(desc.rows[4].spend, null);
  });

  test("Sorting: string alphabetical ascending and descending", () => {
    const asc = sortAndPaginate(sampleData, { sortField: "name", sortDir: "asc" });
    assert.strictEqual(asc.rows[0].name, "Campaign Alpha");
    assert.strictEqual(asc.rows[1].name, "Campaign Beta");
    assert.strictEqual(asc.rows[2].name, "Campaign Delta");

    const desc = sortAndPaginate(sampleData, { sortField: "name", sortDir: "desc" });
    assert.strictEqual(desc.rows[0].name, "Campaign Gamma");
    assert.strictEqual(desc.rows[1].name, "Campaign Epsilon");
    assert.strictEqual(desc.rows[2].name, "Campaign Delta");
  });

  test("Sorting + Pagination combined", () => {
    // Sort by spend desc: [Gamma(300), Beta(200), Alpha(100), Delta(50), Epsilon(null)]
    const page1 = sortAndPaginate(sampleData, { sortField: "spend", sortDir: "desc", skip: 0, limit: 2 });
    assert.strictEqual(page1.rows.length, 2);
    assert.strictEqual(page1.rows[0].name, "Campaign Gamma");
    assert.strictEqual(page1.rows[1].name, "Campaign Beta");

    const page2 = sortAndPaginate(sampleData, { sortField: "spend", sortDir: "desc", skip: 2, limit: 2 });
    assert.strictEqual(page2.rows.length, 2);
    assert.strictEqual(page2.rows[0].name, "Campaign Alpha");
    assert.strictEqual(page2.rows[1].name, "Campaign Delta");
  });

  test("Safety: handles empty rows or non-array inputs gracefully", () => {
    const empty = sortAndPaginate([], { skip: 0, limit: 10 });
    assert.deepStrictEqual(empty.rows, []);
    assert.strictEqual(empty.total, 0);
    assert.strictEqual(empty.hasMore, false);

    const nonArray = sortAndPaginate(null, { skip: 0, limit: 10 });
    assert.deepStrictEqual(nonArray.rows, []);
    assert.strictEqual(nonArray.total, 0);
    assert.strictEqual(nonArray.hasMore, false);
  });
});
