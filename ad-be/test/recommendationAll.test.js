"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeRecommendationCountsByRule } = require("../api-server/helper/recommendationMerge");
const { withAllAdTypesItemList } = require("../api-server/helper/allAdTypeHandler");

// --- mergeRecommendationCountsByRule --------------------------------------

test("merge sums count/newCount by rule across ad types", () => {
  const sp = [
    { rule: { _id: "r1", ruleName: "A" }, fromDate: "d1", toDate: "d2", count: 10, newCount: 3 },
    { rule: { _id: "r2", ruleName: "B" }, fromDate: "d1", toDate: "d2", count: 5, newCount: 1 },
  ];
  const sb = [
    { rule: { _id: "r1", ruleName: "A" }, fromDate: "d1", toDate: "d2", count: 7, newCount: 2 },
  ];
  const sd = [
    { rule: { _id: "r3", ruleName: "C" }, fromDate: "d1", toDate: "d2", count: 4, newCount: 0 },
  ];
  const merged = mergeRecommendationCountsByRule([sp, sb, sd]);
  const byId = Object.fromEntries(merged.map((m) => [String(m.rule._id), m]));
  assert.equal(byId.r1.count, 17); // 10 + 7
  assert.equal(byId.r1.newCount, 5); // 3 + 2
  assert.equal(byId.r2.count, 5); // SP only
  assert.equal(byId.r3.count, 4); // SD only
  assert.equal(merged.length, 3);
  // date window + name preserved from first occurrence
  assert.equal(byId.r1.ruleName || byId.r1.rule.ruleName, "A");
  assert.equal(byId.r1.fromDate, "d1");
});

test("merge handles empty / missing lists and non-rule items", () => {
  assert.deepEqual(mergeRecommendationCountsByRule([]), []);
  assert.deepEqual(mergeRecommendationCountsByRule([null, undefined]), []);
  const out = mergeRecommendationCountsByRule([[{ count: 1 }, { rule: { _id: "x" }, count: 2 }]]);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 2);
});

test("merge keeps single-type result equivalent to passthrough", () => {
  const sp = [{ rule: { _id: "r1" }, count: 9, newCount: 4 }];
  const merged = mergeRecommendationCountsByRule([sp]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 9);
  assert.equal(merged[0].newCount, 4);
});

// --- withAllAdTypesItemList ------------------------------------------------

const ITEMS = {
  SP: [
    { id: "sp1", isNew: false },
    { id: "sp2", isNew: true },
  ],
  SB: [
    { id: "sb1", isNew: true },
  ],
  SD: [
    { id: "sd1", isNew: false },
  ],
};

// A fake per-rule item handler: returns ALL items when page/perPage are 0,
// plus the count fields the real endpoint carries.
function fakeItemHandler(req, res) {
  const rows = (ITEMS[req.adType] || []).map((r) => ({ ...r }));
  const page = Number(req.body.page) || 0;
  const perPage = Number(req.body.perPage) || 0;
  const data = page > 0 && perPage > 0 ? rows.slice((page - 1) * perPage, page * perPage) : rows;
  return res.status(200).send({
    isSuccess: true,
    data,
    count: rows.length,
    totalRecords: rows.length,
    validCount: rows.length,
    lessThanOneCount: 0,
    totalAllRecords: rows.length,
    currentPage: page || 1,
    perPage: perPage || rows.length,
    totalPages: 1,
  });
}

function makeReq(adType, body) {
  return { adType, adTypes: [adType], body: { profileId: 1, ...body } };
}
function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.send = (b) => ((res.body = b), res);
  res.json = res.send;
  return res;
}

const wrapped = withAllAdTypesItemList(fakeItemHandler, {
  dataKey: "data",
  countFields: ["count", "totalRecords", "validCount", "lessThanOneCount", "totalAllRecords"],
  totalKey: "totalRecords",
  pageNoKey: "currentPage",
  perPageKey: "perPage",
  totalPagesKey: "totalPages",
});

test("item list: single type passthrough", async () => {
  const res = makeRes();
  await wrapped(makeReq("SP", { page: 1, perPage: 10 }), res);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.adTypes, undefined);
});

test("item list: All combines all types, new rows first, sums counts", async () => {
  const res = makeRes();
  await wrapped(makeReq("All", {}), res); // no paging → all items
  assert.equal(res.body.totalRecords, 4); // 2 + 1 + 1
  assert.equal(res.body.validCount, 4);
  // new rows float to the front (sp2, sb1), preserving original order otherwise
  assert.deepEqual(res.body.data.map((r) => r.id), ["sp2", "sb1", "sp1", "sd1"]);
  // rows tagged with their ad type
  assert.equal(res.body.data.find((r) => r.id === "sb1").adType, "SB");
  assert.deepEqual(res.body.adTypes, ["SP", "SB", "SD"]);
});

test("item list: All paginates the combined set", async () => {
  const res = makeRes();
  await wrapped(makeReq("All", { page: 2, perPage: 2 }), res);
  // combined order [sp2,sb1,sp1,sd1] → page 2 of 2 = [sp1, sd1]
  assert.deepEqual(res.body.data.map((r) => r.id), ["sp1", "sd1"]);
  assert.equal(res.body.totalRecords, 4);
  assert.equal(res.body.currentPage, 2);
  assert.equal(res.body.totalPages, 2);
});

test("item list: SP+SB-only rule (excludeSD) reports SD excluded", async () => {
  const w = withAllAdTypesItemList(fakeItemHandler, {
    dataKey: "data",
    countFields: ["totalRecords"],
    excludeSD: true,
  });
  const res = makeRes();
  await w(makeReq("All", {}), res);
  assert.equal(res.body.totalRecords, 3); // SP(2)+SB(1), no SD
  assert.deepEqual(res.body.excludedAdTypes, ["SD"]);
});
