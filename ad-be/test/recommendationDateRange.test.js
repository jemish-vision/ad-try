const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const moment = require('moment-timezone');
const mongoose = require('mongoose');

const configId = '69809498df1b0ea4ae334fc5';
const profileId = 123;

function createTestContext({
    campaignDocs = [],
    adGroupDocs = [],
    targetDocs = [],
    searchTermDocs = [],
    placementDocs = [],
    rules = [],
    statusDocs = [],
    historyDocs = [],
} = {}) {
    let queries = [];

    // Memory query helper that supports basic Mongo filter emulation
    function matchesFilter(doc, filter = {}) {
        for (const [key, cond] of Object.entries(filter)) {
            if (key === '$or') {
                if (!cond.some(sub => matchesFilter(doc, sub))) return false;
                continue;
            }
            if (key === '$and') {
                if (!cond.every(sub => matchesFilter(doc, sub))) return false;
                continue;
            }
            const val = doc[key];
            if (cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId)) {
                if (cond.$eq !== undefined && val !== cond.$eq) return false;
                if (cond.$ne !== undefined && val === cond.$ne) return false;
                if (cond.$gte !== undefined && val < cond.$gte) return false;
                if (cond.$lte !== undefined && val > cond.$lte) return false;
                if (cond.$in !== undefined && !cond.$in.includes(val)) return false;
                if (cond.$nin !== undefined && cond.$nin.includes(val)) return false;
                if (cond.$exists !== undefined) {
                    const exists = val !== undefined && val !== null;
                    if (exists !== cond.$exists) return false;
                }
            } else if (cond !== undefined) {
                if (String(val) !== String(cond)) return false;
            }
        }
        return true;
    }

    function createMockModel(kind, docs) {
        return {
            find(filter = {}, projection = {}) {
                queries.push({ kind, action: 'find', filter });
                let matched = docs.filter(d => matchesFilter(d, filter));
                return {
                    sort(sortObj = {}) {
                        const entries = Object.entries(sortObj);
                        matched = [...matched].sort((a, b) => {
                            for (const [k, dir] of entries) {
                                if (a[k] < b[k]) return dir === -1 ? 1 : -1;
                                if (a[k] > b[k]) return dir === -1 ? -1 : 1;
                            }
                            return 0;
                        });
                        return this;
                    },
                    lean: async () => matched,
                    limit(n) {
                        matched = matched.slice(0, n);
                        return this;
                    }
                };
            },
            findOne(filter = {}, projection = {}) {
                queries.push({ kind, action: 'findOne', filter });
                let matched = docs.filter(d => matchesFilter(d, filter));
                return {
                    sort(sortObj = {}) {
                        const entries = Object.entries(sortObj);
                        matched = [...matched].sort((a, b) => {
                            for (const [k, dir] of entries) {
                                if (a[k] < b[k]) return dir === -1 ? 1 : -1;
                                if (a[k] > b[k]) return dir === -1 ? -1 : 1;
                            }
                            return 0;
                        });
                        return this;
                    },
                    lean: async () => matched[0] || null
                };
            },
            aggregate(pipeline = []) {
                queries.push({ kind, action: 'aggregate', pipeline });
                return {
                    allowDiskUse() { return this; },
                    then(resolve, reject) {
                        const matchStage = pipeline.find(s => s.$match)?.$match || {};
                        const filtered = docs.filter(d => matchesFilter(d, matchStage));
                        if (pipeline[pipeline.length - 1]?.$count) {
                            return Promise.resolve([{ count: filtered.length }]).then(resolve, reject);
                        }
                        return Promise.resolve(filtered).then(resolve, reject);
                    },
                    cursor({ batchSize }) {
                        const matchStage = pipeline.find(s => s.$match)?.$match || {};
                        const filtered = docs.filter(d => matchesFilter(d, matchStage));
                        return {
                            async *[Symbol.asyncIterator]() {
                                for (const row of filtered) yield row;
                            },
                            async close() {}
                        };
                    }
                };
            }
        };
    }

    const models = {
        adTypeCampaignSchema: createMockModel('campaign', campaignDocs),
        adTypeAdGroupSchema: createMockModel('adGroup', adGroupDocs),
        adTypeTargetingSchema: createMockModel('target', targetDocs),
        adTypeSearchTermSchema: createMockModel('searchTerm', searchTermDocs),
        adTypePlacementSchema: createMockModel('placement', placementDocs),
    };

    const mockedRequire = name => {
        if (name === 'mongoose') return mongoose;
        if (name === 'moment') return moment;
        if (name === 'p-limit') return { default: () => fn => fn() };
        if (name === '../helper/common') return { getRuleDate: () => ({ fromDate: '2026-10-09', toDate: '2026-10-16' }), safeJsonParse: v => v };
        if (name === '../models/recomandationRules.model') {
            return {
                find: (filter) => ({ lean: async () => rules }),
                findOne: (filter) => ({ lean: async () => rules.find(r => matchesFilter(r, filter)) || null })
            };
        }
        if (name === '../models/recommandationCampaignByRule.model') {
            return {
                find: (filter) => ({ lean: async () => historyDocs.filter(h => matchesFilter(h, filter)) }),
                bulkWrite: async () => ({ modifiedCount: 0 })
            };
        }
        if (name === '../models/campaignChangeHistory.model') {
            return {
                find: (filter) => ({ lean: async () => [] })
            };
        }
        if (name === '../helpers/auditHelper') {
            return { logAudit: async () => {}, logAuditBatch: async () => {} };
        }
        if (name === '../models/recommandationStatus.model') {
            return {
                find: (filter) => ({ lean: async () => statusDocs.filter(s => matchesFilter(s, filter)) }),
                exists: async () => false,
                bulkWrite: async () => ({ modifiedCount: 0 })
            };
        }
        if (name === '../helper/sanitizeQuery') return require('../api-server/helper/sanitizeQuery');
        if (name === '../helper/adTypeCollections') return { SP: { campaign: 'campaigns', adGroup: 'ad_groups', targeting: 'targetings', placement: 'placements' } };
        if (name.includes('logger')) return { recommendation_logs: () => {} };
        return {};
    };

    const context = { exports: {}, require: mockedRequire, process, console };
    const code = fs.readFileSync(path.join(__dirname, '../api-server/controllers/recommendation.controller.js'), 'utf8');
    vm.runInNewContext(code, context);

    const call = async (handlerName, reqOverride = {}) => {
        let body = null;
        let statusCode = 200;
        const req = {
            config: { configId },
            body: { profileId, ...reqOverride.body },
            params: { ruleId: rules[0]?._id ? String(rules[0]._id) : undefined, ...reqOverride.params },
            adType: 'SP',
            user: { id: '695666084b7687741f926dda' },
            models,
            ...reqOverride,
        };
        const res = {
            status(code) { statusCode = code; return this; },
            send(v) { body = v; return this; }
        };
        await context.exports[handlerName](req, res);
        return { statusCode, body };
    };

    return { call, api: context.exports, models, queries };
}

