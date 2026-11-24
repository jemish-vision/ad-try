const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const mongoose = require("mongoose");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../api-server/constants/permissions");
const { ROLES } = require("../api-server/constants/roles");

function source(file) {
    return readFileSync(path.resolve(__dirname, "../api-server", file), "utf8");
}

const common = source("helper/common.js");
const { calcMetrics } = vm.runInNewContext(
    common.slice(common.indexOf("const calcMetrics ="), common.indexOf("const downloadFile =")) + "({ calcMetrics });"
);
const helper = { exports: {} };
vm.runInNewContext(source("helper/targetSearchTerms.js"), {
    module: helper,
    require: id => id === "./common" ? { calcMetrics } : require(id),
});

const controller = source("controllers/searchTerm.controller.js");
const handlerSource = controller.slice(
    controller.indexOf("function targetReportScope("),
    controller.indexOf("exports.cronGenerateSearchTermReport =")
);
const configId = new mongoose.Types.ObjectId();
const otherConfig = new mongoose.Types.ObjectId();
const validBody = { profileId: "1", campaignId: 2, adGroupId: 3, targetId: "T-4", adType: "SP" };
const dateRange = { fromDate: "2026-11-17", toDate: "2026-11-24" };

function setup(overrides = {}) {
    const calls = [];
    const model = type => ({
        aggregate: async pipeline => {
            calls.push({ type, pipeline });
            const terms = pipeline[0].$match.searchTerm.$in;
            const rows = [
                { _id: "red shoes", impressions: 20, clicks: 2, orders: 0, spend: 15, sales: 0 },
                { _id: "b01abcd123", isProductTarget: true, impressions: 10, clicks: 1, orders: 1, spend: 5, sales: 50 },
            ];
            if (!terms) return rows;
            rows.push({ _id: "boots" }, { _id: "basketball", isProductTarget: true });
            return rows.filter(row => terms.includes(row._id));
        },
    });
    const context = {
        exports: {}, mongoose, process, ROLES, SYSTEM_PAGES, PAGE_ACTIONS, calcMetrics,
        ...helper.exports,
        profileBasedPermissionSchema: { exists: async query => !!calls.push({ grant: query }) },
        profileSchema: { findOne: query => ({ lean: async () => {
            calls.push({ profile: query });
            return { amazonUrl: "https://advertising-api.example" };
        } }) },
        configSchema: { findById: () => ({ select: () => ({ lean: async () => ({ adsClientId: "client" }) }) }) },
        searchTermSchema: model("SP"),
        sbSearchTermSchema: model("SB"),
        checkPermission: async (...args) => {
            calls.push({ permission: args });
            return { hasPermission: true };
        },
        amazonAxios: async request => {
            calls.push({ request });
            const key = Object.keys(request.data)[0];
            return key === "negativeKeywords"
                ? { status: 207, data: { [key]: {
                    success: [{ index: 1 }],
                    error: [{ index: 0, errors: [{ errorType: "duplicateValueError" }] }],
                } } }
                : { status: 207, data: { [key]: { success: [{ index: 0 }] } } };
        },
        logAudit: async (event, message, metadata) => calls.push({ audit: event, metadata }),
        write_logs: () => {},
        ...overrides,
    };
    vm.runInNewContext(handlerSource, context);
    const run = async (handler, body, extra = {}) => {
        const res = {
            code: 200,
            status(code) { this.code = code; return this; },
            send(body) { this.body = body; return this; },
        };
        await context.exports[handler]({
            body, user: { _id: "user" }, config: { configId }, organizationId: "org", ...extra,
        }, res);
        return { code: res.code, body: JSON.parse(JSON.stringify(res.body)) };
    };
    return { run, calls };
}

test("read is scoped to authenticated profile, exact target and inclusive dates, with weighted totals", async () => {
    const { run, calls } = setup();
    const { code, body } = await run("getTargetSearchTerms", { ...validBody, ...dateRange, configId: otherConfig });
    assert.equal(code, 200);
    assert.equal(body.canNegate, true);
    assert.deepEqual(body.searchTerms.map(row => [row.searchTerm, row.isAsin]), [["red shoes", false], ["b01abcd123", true]]);
    assert.equal(body.totalRow.spend, 20);
    assert.equal(body.totalRow.acos, 40);
    const [{ grant }, { profile }, { pipeline }, { permission }] = calls;
    assert.equal(String(grant.configId), String(configId));
    assert.deepEqual([grant.profileId, grant.organizationId, profile.isActive], [1, "org", true]);
    const { $match: filter } = pipeline[0];
    assert.deepEqual([filter.campaignId, filter.adGroupId, filter.keywordId, filter.$or[0].prefix], [2, 3, 4, "T"]);
    assert.deepEqual(JSON.parse(JSON.stringify(filter.reportDate)), { $gte: dateRange.fromDate, $lte: dateRange.toDate });
    assert.equal(pipeline[2].$sort.spend, -1);
    assert.deepEqual(permission, ["user", SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.CREATE, true, "org"]);
});

test("SB lifetime reads the SB model without date bounds or write controls", async () => {
    const { run, calls } = setup();
    const { code, body } = await run("getTargetSearchTerms", { ...validBody, adType: "SB" });
    assert.equal(code, 200);
    assert.equal(body.canNegate, false);
    assert.equal(calls[2].type, "SB");
    assert.equal(calls[2].pipeline[0].$match.reportDate, undefined);
});

