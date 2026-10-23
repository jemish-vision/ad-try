const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const configId = '69809498df1b0ea4ae334fc5';
const profileId = 123;
function fixture({ campaigns = [{ campaignId: 1, status: 'ENABLED' }], adGroups = [{ adGroupId: 2, status: 'ENABLED' }], targets = [{ campaignId: 1, adGroupId: 2, targetId: 3 }], candidates = [{ _id: { campaignId: 1, adGroupId: 2, targetId: 3 } }], statuses = [], ruleCount = 1, historyWrite, auditWrite } = {}) {
    let queries = [];
    let aggregateCount = 0;
    let consumed = 0;
    let closed = 0;
    const writes = [];
    const historyWrites = [];
    const auditBatches = [];
    const pipelines = [];
    let rules = Array.from({ length: ruleCount }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), configId: new mongoose.Types.ObjectId(configId), profileId, gridName: 'Targeting', reportDate: 'LAST_7_DAYS', timezone: 'Asia/Kolkata', ruleName: 'rule' + i }));
    const find = (kind, rows) => (filter) => { queries.push({ kind, filter }); return { lean: async () => typeof rows === 'function' ? rows() : rows }; };
    const models = { adTypeCampaignSchema: { find: find('campaign', campaigns) }, adTypeAdGroupSchema: { find: find('adGroup', adGroups) }, adTypeTargetingSchema: { find: find('target', targets), aggregate(pipeline) {
                aggregateCount++;
                pipelines.push(pipeline);
                assert.ok(pipeline[0].$match.configId instanceof mongoose.Types.ObjectId);
                const query = {
                    allowDiskUse() { return this; },
                    then(resolve, reject) { return Promise.resolve(candidates).then(resolve, reject); },
                    cursor({ batchSize }) {
                        assert.ok(batchSize > 0);
                        return {
                            async *[Symbol.asyncIterator]() { for (const row of candidates) {
                                consumed++;
                                yield row;
                            } },
                            async close() { closed++; }
                        };
                    }
                };
                return query;
            } } };
    const mockedRequire = name => {
        if (name === 'mongoose')
            return mongoose;
        if (name === 'moment')
            return moment;
        if (name === 'p-limit')
            return { default: () => fn => fn() };
        if (name === '../helper/common')
            return { getRuleDate: () => ({ fromDate: '2026-10-09', toDate: '2026-10-16' }), safeJsonParse: v => v };
        if (name === '../models/recomandationRules.model')
            return { find: find('rule', () => rules), findOne: () => ({ lean: async () => rules[0] }) };
        if (name === '../models/recommandationCampaignByRule.model')
            return { bulkWrite: async (ops) => {
                    historyWrites.push(ops);
                    if (historyWrite)
                        await historyWrite(ops);
                    return { modifiedCount: ops.length };
                } };
        if (name === '../helpers/auditHelper')
            return { logAudit: async () => { }, logAuditBatch: async (entries) => {
                    auditBatches.push(entries);
                    if (auditWrite)
                        await auditWrite(entries);
                } };
        if (name === '../models/recommandationStatus.model')
            return { find: find('status', statuses), exists: async () => false, bulkWrite: async (ops) => { writes.push(ops); return { modifiedCount: 0 }; } };
        if (name === '../helper/sanitizeQuery')
            return require('../api-server/helper/sanitizeQuery');
        if (name === '../helper/adTypeCollections')
            return { SP: { campaign: 'campaigns', adGroup: 'ad_groups', targeting: 'targetings' } };
        if (name.includes('logger'))
            return { recommendation_logs: () => { } };
        if (name.includes('redis'))
            throw new Error('Recommendation endpoints must not depend on Redis');
        return {};
    };
    const context = { exports: {}, require: mockedRequire, process, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/controllers/recommendation.controller.js'), 'utf8'), context);
    context.recommendationPipeline = context.exports.recommendationPipeline;
    const request = { config: { configId }, body: { profileId }, params: { ruleId: String(rules[0]._id) }, adType: 'SP', user: { id: '695666084b7687741f926dda' }, models };
    const call = async (name = 'getTotalRecommendationCount', req = request) => { let body; await context.exports[name](req, { status() { return this; }, send(v) { body = v; } }); return body; };
    return { call, queries, request, writes, pipelines, historyWrites, auditBatches, api: context.exports, get consumed() { return consumed; }, get closed() { return closed; }, get aggregateCount() { return aggregateCount; }, setRules: v => rules = v };
}
test('repeated requests read Mongo again and immediately observe changed status', async () => {
    const campaigns = [{ campaignId: 1, status: 'ENABLED' }];
    const f = fixture({ campaigns });
    assert.equal((await f.call()).rules[0].count, 1);
    campaigns[0].status = 'PAUSED';
    assert.equal((await f.call()).rules[0].count, 0);
    assert.equal(f.aggregateCount, 2);
});
test('eligibility reads are shared only within a request and scoped to the selected account/date', async () => {
    const f = fixture({ ruleCount: 3 });
    await f.call();
    for (const kind of ['campaign', 'adGroup', 'target']) {
        const reads = f.queries.filter(q => q.kind === kind);
        assert.equal(reads.length, 1);
        assert.equal(reads[0].filter.configId, configId);
        assert.equal(reads[0].filter.profileId, profileId);
        assert.equal(reads[0].filter.reportDate, '2026-10-16');
    }
    await f.call();
    assert.equal(f.queries.filter(q => q.kind === 'campaign').length, 2);
});
test('counts exclude paused campaigns, paused groups, missing and wrong-identity targets', async () => {
    for (const options of [{ campaigns: [{ campaignId: 1, status: 'PAUSED' }] }, { adGroups: [{ adGroupId: 2, status: 'PAUSED' }] }, { targets: [] }, { targets: [{ campaignId: 9, adGroupId: 2, targetId: 3 }] }]) {
        assert.equal((await fixture(options).call()).rules[0].count, 0);
    }
});
test('missing targetId uses exact targeting and match type in the same campaign and group', async () => {
    const candidates = [{ _id: { campaignId: 1, adGroupId: 2 }, targeting: 'shoe', matchType: 'EXACT' }];
    assert.equal((await fixture({ candidates, targets: [{ campaignId: 1, adGroupId: 2, targeting: 'shoe', matchType: 'EXACT' }] }).call()).rules[0].count, 1);
    assert.equal((await fixture({ candidates, targets: [{ campaignId: 1, adGroupId: 2, targeting: 'shoe', matchType: 'BROAD' }] }).call()).rules[0].count, 0);
});
test('new count respects dismissed composite target identities', async () => {
    const candidates = [{ _id: { campaignId: 1, adGroupId: 2, targetId: 3 } }, { _id: { campaignId: 1, adGroupId: 2, targetId: 4 } }];
    const targets = candidates.map(c => c._id);
    const f = fixture({ candidates, targets, statuses: [{ campaignId: 1, adGroupId: 2, targetId: 3 }] });
    const body = await f.call();
    assert.equal(body.rules[0].count, 2);
    assert.equal(body.rules[0].newCount, 1);
    assert.equal(body.totalNewCount, 1);
});
test('list and total handlers agree and perform fresh reads', async () => {
    const f = fixture();
    const count = await f.call();
    const list = await f.call('getRecommendation');
    assert.equal(list.data[0].count, count.rules[0].count);
    assert.equal(f.aggregateCount, 2);
});
test('missing profile and no active rules keep their response contracts', async () => {
    const f = fixture();
    assert.equal((await f.call('getTotalRecommendationCount', { body: {} })).isSuccess, false);
    f.setRules([]);
    assert.equal((await f.call()).totalRules, 0);
    assert.equal((await f.call('getRecommendation')).data.length, 0);
});
test('detail handler reads fresh data each time without a memory or Redis cache', async () => { const candidates = [{ _id: { campaignId: 1, adGroupId: 2, targetId: 3 }, isNew: true }]; const targets = [{ campaignId: 1, adGroupId: 2, targetId: 3 }]; const f = fixture({ candidates, targets }); const first = await f.call('getRecommendationData'); assert.equal(first.isSuccess, true); assert.equal(first.totalRecords, 1); candidates.push({ _id: { campaignId: 1, adGroupId: 2, targetId: 4 }, isNew: true }); targets.push({ campaignId: 1, adGroupId: 2, targetId: 4 }); const second = await f.call('getRecommendationData'); assert.equal(second.totalRecords, 2); assert.equal(f.aggregateCount, 2); });
test('targeting detail preserves metrics and hydrates current bid, match type and names', async () => {
    const f = fixture({ candidates: [{ _id: { campaignId: 1, adGroupId: 2, targetId: 3 }, campaignId: 1, adGroupId: 2, profileId, spend: 45, acos: 12.5, targeting: 'shoe', targetingBid: 1 }], campaigns: [{ campaignId: 1, status: 'ENABLED', name: 'Campaign' }], adGroups: [{ adGroupId: 2, status: 'ENABLED', name: 'Group' }], targets: [{ campaignId: 1, adGroupId: 2, targetId: 3, status: 'ENABLED', keywordBid: 9, matchType: 'EXACT', keywordType: 'KEYWORD' }], statuses: [{ campaignId: 1, adGroupId: 2, targetId: 3 }] });
    const result = await f.call('getRecommendationData');
    const row = result.data[0];
    assert.equal(row.spend, 45);
    assert.equal(row.acos, 12.5);
    assert.equal(row.targetingBid, 9);
    assert.equal(row.campaignName, 'Campaign');
    assert.equal(row.adGroupName, 'Group');
    assert.equal(row.matchType, 'EXACT');
    assert.equal(row.isNew, false);
    assert.equal(f.pipelines[0].some(stage => stage.$lookup), false);
});
test('detail pagination is stable and marks only returned page identities seen', async () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({ _id: { campaignId: 1, adGroupId: 2, targetId: i + 1 }, campaignId: 1, adGroupId: 2, targetId: i + 1 }));
    const targets = candidates.map(c => ({ ...c._id, status: 'ENABLED' }));
    const f = fixture({ candidates, targets });
    f.request.body.page = 1;
    f.request.body.perPage = 25;
    const first = await f.call('getRecommendationData');
    assert.equal(first.totalRecords, 30);
    assert.equal(first.data.length, 25);
    assert.equal(first.totalPages, 2);
    assert.equal(f.writes[0].length, 25);
    candidates.reverse();
    const repeat = await f.call('getRecommendationData');
    assert.equal(JSON.stringify(first.data), JSON.stringify(repeat.data));
    f.request.body.page = 2;
    const second = await f.call('getRecommendationData');
    assert.equal(second.data.length, 5);
    assert.equal(new Set([...first.data, ...second.data].map(r => r.targetId)).size, 30);
    assert.equal(f.writes[2].length, 5);
    for (let i = 0; i < 5; i++)
        assert.equal(f.writes[2][i].updateMany.filter.targetId, second.data[i].targetId);
});
test('detail custom dates scope both metrics and dismissed flags without cached reuse', async () => {
    const f = fixture();
    f.request.body.fromDate = '2026-09-01';
    f.request.body.toDate = '2026-09-30';
    const result = await f.call('getRecommendationData');
    assert.equal(result.rule.fromDate, '2026-09-01');
    assert.equal(result.rule.toDate, '2026-09-30');
    assert.equal(f.pipelines[0][0].$match.reportDate.$gte, '2026-09-01');
    assert.equal(f.pipelines[0][0].$match.reportDate.$lte, '2026-09-30');
    for (const kind of ['campaign', 'adGroup', 'target'])
        assert.equal(f.queries.find(q => q.kind === kind).filter.reportDate, '2026-09-30');
    const status = f.queries.find(q => q.kind === 'status').filter;
    assert.equal(status.reportDate.$gte, '2026-09-01');
    assert.equal(status.reportDate.$lte, '2026-09-30');
});
test('detail eligibility rejects paused campaigns and resolves missing IDs by exact text and match type', async () => {
    const candidates = [{ _id: { campaignId: 1, adGroupId: 2 }, targeting: 'shoe', matchType: 'EXACT' }];
    const targets = [{ campaignId: 1, adGroupId: 2, targetId: 9, targeting: 'shoe', matchType: 'EXACT', status: 'ENABLED' }];
    const f = fixture({ candidates, targets });
    assert.equal((await f.call('getRecommendationData')).data[0].targetId, 9);
    const paused = fixture({ candidates, targets, campaigns: [{ campaignId: 1, status: 'PAUSED' }] });
    assert.equal((await paused.call('getRecommendationData')).totalRecords, 0);
});
test('delete fetches fresh targeting rows and batches exactly their history and audit identities', async () => {
    const candidates = [{ _id: { campaignId: 1, adGroupId: 2, targetId: 3 }, campaignId: 1, adGroupId: 2, targetId: 3, spend: 12 }];
    const f = fixture({ candidates, targets: [{ campaignId: 1, adGroupId: 2, targetId: 3, status: 'ENABLED', keywordBid: 9 }] });
    assert.equal((await f.call('deleteRecommendation')).isSuccess, true);
    assert.equal(f.historyWrites.length, 1);
    assert.equal(f.historyWrites[0].length, 1);
    const op = f.historyWrites[0][0].updateOne;
    assert.equal(op.filter.targetId, 3);
    assert.equal(op.filter.type, 'SP');
    assert.equal(op.upsert, true);
    assert.equal(op.update.$set.isDeleted, true);
    assert.equal(f.auditBatches.length, 1);
    assert.equal(f.auditBatches[0][0].metadata.targetingBid, 9);
    assert.equal(f.auditBatches[0][0].metadata.spend, 12);
    assert.equal(f.auditBatches[0][0].event, 'RECOMMENDATION_DISMISSED');
    assert.equal(f.writes.length, 0);
    assert.equal(f.pipelines[0].some(s => s.$lookup), false);
    candidates.length = 0;
    assert.equal((await f.call('deleteRecommendation')).isSuccess, true);
    assert.equal(f.historyWrites.length, 1);
    assert.equal(f.auditBatches.length, 1);
    assert.equal(f.aggregateCount, 2);
});
test('delete preserves whole-rule dismissal even when pagination fields are supplied', async () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({ _id: { campaignId: 1, adGroupId: 2, targetId: i + 1 }, campaignId: 1, adGroupId: 2, targetId: i + 1 }));
    const f = fixture({ candidates, targets: candidates.map(c => ({ ...c._id, status: 'ENABLED' })) });
    f.request.body.page = 1;
    f.request.body.perPage = 25;
    assert.equal((await f.call('deleteRecommendation')).isSuccess, true);
    assert.equal(f.historyWrites[0].length, 30);
    assert.equal(f.auditBatches[0].length, 30);
});
test('delete rejects missing scope and missing rules before any persistence', async () => {
    const f = fixture();
    assert.equal((await f.call('deleteRecommendation', { config: { configId }, params: { ruleId: f.request.params.ruleId }, body: {} })).isSuccess, false);
    assert.equal((await f.call('deleteRecommendation', { config: { configId }, params: {}, body: { profileId } })).isSuccess, false);
    f.setRules([]);
    assert.equal((await f.call('deleteRecommendation')).isSuccess, false);
    assert.equal(f.historyWrites.length, 0);
    assert.equal(f.auditBatches.length, 0);
});
test('history write failure reports failure and does not emit a dismissal audit', async () => {
    const f = fixture({ historyWrite: async () => { throw new Error('write failed'); } });
    assert.equal((await f.call('deleteRecommendation')).isSuccess, false);
    assert.equal(f.auditBatches.length, 0);
});
test('delete waits for its audit batch instead of leaving untracked writes', async () => {
    let release, entered;
    const gate = new Promise(r => release = r);
    const started = new Promise(r => entered = r);
    const f = fixture({ auditWrite: async () => { entered(); await gate; } });
    let responded = false;
    const pending = f.call('deleteRecommendation').then(r => { responded = true; return r; });
    await started;
    assert.equal(responded, false);
    release();
    assert.equal((await pending).isSuccess, true);
});
test('shared targeting fetch supports cron model names with matching new counts', async () => {
    const f = fixture();
    const result = await f.api.fetchRecommendationData({ configId, profileId, ruleId: f.request.params.ruleId, adType: 'SP', models: { campaignSchema: f.request.models.adTypeCampaignSchema, adGroupSchema: f.request.models.adTypeAdGroupSchema, targetingSchema: f.request.models.adTypeTargetingSchema } });
    assert.equal(result.data.length, 1);
    assert.equal(result.newCount, 1);
    assert.equal(f.writes.length, 0);
});
test('large deletion streams 1201 rows through sequential 500/500/201 batches', async () => {
    const candidates = Array.from({ length: 1201 }, (_, i) => ({ _id: { campaignId: 1, adGroupId: 2, targetId: i + 1 }, campaignId: 1, adGroupId: 2, targetId: i + 1 }));
    const checkpoints = [];
    const f = fixture({ candidates, targets: candidates.map(c => ({ ...c._id, status: 'ENABLED' })), historyWrite: async () => { checkpoints.push(f.consumed); } });
    const result = await f.call('deleteRecommendation');
    assert.equal(result.isSuccess, true);
    assert.deepEqual(f.historyWrites.map(b => b.length), [500, 500, 201]);
    assert.deepEqual(f.auditBatches.map(b => b.length), [500, 500, 201]);
    assert.deepEqual(checkpoints, [500, 1000, 1201]);
    assert.equal(f.closed, 1);
    const ids = f.historyWrites.flat().map(op => op.updateOne.filter.targetId);
    assert.equal(new Set(ids).size, 1201);
});
test('failed batch stops later reads and audits and closes the deletion cursor', async () => {
    const candidates = Array.from({ length: 1201 }, (_, i) => ({ _id: { campaignId: 1, adGroupId: 2, targetId: i + 1 }, campaignId: 1, adGroupId: 2, targetId: i + 1 }));
    let calls = 0;
    const f = fixture({ candidates, targets: candidates.map(c => ({ ...c._id, status: 'ENABLED' })), historyWrite: async () => { if (++calls === 2)
            throw new Error('batch failed'); } });
    assert.equal((await f.call('deleteRecommendation')).isSuccess, false);
    assert.equal(f.historyWrites.length, 2);
    assert.equal(f.auditBatches.length, 1);
    assert.equal(f.consumed, 1000);
    assert.equal(f.closed, 1);
});
test('non-targeting deletion also streams candidates without a facet or full materialization', async () => {
    const candidates = Array.from({ length: 1001 }, (_, i) => ({ _id: { campaignId: i + 1 }, campaignId: i + 1, isNew: true }));
    const f = fixture({ candidates });
    const rule = { _id: new mongoose.Types.ObjectId(), configId: new mongoose.Types.ObjectId(configId), profileId, gridName: 'Campaign', timezone: 'Asia/Kolkata', reportDate: 'LAST_7_DAYS' };
    f.setRules([rule]);
    f.request.models.adTypeCampaignSchema.aggregate = f.request.models.adTypeTargetingSchema.aggregate;
    assert.equal((await f.call('deleteRecommendation')).isSuccess, true);
    assert.deepEqual(f.historyWrites.map(b => b.length), [500, 500, 1]);
    assert.equal(f.pipelines[0].some(s => s.$facet), false);
    assert.equal(f.closed, 1);
});