test('Scenario 1: toDate has NO data, recommendations are computed using available data from earlier dates', async () => {
    // Campaign, AdGroup, and Target only have data on 2026-10-12
    // Selected range is 2026-10-09 to 2026-10-16 (toDate 2026-10-16 has NO data)
    const rule = {
        _id: new mongoose.Types.ObjectId(),
        configId: new mongoose.Types.ObjectId(configId),
        profileId,
        gridName: 'Targeting',
        reportDate: 'LAST_7_DAYS',
        timezone: 'Asia/Kolkata',
        ruleName: 'Targeting Spend Rule',
        conditions: [{ conditionType: 'Spend', conditionOperator: 'GREATER_THAN', conditionValue: 10 }],
        actions: [{ actionName: 'BidAdjustment', actionType: 'INCREASE_BY_PERCENTAGE', actionValue: 10 }],
        isActive: true,
        isDeleted: false
    };

    const targetCandidate = {
        _id: { campaignId: 101, adGroupId: 201, targetId: 301, profileId },
        campaignId: 101,
        adGroupId: 201,
        targetId: 301,
        targeting: 'wireless mouse',
        matchType: 'EXACT',
        spend: 50,
        sales: 200,
        acos: 25,
        clicks: 30,
        impressions: 1000,
        orders: 10,
        reportDate: '2026-10-12'
    };

    const campaignDocs = [
        { configId, profileId, campaignId: 101, name: 'Mouse Camp', status: 'ENABLED', reportDate: '2026-10-12' }
    ];
    const adGroupDocs = [
        { configId, profileId, campaignId: 101, adGroupId: 201, name: 'Mouse Group', status: 'ENABLED', reportDate: '2026-10-12' }
    ];
    const targetDocs = [
        { configId, profileId, campaignId: 101, adGroupId: 201, targetId: 301, targeting: 'wireless mouse', matchType: 'EXACT', status: 'ENABLED', keywordBid: 1.2, reportDate: '2026-10-12' },
        targetCandidate
    ];

    const ctx = createTestContext({
        campaignDocs,
        adGroupDocs,
        targetDocs,
        rules: [rule]
    });

    // 1. Check recommendation pipeline handles $lte for lastDate
    const pipeline = ctx.api.recommendationPipeline({}, '2026-10-16', rule, 'SP');
    const campLookup = pipeline.find(s => s.$lookup && s.$lookup.as === 'campaign');
    assert.ok(campLookup, 'Campaign lookup should exist');
    const matchStage = campLookup.$lookup.pipeline.find(s => s.$match);
    const conds = matchStage.$match.$expr.$and;
    assert.ok(conds.some(c => c.$lte && c.$lte[0] === '$reportDate'), 'Campaign lookup pipeline must use $lte for reportDate');

    // 2. Total count returns the rule count even though toDate (2026-10-16) has no data
    const countRes = await ctx.call('getTotalRecommendationCount');
    assert.equal(countRes.body.isSuccess, true);
    assert.equal(countRes.body.totalRules, 1);
    assert.equal(countRes.body.rules[0].count, 1);

    // 3. Recommendation data returns the target record with hydrated names and bid
    const dataRes = await ctx.call('getRecommendationData', {
        params: { ruleId: String(rule._id) },
        body: { customFromDate: '2026-10-09', customToDate: '2026-10-16' }
    });
    assert.equal(dataRes.body.isSuccess, true);
    assert.equal(dataRes.body.data.length, 1);
    assert.equal(dataRes.body.data[0].campaignId, 101);
    assert.equal(dataRes.body.data[0].campaignName, 'Mouse Camp');
    assert.equal(dataRes.body.data[0].targeting, 'wireless mouse');
    assert.equal(dataRes.body.data[0].status, 'ENABLED');
});

