const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const { applyBidHistoryAcos } = require("../api-server/helper/historyBidAcos");

const bid = (day, oldValue, newValue, extra = {}) => ({
    changeType: "Update Targeting Bid",
    changeLevel: 100,
    adGroupId: 200,
    targeting: "close-match",
    matchType: "TARGETING_EXPRESSION",
    targetId: "T-300",
    createdAt: `2026-10-${day}T12:00:00Z`,
    oldValue,
    newValue,
    ...extra,
});
const report = (day, spend, sales, extra = {}) => ({
    campaignId: 100,
    adGroupId: 200,
    targeting: "close-match",
    matchType: "TARGETING_EXPRESSION_PREDEFINED",
    targetId: "300",
    reportDate: `2026-10-${day}`,
    spend,
    sales,
    ...extra,
});

test("uses the previous bid outside the result set and excludes the current day", () => {
    const first = bid("08", 6.42, 8.35);
    const second = bid("09", 8.35, 9);
    const third = bid("15", 9, 7.65);
    const reports = [
        report("08", 4, 20), report("08", 3, 10, { targetId: "R-300" }),
        report("09", 10, 20), report("10", 5, 80), report("15", 1000, 1000),
        report("10", 100, 100, { adGroupId: 201 }), report("10", 100, 100, { campaignId: 101 }),
    ];
    applyBidHistoryAcos([third, second, first], [second, third, first], { target: reports }, "UTC");
    assert.deepEqual([third.oldAcos, third.bidAcosFrom, third.bidAcosTo], [15, "2026-10-09", "2026-10-15"]);
    assert.deepEqual([second.oldAcos, second.bidAcosFrom, second.bidAcosTo], [20, "2026-10-08", "2026-10-09"]);
    assert.deepEqual([first.oldAcos, first.bidAcosFrom, first.bidAcosTo], [null, null, null]);
});

test("does not cross different real target IDs or ambiguous report-only aliases", () => {
    const first = bid("08", 1, 2);
    const second = bid("10", 2, 3);
    const other = bid("09", 7, 8, { targetId: "T-301" });
    const reports = [report("09", 4, 20), report("09", 90, 100, { targetId: "R-300" })];
    applyBidHistoryAcos([second], [first, second, other], { target: reports }, "UTC");
    assert.equal(second.oldAcos, 20);
});

test("ignores statuses, no-ops, and different ad groups when finding the prior bid", () => {
    const first = bid("08", 1, 2);
    const later = bid("11", 2, 3);
    const timeline = [
        first,
        bid("09", 2, 5, { changeType: "Update Targeting Status" }),
        bid("10", 2, 2),
        bid("10", 4, 5, { adGroupId: 201 }),
        later,
    ];
    applyBidHistoryAcos([later], timeline, { target: [report("08", 1, 10)] }, "UTC");
    assert.equal(later.oldAcos, 10);
    assert.equal(later.bidAcosFrom, "2026-10-08");
});

test("links tied timestamps by bid value without creating an intraday comparison", () => {
    const earlier = bid("23", 3.11, 3.8);
    const start = bid("23", 3.8, 3.08);
    const end = bid("28", 3.08, 3.03);
    const intraday = bid("28", 3.03, 3);
    applyBidHistoryAcos([end, intraday], [earlier, start, end, intraday], {
        target: [report("23", 5228.63, 29366.83)],
    }, "UTC");
    assert.deepEqual([end.oldAcos, end.bidAcosFrom, end.bidAcosTo], [17.8, "2026-10-23", "2026-10-28"]);
    assert.equal(intraday.oldAcos, null);
});

test("returns no comparison for a discontinuous bid chain", () => {
    const first = bid("08", 1, 2);
    const later = bid("11", 5, 6);
    applyBidHistoryAcos([later], [first, later], { target: [report("08", 1, 10)] }, "UTC");
    assert.deepEqual([later.oldAcos, later.bidAcosFrom, later.bidAcosTo], [null, null, null]);
});

test("uses profile dates and does not report intraday ACoS from daily reports", () => {
    const first = bid("09", 1, 2, { createdAt: "2026-10-08T20:00:00Z" });
    const later = bid("09", 2, 3, { createdAt: "2026-10-09T06:00:00Z" });
    applyBidHistoryAcos([later], [first, later], { target: [report("09", 1, 10)] }, "Asia/Kolkata");
    assert.deepEqual([later.oldAcos, later.bidAcosFrom, later.bidAcosTo], [null, "2026-10-09", "2026-10-09"]);
});