test('calculateUpdatedValue accurately computes bids and budgets', async () => {
    const f = fixture();
    const calc = f.api.calculateUpdatedValue;

    // Targeting
    assert.equal(calc({ targetingBid: 5 }, [{ actionName: 'IncreaseBid', actionValue: 20, actionValueType: 'Percentage' }], 'Targeting'), 6);
    assert.equal(calc({ targetingBid: 0 }, [{ actionName: 'IncreaseBid', actionValue: 20, actionValueType: 'Percentage' }], 'Targeting'), 0);
    assert.equal(calc({ targetingBid: 1 }, [{ actionName: 'DecreaseBid', actionValue: 2, actionValueType: 'Amount' }], 'Targeting'), 0.02);
    assert.equal(calc({ keywordBid: 2 }, [{ actionName: 'SetBid', actionValue: 1.5 }], 'Targeting'), 1.5);

    // Campaign
    assert.equal(calc({ budget: 100 }, [{ actionName: 'IncreaseBudget', actionValue: 10, actionValueType: 'Percentage' }], 'Campaign'), 110);
    assert.equal(calc({ budget: 50 }, [{ actionName: 'DecreaseBudget', actionValue: 100, actionValueType: 'Amount' }], 'Campaign'), 1);

    // Placement
    assert.equal(calc({ placement: 'top', placementBid: 10 }, [{ placementType: 'top', actionName: 'IncreaseBid', actionValue: 50, actionValueType: 'Percentage' }], 'Placement'), 15);
});