test('Scenario 2: Intermediate dates have no data (sparse dates), metrics correctly aggregate across available dates', async () => {
    // Campaign has activity on 2026-10-09 and 2026-10-14, but days 10, 11, 12, 13, 15, 16 have no data
    const rule = {
        _id: new mongoose.Types.ObjectId(),
        configId: new mongoose.Types.ObjectId(configId),
        profileId,
        gridName: 'Campaign',
        reportDate: 'LAST_7_DAYS',
        timezone: 'Asia/Kolkata',
        ruleName: 'Campaign Spend Rule',
        conditions: [{ conditionType: 'Spend', conditionOperator: 'GREATER_THAN', conditionValue: 10 }],
        actions: [{ actionName: 'BudgetAdjustment', actionType: 'INCREASE_BY_PERCENTAGE', actionValue: 15 }],
        isActive: true,
        isDeleted: false
    };

    const campaignCandidate = {
        _id: { campaignId: 501, profileId },
        campaignId: 501,
        campaignName: 'Sparse Campaign',
        status: 'ENABLED',
        spend: 75,
        sales: 250,
        acos: 30,
        clicks: 40,
        impressions: 1200,
        orders: 8,
        budget: 100,
        reportDate: '2026-10-14'
    };

    const campaignDocs = [
        { configId, profileId, campaignId: 501, name: 'Sparse Campaign', status: 'ENABLED', budget: 100, reportDate: '2026-10-14' },
        campaignCandidate
    ];

    const ctx = createTestContext({
        campaignDocs,
        rules: [rule]
    });

    const pipeline = ctx.api.recommendationPipeline({ reportDate: { $gte: '2026-10-09', $lte: '2026-10-16' } }, '2026-10-16', rule, 'SP');
    assert.deepEqual(pipeline[0].$match.reportDate, { $gte: '2026-10-09', $lte: '2026-10-16' });
    assert.ok(pipeline[1].$group, 'Stage 1 must be $group');

    const countRes = await ctx.call('getTotalRecommendationCount');
    assert.equal(countRes.body.isSuccess, true);
    assert.equal(countRes.body.rules[0].count, 1);
});