test("returns zero for report intervals with zero spend or zero sales", () => {
    const first = bid("08", 1, 2);
    const second = bid("09", 2, 3);
    const third = bid("11", 3, 4);
    applyBidHistoryAcos([second, third], [first, second, third], {
        target: [report("08", 0, 30), report("09", 4, 0)],
    }, "UTC");
    assert.equal(second.oldAcos, 0);
    assert.equal(third.oldAcos, 0);
});

test("uses placement and ad group reports separately and skips budgets", () => {
    const placement = { changeType: "Update Top of Search Placement Bid", targetId: null, targeting: null };
    const group = { changeType: "Update Default Bid", targetId: null, targeting: null };
    const placementFirst = bid("08", "10%", "20%", placement);
    const placementNext = bid("10", "20%", "30%", placement);
    const groupFirst = bid("08", 4, 5, group);
    const groupNext = bid("10", 5, 6, group);
    const budget = bid("10", 20, 30, { ...placement, changeType: "Update Budget" });
    applyBidHistoryAcos([placementNext, groupNext, budget], [placementFirst, groupFirst], {
        placement: [
            report("09", 5, 10, { placement: "PLACEMENT_TOP" }),
            report("09", 50, 100, { placement: "PLACEMENT_REST_OF_SEARCH" }),
        ],
        adGroup: [report("09", 3, 100), report("09", 50, 100, { adGroupId: 201 })],
    }, "UTC");
    assert.equal(placementNext.oldAcos, 50);
    assert.equal(groupNext.oldAcos, 3);
    assert.equal(budget.oldAcos, null);
});

test("targeting endpoint keeps fixed ACoS available and returns the exact bid comparison", async () => {
    const filename = path.join(__dirname, "../api-server/controllers/targeting.controller.js");
    const controller = fs.readFileSync(filename, "utf8");
    const source = controller.slice(controller.indexOf("exports.getTargetingHistory ="), controller.indexOf("\n/**\n * Reconciles and heals synthetic"));
    const context = { exports: {}, moment, mongoose, applyBidHistoryAcos, write_logs: () => {}, getProfile: async () => ({ timezone: "UTC" }) };
    const identity = { campaignId: "100", adGroupId: "200", targetId: "T-300", targeting: "close-match" };
    const history = [
        { ...identity, _id: "first", oldBid: 6.42, bid: 8.35, last_updated_date_time: "2026-10-08T12:00:00Z" },
        { ...identity, _id: "second", oldBid: 8.35, bid: 9, last_updated_date_time: "2026-10-09T12:00:00Z" },
    ];
    const query = rows => ({ sort() { return this; }, lean: async () => rows });
    context.targetingSchema = {
        findOne: () => query({ ...identity, matchType: "TARGETING_EXPRESSION_PREDEFINED" }),
        find: () => query([report("08", 5, 25), report("09", 5, 100), report("08", 500, 500, { adGroupId: 201 })]),
    };
    context.targetingHistorySchema = { find: () => query(history) };
    context.campaignChangeHistorySchema = { find: () => query([{
        _id: "second-echo", changeLevel: 100, targetId: "300", targeting: "close-match",
        changeType: "Update Targeting Bid", oldValue: "8.35", newValue: "9",
        createdAt: new Date("2026-10-09T12:00:30Z"),
    }]) };
    context.ruleActionExecutionSchema = { find: () => query([]) };
    vm.runInNewContext(source, context, { filename });

    const call = async oldAcosMode => {
        let response;
        await context.exports.getTargetingHistory({
            body: { targetId: "T-300", campaignId: 100, profileId: 1, oldAcosMode },
        }, { status(code) { assert.equal(code, 200); return this; }, send(body) { response = body; } });
        return response.data;
    };
    const comparisons = await call("bid-to-bid");
    assert.equal(comparisons.length, 2);
    const [second, first] = comparisons;
    assert.equal(second.oldAcos, 20);
    assert.equal(second.bidAcosFrom, "2026-10-08");
    assert.equal(second.bidAcosTo, "2026-10-09");
    assert.equal(first.oldAcos, null);
    const [fixedSecond] = await call(undefined);
    assert.notEqual(fixedSecond.oldAcos, second.oldAcos);
    assert.equal(fixedSecond.bidAcosFrom, undefined);
});
