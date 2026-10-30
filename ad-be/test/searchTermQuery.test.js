const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers/searchTerm.controller.js'), 'utf8');
const handlerSource = source.slice(source.indexOf('exports.getAllSearchTerms ='), source.indexOf('exports.getSearchTermsProductView ='));
const configId = '6a2fd9dbdec3c6e2d5b466a6';
const profileId = 1688741796096115;

function fixture({ adType = 'SP', campaigns = [{ campaignId: 70546582567165, name: 'Enabled campaign', status: 'ENABLED' }], failure } = {}) {
    const pipelines = [];
    const targetingQueries = [];
    const logs = [];
    const row = { campaignId: 70546582567165, adGroupId: 12, keywordId: 34, searchTerm: 'test term', sales: 75 };
    const totals = { impressions: 100, clicks: 5, orders: 1, spend: 10, sales: 75 };
    const models = {
        adTypeSearchTermSchema: {
            findOne() { return { sort() { return { lean: async () => ({ reportDate: '2026-10-26' }) }; } }; },
            aggregate(pipeline) {
                pipelines.push(pipeline);
                return {
                    allowDiskUse(value) { assert.equal(value, true); return this; },
                    hint() { throw new Error('hint provided does not correspond to an existing index'); },
                    then(resolve, reject) {
                        return (failure ? Promise.reject(failure) : Promise.resolve([{ data: [{ ...row }], totalCount: [{ total: 51 }], totalRow: [{ ...totals }] }])).then(resolve, reject);
                    },
                };
            },
        },
        adTypeTargetingSchema: {
            find(query) { targetingQueries.push(query); return { lean: async () => [{ campaignId: row.campaignId, adGroupId: row.adGroupId, targeting: 'test term' }] }; },
        },
    };
    const context = { exports: {}, moment,
        mongoose: { Types: mongoose.Types, connection: { collection: () => ({ find: () => ({ toArray: async () => campaigns }) }) } },
        AD_TYPE_COLLECTIONS: { [adType]: { campaign: 'fixture-campaigns' } },
        getProfile: async () => ({ timezone: 'Asia/Kolkata' }),
        sanitizeQueryObject: value => value,
        safeJSON: value => value ? JSON.parse(value) : {},
        write_logs: entry => logs.push(entry),
    };
    vm.runInNewContext(handlerSource, context);
    const req = { config: { configId }, models, adType, body: {
        profileId, fromDate: '2026-10-01', toDate: '2026-10-26',
        fieldName: 'sales', sortType: 'DESC', pageNo: 2, perPage: 50,
        query: JSON.stringify({ campaignStatus: { $eq: 'ENABLED' } }),
    } };
    const res = { status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } };
    return { run: () => context.exports.getAllSearchTerms(req, res), req, res, pipelines, targetingQueries, logs, totals };
}

for (const adType of ['SP', 'SB', 'SD']) {
    test(`${adType}: campaign-filtered search terms work without the optional named index`, async () => {
        const f = fixture({ adType });
        await f.run();
        assert.equal(f.res.code, 200);
        assert.equal(f.res.body.isSuccess, true);
        assert.equal(f.pipelines.length, 1);
        const match = f.pipelines[0][0].$match;
        assert.equal(String(match.configId), configId);
        assert.equal(match.profileId, profileId);
        assert.deepEqual(JSON.parse(JSON.stringify(match.reportDate)), { $gte: '2026-10-01', $lte: '2026-10-26' });
        assert.deepEqual(Array.from(match.campaignId.$in), [70546582567165]);
        const facet = f.pipelines[0].at(-1).$facet;
        assert.deepEqual(JSON.parse(JSON.stringify(facet.data)), [{ $sort: { sales: -1 } }, { $skip: 50 }, { $limit: 50 }]);
        assert.equal(f.res.body.totalSearchTerm, 51);
        assert.equal(f.res.body.totalRow.sales, f.totals.sales);
        assert.equal(f.res.body.totalRow.isTotalRow, true);
        assert.equal(f.res.body.getSearchTerm[0].campaignName, 'Enabled campaign');
        assert.equal(f.res.body.getSearchTerm[0].existTargeting, true);
        assert.equal(f.logs.length, 0);
    });
}

test('unfiltered search terms do not add a campaign restriction', async () => {
    const f = fixture();
    delete f.req.body.query;
    await f.run();
    assert.equal(f.res.code, 200);
    assert.equal(f.pipelines[0][0].$match.campaignId, undefined);
});

test('unmatched campaign status returns empty results without aggregating', async () => {
    const f = fixture({ campaigns: [{ campaignId: 1, status: 'PAUSED' }] });
    await f.run();
    assert.equal(f.res.code, 200);
    assert.equal(f.res.body.totalSearchTerm, 0);
    assert.equal(f.pipelines.length, 0);
});

test('database errors still fail visibly without retries or swallowed failures', async () => {
    const f = fixture({ failure: new Error('database unavailable') });
    await f.run();
    assert.equal(f.res.code, 500);
    assert.equal(f.res.body.isSuccess, false);
    assert.equal(f.res.body.message, 'database unavailable');
    assert.equal(f.pipelines.length, 1);
    assert.equal(f.logs.length, 1);
});
