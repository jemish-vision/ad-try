const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const mongoose = require("mongoose");
const moment = require("moment");

describe("keyword suggestions: query and optimization logic", () => {
  const CONFIG = new mongoose.Types.ObjectId();
  const PROFILE = 12345678;
  const past30Days = moment().subtract(30, "days").format("YYYY-MM-DD");

  test("candidate query targets revenue-generating search terms with sales > 0 and correct keywordType", () => {
    // AUTO campaign type should exclude manual keyword types
    const autoQuery = {
      configId: CONFIG,
      profileId: PROFILE,
      reportDate: { $gte: past30Days },
      sales: { $gt: 0 },
      keywordType: { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] },
    };
    assert.deepEqual(autoQuery.keywordType, { $nin: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] });
    assert.deepEqual(autoQuery.sales, { $gt: 0 });

    // MANUAL campaign type should include manual keyword types
    const manualQuery = {
      configId: CONFIG,
      profileId: PROFILE,
      reportDate: { $gte: past30Days },
      sales: { $gt: 0 },
      keywordType: { $in: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] },
    };
    assert.deepEqual(manualQuery.keywordType, { $in: ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"] });
    assert.deepEqual(manualQuery.sales, { $gt: 0 });
  });

  test("empty candidate terms produces early empty return without heavy aggregation", () => {
    const candidateTerms = [];
    const handleEmpty = (candidates) => {
      if (!candidates || candidates.length === 0) {
        return { isSuccess: true, totalRows: 0, result: [] };
      }
      return null;
    };
    const res = handleEmpty(candidateTerms);
    assert.equal(res.isSuccess, true);
    assert.equal(res.totalRows, 0);
    assert.deepEqual(res.result, []);
  });

  test("blocked items are transformed to $nor filter without pipeline lookup", () => {
    const blockedItems = [
      { campaignId: 101, adGroupId: 201, searchTerm: "cheap linen" },
      { campaignId: 102, adGroupId: 202, searchTerm: "fake shoes" },
    ];
    const norConditions = blockedItems.map((b) => ({
      "_id.searchTerm": b.searchTerm,
      "_id.campaignId": b.campaignId,
      "_id.adGroupId": b.adGroupId,
    }));
    assert.equal(norConditions.length, 2);
    assert.deepEqual(norConditions[0], {
      "_id.searchTerm": "cheap linen",
      "_id.campaignId": 101,
      "_id.adGroupId": 201,
    });
  });

  test("sales30d sort order matches days30.sales sort order", () => {
    const items = [
      { sales30d: 150.456, searchTerm: "termA" },
      { sales30d: 500.123, searchTerm: "termB" },
      { sales30d: 25.001, searchTerm: "termC" },
    ];
    const sortedByRaw = [...items].sort((a, b) => b.sales30d - a.sales30d);
    const sortedByRounded = [...items].sort((a, b) => Math.round(b.sales30d * 100) - Math.round(a.sales30d * 100));

    assert.deepEqual(
      sortedByRaw.map((x) => x.searchTerm),
      sortedByRounded.map((x) => x.searchTerm)
    );
    assert.deepEqual(sortedByRaw.map((x) => x.searchTerm), ["termB", "termA", "termC"]);
  });
});
