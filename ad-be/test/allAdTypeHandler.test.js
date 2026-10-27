"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  withAllAdTypes,
  deriveStandardRatios,
  compareRows,
} = require("../api-server/helper/allAdTypeHandler");

// --- fake per-type data (plays the role of the three collections) ---------
const DATA = {
  SP: [
    { searchTerm: "sp-a", spend: 100, sales: 200, impressions: 10, clicks: 5, orders: 2 },
    { searchTerm: "sp-b", spend: 40, sales: 10, impressions: 4, clicks: 1, orders: 0 },
  ],
  SB: [
    { searchTerm: "sb-a", spend: 80, sales: 160, impressions: 8, clicks: 4, orders: 3 },
    { searchTerm: "sb-b", spend: 60, sales: 0, impressions: 6, clicks: 2, orders: 0 },
  ],
  SD: [{ searchTerm: "sd-a", spend: 999, sales: 1, impressions: 1, clicks: 1, orders: 1 }],
};

const BASE = ["impressions", "clicks", "orders", "spend", "sales"];

// A pure stand-in for a native list handler: no DB, honours the sort + the
// pagination window the wrapper passes, and returns the standard envelope
// (total count + KPI total row computed over the FULL set, independent of page).
function fakeHandler(req, res) {
  const rows = (DATA[req.adType] || []).map((r) => ({ ...r }));
  const field = req.body.fieldName || "spend";
  const dir = req.body.sortType === "ASC" ? "asc" : "desc";
  rows.sort(compareRows(field, dir));
  const pageNo = Number(req.body.pageNo) || 1;
  const perPage = Number(req.body.perPage) || 10;
  const page = rows.slice((pageNo - 1) * perPage, pageNo * perPage);

  const totals = {};
  for (const f of BASE) totals[f] = rows.reduce((s, r) => s + (r[f] || 0), 0);

  return res.status(200).send({
    isSuccess: true,
    totalSearchTerm: rows.length,
    getSearchTerm: page,
    totalRow: { ...totals, ...deriveStandardRatios(totals), isTotalRow: true },
    pageNo,
    perPage,
  });
}

function makeReq(adType, body) {
  return { adType, adTypes: [adType], body: { profileId: 1, ...body } };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.send = (b) => {
    res.body = b;
    return res;
  };
  res.json = res.send;
  return res;
}

const wrapped = withAllAdTypes(fakeHandler, {
  dataKey: "getSearchTerm",
  totalKey: "totalSearchTerm",
  totalRowKey: "totalRow",
  numericTotalFields: BASE,
  excludeSD: true,
});