test('Scenario 3: Campaign active on earlier date but paused on latest date is correctly EXCLUDED', async () => {
    // Campaign ran on 2026-10-10 (was ENABLED), but on 2026-10-14 was PAUSED
    const rule = {
        _id: new mongoose.Types.ObjectId(),
        configId: new mongoose.Types.ObjectId(configId),
        profileId,
        gridName: 'Targeting',
        reportDate: 'LAST_7_DAYS',
        timezone: 'Asia/Kolkata',
        ruleName: 'Targeting Rule',
        conditions: [{ conditionType: 'Spend', conditionOperator: 'GREATER_THAN', conditionValue: 10 }],
        actions: [],
        isActive: true,
        isDeleted: false
    };

    const targetCandidate = {
        _id: { campaignId: 701, adGroupId: 801, targetId: 901, profileId },
        campaignId: 701,
        adGroupId: 801,
        targetId: 901,
        targeting: 'keyboard',
        matchType: 'EXACT',
        spend: 40,
        sales: 100,
        acos: 40,
        reportDate: '2026-10-10'
    };

    // Latest status of campaign 701 is PAUSED on 2026-10-14
    const campaignDocs = [
        { configId, profileId, campaignId: 701, name: 'Old Camp', status: 'PAUSED', reportDate: '2026-10-14' },
        { configId, profileId, campaignId: 701, name: 'Old Camp', status: 'ENABLED', reportDate: '2026-10-10' }
    ];
    const adGroupDocs = [
        { configId, profileId, campaignId: 701, adGroupId: 801, name: 'Old Group', status: 'ENABLED', reportDate: '2026-10-14' }
    ];
    const targetDocs = [
        { configId, profileId, campaignId: 701, adGroupId: 801, targetId: 901, targeting: 'keyboard', matchType: 'EXACT', status: 'ENABLED', reportDate: '2026-10-14' },
        targetCandidate
    ];

    const ctx = createTestContext({
        campaignDocs,
        adGroupDocs,
        targetDocs,
        rules: [rule]
    });

    const countRes = await ctx.call('getTotalRecommendationCount');
    assert.equal(countRes.body.isSuccess, true);
    // When no rules have recommendations, totalRules is 0 or rule count is 0
    const ruleCount = countRes.body.rules?.[0]?.count ?? 0;
    assert.equal(ruleCount, 0, 'Paused campaign must not produce recommendations');
});

test('Scenario 4: Search Term rule with sparse dates returns recommendations using available data', async () => {
    const rule = {
        _id: new mongoose.Types.ObjectId(),
        configId: new mongoose.Types.ObjectId(configId),
        profileId,
        gridName: 'Search Term',
        reportDate: 'LAST_7_DAYS',
        timezone: 'Asia/Kolkata',
        ruleName: 'Search Term Negative Rule',
        conditions: [{ conditionType: 'Spend', conditionOperator: 'GREATER_THAN', conditionValue: 10 }],
        actions: [{ actionName: 'AddAsNegativeTargeting' }],
        isActive: true,
        isDeleted: false
    };

    const campaignDocs = [
        { configId, profileId, campaignId: 401, name: 'ST Camp', status: 'ENABLED', reportDate: '2026-10-11' }
    ];
    const adGroupDocs = [
        { configId, profileId, campaignId: 401, adGroupId: 402, name: 'ST Group', status: 'ENABLED', reportDate: '2026-10-11' }
    ];
    const targetDocs = []; // Not yet targeted

    const searchTermCandidate = {
        _id: { campaignId: 401, adGroupId: 402, keywordId: 403, searchTerm: 'cheap mouse', profileId },
        configId,
        profileId,
        campaignId: 401,
        adGroupId: 402,
        keywordId: 403,
        searchTerm: 'cheap mouse',
        spend: 25,
        sales: 0,
        orders: 0,
        clicks: 20,
        impressions: 500,
        reportDate: '2026-10-11'
    };

    const searchTermDocs = [searchTermCandidate];

    const ctx = createTestContext({
        campaignDocs,
        adGroupDocs,
        targetDocs,
        searchTermDocs,
        rules: [rule]
    });

    const dataRes = await ctx.call('getRecommendationData', {
        params: { ruleId: String(rule._id) },
        body: { customFromDate: '2026-10-09', customToDate: '2026-10-16' }
    });
    assert.equal(dataRes.body.isSuccess, true);
    assert.equal(dataRes.body.data.length, 1);
    assert.equal(dataRes.body.data[0].searchTerm, 'cheap mouse');
    assert.equal(dataRes.body.data[0].campaignName, 'ST Camp');
    assert.equal(dataRes.body.data[0].adGroupName, 'ST Group');
});