test("bad scope and missing exact-profile grant never query the report or Amazon", async () => {
    const { run, calls } = setup({ profileBasedPermissionSchema: { exists: async () => false } });
    for (const body of [
        { ...validBody, fromDate: "2026-11-01" },
        { ...validBody, fromDate: "2026-02-30", toDate: "2026-03-05" },
        { ...validBody, fromDate: "2026-03-30", toDate: "2026-03-01" },
        { ...validBody, targetId: { $ne: null } },
        { ...validBody, campaignId: "9007199254740993" },
        { ...validBody, adType: "SD" },
    ]) {
        assert.equal((await run("getTargetSearchTerms", body)).code, 400);
    }
    assert.equal((await run("getTargetSearchTerms", validBody)).code, 403);
    assert.equal(calls.length, 0);
});

test("mixed writes require report membership and use Amazon endpoint indexes for each result", async () => {
    const { run, calls } = setup();
    const terms = [
        { searchTerm: "red shoes", matchType: "NEGATIVE_EXACT" },
        { searchTerm: "b01abcd123", matchType: "ASIN_SAME_AS" },
        { searchTerm: "boots", matchType: "NEGATIVE_PHRASE" },
    ];
    const { code, body } = await run("negateTargetSearchTerms", { ...validBody, ...dateRange, terms });
    assert.equal(code, 200);
    assert.deepEqual(body.results.map(row => [row.searchTerm, row.success, row.status]), [
        ["red shoes", false, "DUPLICATE"], ["b01abcd123", true, "NEGATED"], ["boots", true, "NEGATED"],
    ]);
    const filter = calls.find(call => call.pipeline).pipeline[0].$match;
    assert.equal(filter.keywordId, 4);
    assert.equal(filter.reportDate.$gte, dateRange.fromDate);
    const [keywords, targets] = calls.filter(call => call.request).map(call => call.request);
    assert.equal(keywords.url, "https://advertising-api.example/sp/negativeKeywords");
    assert.deepEqual(JSON.parse(JSON.stringify(keywords.data.negativeKeywords[1])), {
        campaignId: "2", adGroupId: "3", state: "ENABLED", keywordText: "boots", matchType: "NEGATIVE_PHRASE",
    });
    assert.equal(targets.url, "https://advertising-api.example/sp/negativeTargets");
    assert.equal(targets.data.negativeTargetingClauses[0].expression[0].value, "B01ABCD123");
    assert.equal(calls.filter(call => call.audit).length, 2);
});

test("unobserved terms, disabled writes, demos and incompatible types never call Amazon", async () => {
    const { run, calls } = setup();
    const action = "negateTargetSearchTerms";
    const terms = [{ searchTerm: "red shoes", matchType: "NEGATIVE_EXACT" }];
    assert.equal((await run(action, { ...validBody, terms: [{ searchTerm: "other target", matchType: "NEGATIVE_EXACT" }] })).code, 400);
    assert.equal((await run(action, { ...validBody, terms: [{ searchTerm: "red shoes", matchType: "ASIN_SAME_AS" }] })).code, 400);
    assert.equal((await run(action, { ...validBody, terms: [{ searchTerm: "basketball", matchType: "ASIN_SAME_AS" }] })).code, 400);
    assert.equal((await run(action, { ...validBody, terms: [{ searchTerm: "b01abcd123", matchType: "NEGATIVE_EXACT" }] })).code, 400);
    assert.equal((await run(action, { ...validBody, adType: "SB", terms })).code, 403);
    assert.equal((await run(action, { ...validBody, terms }, { isMockTestingUser: true })).code, 403);
    assert.equal(calls.some(call => call.request), false);
    const denied = setup({ checkPermission: async () => ({ hasPermission: false }) });
    assert.equal((await denied.run(action, { ...validBody, terms })).code, 403);
    assert.equal(denied.calls.some(call => call.request), false);
});

test("an upstream batch failure leaves its results failed while the other batch still runs", async () => {
    const { run } = setup({
        amazonAxios: async ({ url }) => {
            if (url.endsWith("negativeKeywords")) throw Error("upstream timeout");
            return { status: 207, data: { negativeTargetingClauses: { createTargetSuccessResults: [{ index: 0 }] } } };
        },
    });
    const { body } = await run("negateTargetSearchTerms", {
        ...validBody,
        terms: [
            { searchTerm: "red shoes", matchType: "NEGATIVE_EXACT" },
            { searchTerm: "b01abcd123", matchType: "ASIN_SAME_AS" },
        ],
    });
    assert.deepEqual(body.results.map(row => row.status), ["FAILED", "NEGATED"]);
});

test("read supports backend pagination with page and pageSize", async () => {
    const { run } = setup();
    const { code, body } = await run("getTargetSearchTerms", { ...validBody, ...dateRange, page: 2, pageSize: 1 });
    assert.equal(code, 200);
    assert.equal(body.page, 2);
    assert.equal(body.pageSize, 1);
    assert.equal(body.totalRecords, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.searchTerms.length, 1);
    assert.equal(body.searchTerms[0].searchTerm, "b01abcd123");
});

test("read supports fetchAll to retrieve all records across pages for bulk selection", async () => {
    const { run } = setup();
    const { code, body } = await run("getTargetSearchTerms", { ...validBody, ...dateRange, fetchAll: true });
    assert.equal(code, 200);
    assert.equal(body.page, 1);
    assert.equal(body.totalRecords, 2);
    assert.equal(body.searchTerms.length, 2);
    assert.deepEqual(body.searchTerms.map(row => row.searchTerm).sort(), ["b01abcd123", "red shoes"]);
});