test("single ad type is passed straight through, untouched", async () => {
  const res = makeRes();
  await wrapped(makeReq("SP", { pageNo: 1, perPage: 10 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalSearchTerm, 2);
  assert.equal(res.body.getSearchTerm.length, 2);
  // no "All" extras leak into a single-type response
  assert.equal(res.body.adTypes, undefined);
  assert.equal(res.body.excludedAdTypes, undefined);
});

test("All merges SP + SB, globally sorted and tagged, SD excluded", async () => {
  const res = makeRes();
  await wrapped(makeReq("All", { pageNo: 1, perPage: 10, fieldName: "spend", sortType: "DESC" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalSearchTerm, 4); // 2 SP + 2 SB, no SD
  const rows = res.body.getSearchTerm;
  assert.equal(rows.length, 4);
  // global descending spend order: sp-a 100, sb-a 80, sb-b 60, sp-b 40
  assert.deepEqual(rows.map((r) => r.searchTerm), ["sp-a", "sb-a", "sb-b", "sp-b"]);
  // each row tagged with its own ad type
  assert.equal(rows.find((r) => r.searchTerm === "sp-a").adType, "SP");
  assert.equal(rows.find((r) => r.searchTerm === "sb-a").adType, "SB");
  // SD reported as excluded, resolved types echoed
  assert.deepEqual(res.body.excludedAdTypes, ["SD"]);
  assert.deepEqual(res.body.adTypes, ["SP", "SB"]);
});

test("All totals are the summed base metrics with re-derived ratios", async () => {
  const res = makeRes();
  await wrapped(makeReq("All", { pageNo: 1, perPage: 10 }), res);
  const t = res.body.totalRow;
  // spend: 100+40+80+60 = 280 ; sales: 200+10+160+0 = 370
  assert.equal(t.spend, 280);
  assert.equal(t.sales, 370);
  assert.equal(t.clicks, 12);
  assert.equal(t.impressions, 28);
  assert.equal(t.orders, 5);
  assert.equal(t.acos, Number(((280 / 370) * 100).toFixed(2)));
  assert.equal(t.roas, Number((370 / 280).toFixed(2)));
  assert.equal(t.cpc, Number((280 / 12).toFixed(2)));
  assert.equal(t.ctr, Number(((12 / 28) * 100).toFixed(2)));
  assert.equal(t.isTotalRow, true);
});

test("pagination pages correctly across the union", async () => {
  const res = makeRes();
  await wrapped(makeReq("All", { pageNo: 2, perPage: 2, fieldName: "spend", sortType: "DESC" }), res);
  // page 2 of a 4-row union @2/page = the bottom two by spend
  assert.deepEqual(res.body.getSearchTerm.map((r) => r.searchTerm), ["sb-b", "sp-b"]);
  assert.equal(res.body.totalSearchTerm, 4);
  assert.equal(res.body.pageNo, 2);
  assert.equal(res.body.perPage, 2);
});

test("a failure from any single type is surfaced verbatim", async () => {
  const failingHandler = (req, res) => {
    if (req.adType === "SB") return res.status(500).send({ isSuccess: false, message: "boom" });
    return fakeHandler(req, res);
  };
  const w = withAllAdTypes(failingHandler, {
    dataKey: "getSearchTerm",
    totalKey: "totalSearchTerm",
    totalRowKey: "totalRow",
    numericTotalFields: BASE,
    excludeSD: true,
  });
  const res = makeRes();
  await w(makeReq("All", { pageNo: 1, perPage: 10 }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.isSuccess, false);
  assert.equal(res.body.message, "boom");
});

test("an early 203 (e.g. missing profile) from a type is surfaced", async () => {
  const guarded = (req, res) => {
    if (!req.body.profileId) return res.status(203).send({ isSuccess: false, message: "Profile id required." });
    return fakeHandler(req, res);
  };
  const w = withAllAdTypes(guarded, {
    dataKey: "getSearchTerm",
    totalKey: "totalSearchTerm",
    totalRowKey: "totalRow",
    numericTotalFields: BASE,
    excludeSD: true,
  });
  const res = makeRes();
  await w({ adType: "All", body: {} }, res);
  assert.equal(res.statusCode, 203);
  assert.equal(res.body.isSuccess, false);
});

test("All without excludeSD spans all three types", async () => {
  const w = withAllAdTypes(fakeHandler, {
    dataKey: "getSearchTerm",
    totalKey: "totalSearchTerm",
    totalRowKey: "totalRow",
    numericTotalFields: BASE,
  });
  const res = makeRes();
  await w(makeReq("All", { pageNo: 1, perPage: 10, fieldName: "spend", sortType: "DESC" }), res);
  assert.equal(res.body.totalSearchTerm, 5); // 2 + 2 + 1
  assert.equal(res.body.excludedAdTypes, undefined);
  assert.deepEqual(res.body.adTypes, ["SP", "SB", "SD"]);
  // sd-a has the highest spend (999) so it leads under DESC
  assert.equal(res.body.getSearchTerm[0].searchTerm, "sd-a");
  assert.equal(res.body.getSearchTerm[0].adType, "SD");
});

test("per-type fetch is capped at pageNo*perPage but totals stay whole", async () => {
  // Spy handler records the perPage it was asked for.
  const seen = [];
  const spy = (req, res) => {
    seen.push(req.body.perPage);
    return fakeHandler(req, res);
  };
  const w = withAllAdTypes(spy, {
    dataKey: "getSearchTerm",
    totalKey: "totalSearchTerm",
    totalRowKey: "totalRow",
    numericTotalFields: BASE,
    excludeSD: true,
  });
  const res = makeRes();
  await w(makeReq("All", { pageNo: 2, perPage: 2 }), res);
  // fetchLimit = pageNo*perPage = 4 for every sub-request
  assert.deepEqual(seen, [4, 4]);
  // counts still reflect the full set, not the cap
  assert.equal(res.body.totalSearchTerm, 4);
  assert.equal(res.body.totalRow.spend, 280);
});
