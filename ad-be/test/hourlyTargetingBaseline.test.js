const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveHourlyTargetingBaseline: resolve, identityFor } = require("../api-server/helpers/hourlyTargetingBaseline");

const rule = { _id: "6ac900a4761189afacdd32c0", configId: "69809498df1b0ea4ae334fc5", profileId: 2630925322373862, isHourlyBid: true };
const targeting = { campaignId: 273977969274838, adGroupId: 123, targetId: "T-65636579401743", keywordBid: 3.95 };
const args = { rule, type: "SP", targeting };
function harness(rows = []) {
    const store = new Map();
    const calls = [];
    const baselineModel = {
        findById(id) { calls.push("read"); return { lean: async () => store.get(id) || null }; },
        findOneAndUpdate(query, update, options) {
            calls.push("freeze");
            return { lean: async () => {
                assert.equal(options.upsert, true);
                assert.equal(options.new, true);
                if (!store.has(query._id)) store.set(query._id, { ...update.$setOnInsert });
                return store.get(query._id);
            } };
        },
    };
    const historyModel = { aggregate(pipeline) {
        calls.push(pipeline[0].$match);
        assert.deepEqual(pipeline[1].$sort, { createdAt: -1, _id: -1 });
        assert.equal(pipeline[2].$project.metricsHistory, undefined);
        return { allowDiskUse() { return { cursor({ batchSize }) {
            assert.equal(batchSize, 256);
            return { async *[Symbol.asyncIterator]() { yield* rows; }, async close() { calls.push("close"); } };
        } }; } };
    } };
    return { baselineModel, historyModel, store, calls };
}
const initial = { _id: "1", createdAt: "2026-10-17T12:30:14Z", oldValue: "3.59", newValue: "3.95", isActive: true };
const reverted = { _id: "2", createdAt: "2026-10-17T18:30:12Z", oldValue: "3.95", newValue: "3.59", isActive: false, isReverted: true, metricsHistory: [{ eventType: "REVERT_TO_BASELINE" }] };
const corruptNoop = { _id: "3", createdAt: "2026-10-17T18:33:33Z", oldValue: "3.95", newValue: "3.95", isActive: true };

test("freezes before restoration and retains 3.59 across lifecycle closing, retry, and later 10% slot", async () => {
    const h = harness([initial]);
    assert.equal(await resolve({ ...args, existingActive: initial }, h), 3.59);
    h.historyModel.aggregate = () => { throw new Error("must use durable baseline after first freeze"); };
    const retry = await resolve({ ...args, targeting: { ...targeting, keywordBid: 3.95 } }, h);
    assert.equal(retry, 3.59);
    assert.equal(Number((retry * 1.1).toFixed(2)), 3.95);
    assert.notEqual(Number((retry * 1.1).toFixed(2)), 4.35);
    assert.equal(h.store.size, 1);
});

test("bootstraps observed midnight corruption from newest meaningful restore, not active no-op", async () => {
    const h = harness([corruptNoop, reverted, initial]);
    assert.equal(await resolve({ ...args, existingActive: corruptNoop }, h), 3.59);
    assert.equal([...h.store.values()][0].bootstrapSource, "RESTORED_BASELINE");
});

test("chooses newest epoch rather than oldest historical baseline", async () => {
    const h = harness([initial, { ...reverted, _id: "old", createdAt: "2025-01-01", newValue: "1.25" }]);
    assert.equal(await resolve(args, h), 3.59);
});

test("explicit manual boundary takes precedence over older automatic baseline", async () => {
    const manual = { ...corruptNoop, oldValue: "3.59", newValue: "5", metricsHistory: [{ eventType: "MANUAL_SNAPSHOT", notes: "Manual Run" }] };
    assert.equal(await resolve(args, harness([manual, reverted])), 5);
});

test("manual revert records restore oldValue; lifecycle reversion records restore newValue", async () => {
    assert.equal(await resolve(args, harness([{ ...reverted, metricsHistory: [] }])), 3.95);
    assert.equal(await resolve(args, harness([reverted])), 3.59);
});

for (const type of ["SP", "SB", "SD"]) {
    test(`${type} first execution rejects report-only bids until a baseline is verified`, async () => {
        const h = harness();
        const scoped = { ...args, type };
        await assert.rejects(resolve(scoped, h), /No verified hourly targeting baseline/);
        assert.equal(h.store.size, 0);
        h.store.set(identityFor(scoped)._id, { baselineBid: 3.59, bootstrapSource: "VERIFIED_OPERATOR_BID" });
        assert.equal(await resolve({ ...args, type }, h), 3.59);
    });
}