test('getRecommendationData partitions less_than_one and valid items and respects filterType', async () => {
    const ruleId = new mongoose.Types.ObjectId();
    const rule = {
        _id: ruleId,
        configId: new mongoose.Types.ObjectId(configId),
        profileId,
        gridName: 'Targeting',
        reportDate: 'LAST_7_DAYS',
        timezone: 'Asia/Kolkata',
        ruleName: 'Bid Rule',
        actions: [{ actionName: 'IncreaseBid', actionValue: 20, actionValueType: 'Percentage' }]
    };

    const candidates = [
        { _id: { campaignId: 1, adGroupId: 2, targetId: 101 }, campaignId: 1, adGroupId: 2, targetId: 101 },
        { _id: { campaignId: 1, adGroupId: 2, targetId: 102 }, campaignId: 1, adGroupId: 2, targetId: 102 },
        { _id: { campaignId: 1, adGroupId: 2, targetId: 103 }, campaignId: 1, adGroupId: 2, targetId: 103 },
    ];
    const targets = [
        { campaignId: 1, adGroupId: 2, targetId: 101, keywordBid: 0, status: 'ENABLED' }, // 0 * 1.2 = 0 (< 1)
        { campaignId: 1, adGroupId: 2, targetId: 102, keywordBid: 5, status: 'ENABLED' }, // 5 * 1.2 = 6 (>= 1)
        { campaignId: 1, adGroupId: 2, targetId: 103, keywordBid: 10, status: 'ENABLED' }, // 10 * 1.2 = 12 (>= 1)
    ];

    const f = fixture({ candidates, targets });
    f.setRules([rule]);
    f.request.params.ruleId = String(ruleId);

    // 1. Default (filterType: 'all') -> only valid items (count: 2)
    const resAll = await f.call('getRecommendationData');
    assert.equal(resAll.isSuccess, true);
    assert.equal(resAll.totalRecords, 2);
    assert.equal(resAll.count, 2);
    assert.equal(resAll.validCount, 2);
    assert.equal(resAll.lessThanOneCount, 1);
    assert.equal(resAll.totalAllRecords, 3);
    assert.equal(resAll.data.length, 2);
    assert.equal(JSON.stringify(resAll.data.map(d => d.targetId)), JSON.stringify([102, 103]));

    // 2. filterType: 'less_than_one' -> only less than one items (count: 1)
    f.request.body.filterType = 'less_than_one';
    const resLess = await f.call('getRecommendationData');
    assert.equal(resLess.isSuccess, true);
    assert.equal(resLess.totalRecords, 1);
    assert.equal(resLess.count, 1);
    assert.equal(resLess.validCount, 2);
    assert.equal(resLess.lessThanOneCount, 1);
    assert.equal(resLess.totalAllRecords, 3);
    assert.equal(resLess.data.length, 1);
    assert.equal(resLess.data[0].targetId, 101);

    // 3. filterType: 'raw_all' -> all 3 items
    f.request.body.filterType = 'raw_all';
    const resRaw = await f.call('getRecommendationData');
    assert.equal(resRaw.isSuccess, true);
    assert.equal(resRaw.totalRecords, 3);
    assert.equal(resRaw.data.length, 3);
});