test("concurrent candidates converge on the same durable first-writer baseline", async () => {
    const h = harness([initial]);
    const result = await Promise.all([
        resolve({ ...args, targeting: { ...targeting, keywordBid: 3.59 } }, h),
        resolve({ ...args, targeting: { ...targeting, keywordBid: 3.95 } }, h),
    ]);
    assert.deepEqual(result, [3.59, 3.59]);
    assert.equal(h.store.size, 1);
});

test("handles Mongo duplicate-key upsert race by reading winner", async () => {
    const h = harness([initial]);
    h.baselineModel.findOneAndUpdate = (q) => ({ lean: async () => {
        h.store.set(q._id, { baselineBid: 3.59 });
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
    } });
    assert.equal(await resolve(args, h), 3.59);
});

test("manual and non-hourly preserve legacy arithmetic without any baseline/history access", async () => {
    const dependencies = { get baselineModel() { throw new Error("unexpected persistence"); } };
    assert.equal(await resolve({ ...args, isManual: true, existingActive: { oldValue: "2" } }, dependencies), 2);
    assert.equal(await resolve({ ...args, rule: { ...rule, isHourlyBid: false } }, dependencies), 3.95);
    for (const type of ["SB", "SD"]) {
        assert.equal(await resolve({ ...args, type, isManual: true, existingActive: { oldValue: "2" } }, dependencies), 3.95);
        assert.equal(await resolve({ ...args, type, rule: { ...rule, isHourlyBid: false }, existingActive: { oldValue: "2" } }, dependencies), 3.95);
    }
});

test("rejects invalid bids and persistence errors rather than submitting an unfrozen action", async () => {
    const unverified = harness();
    unverified.store.set(identityFor(args)._id, { baselineBid: 3.95, bootstrapSource: "FIRST_OBSERVED_BID" });
    await assert.rejects(resolve(args, unverified), /unverified report bid/);
    const h = harness([initial]);
    h.baselineModel.findOneAndUpdate = () => ({ lean: async () => { throw new Error("DB unavailable"); } });
    await assert.rejects(resolve(args, h), /DB unavailable/);
});

test("identity isolates rules, accounts, profiles, ad types, campaigns, ad groups and T/K namespaces", () => {
    const base = identityFor(args)._id;
    const variants = [
        { ...args, rule: { ...rule, _id: "other" } },
        { ...args, rule: { ...rule, configId: "other" } },
        { ...args, rule: { ...rule, profileId: 1 } },
        { ...args, type: "SB" },
        { ...args, targeting: { ...targeting, campaignId: 1 } },
        { ...args, targeting: { ...targeting, adGroupId: 1 } },
        { ...args, targeting: { ...targeting, targetId: "K-65636579401743" } },
    ];
    for (const value of variants) assert.notEqual(identityFor(value)._id, base);
});

test("prefixed entity bootstrap never queries ambiguous raw or opposite-namespace IDs", async () => {
    for (const prefix of ["T", "K"]) {
        const h = harness([initial]);
        await resolve({ ...args, targeting: { ...targeting, targetId: `${prefix}-65636579401743` } }, h);
        const query = h.calls.find(c => typeof c === "object");
        assert.deepEqual(query.targetId.$in, [`${prefix}-65636579401743`]);
        assert.equal(query.configId.constructor.name, "ObjectId");
        assert.equal(query.ruleId.constructor.name, "ObjectId");
    }
});

test("model disables automatic provisioning and requires no custom unique index", () => {
    const model = require("../api-server/models/hourlyTargetingBaseline.model");
    assert.equal(model.schema.options.autoIndex, false);
    assert.equal(model.schema.options.autoCreate, false);
    assert.deepEqual(model.schema.indexes(), []);
    assert.equal(model.schema.path("_id").instance, "String");
});


test("streams past 100,000 no-ops without truncation and closes after the meaningful original", async () => {
    const h = harness();
    let consumed = 0, closed = 0;
    h.historyModel.aggregate = pipeline => {
        assert.equal(pipeline[2].$project.metricsHistory, undefined);
        return { allowDiskUse() { return { cursor() { return {
            async *[Symbol.asyncIterator]() {
                for (let i = 0; i < 100000; i++) {
                    consumed++;
                    yield { _id: String(100001-i), oldValue: "3.95", newValue: "3.95", createdAt: new Date(200000-i) };
                }
                consumed++;
                yield { _id: "original", oldValue: "3.59", newValue: "3.95", createdAt: new Date(0) };
                throw new Error("must stop at first meaningful baseline");
            },
            async close() { closed++; },
        }; } }; } };
    };
    assert.equal(await resolve(args, h), 3.59);
    assert.equal(consumed, 100001);
    assert.equal(closed, 1);
});
