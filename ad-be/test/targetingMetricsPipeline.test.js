const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongoose').mongo;
require('dotenv').config();
const { buildTargetingMetricsPipeline } = require('../api-server/helper/targetingMetricsPipeline');

let client, collection;
const configId = new ObjectId();
const scope = { configId, profileId: 7, reportDate: { $gte: '2026-10-01', $lte: '2026-10-30' } };
const base = { configId, profileId: 7, campaignId: 1, adGroupId: 2, targeting: 'Test', keywordType: 'EXACT', matchType: 'Exact' };
before(async () => {
    client = new MongoClient(process.env.MONGO_URI || process.env.DB_URL);
    await client.connect();
    collection = client.db().collection(`qa_targeting_metrics_${Date.now()}_${process.pid}`);
});
after(async () => {
    try { if (collection) await collection.drop().catch(error => { if (error.codeName !== 'NamespaceNotFound') throw error; }); }
    finally { if (client) await client.close(); }
});
async function aggregate(rows, query = scope) {
    await collection.deleteMany({});
    if (rows.length) await collection.insertMany(rows);
    return collection.aggregate(buildTargetingMetricsPipeline(query), { allowDiskUse: true }).toArray();
}
test('daily duplicate maxima are summed once and real IDs win over temporary IDs', async () => {
    const [result] = await aggregate([
        { ...base, reportDate: '2026-10-01', targetId: 'T-1', spend: 10, sales: 20, keywordBid: 1, status: 'PAUSED' },
        { ...base, targeting: ' TEST ', reportDate: '2026-10-01', targetId: 'R-1', spend: 4, sales: 25, keywordBid: 2, status: 'PAUSED' },
        { ...base, reportDate: '2026-10-30', targetId: 'T-1', spend: 2, sales: 3, keywordBid: 3, status: 'ENABLED' },
    ]);
    assert.equal(result.spend, 12);
    assert.equal(result.sales, 28);
    assert.equal(result.status, 'ENABLED');
    assert.equal(result.keywordBid, 3);
    assert.equal(result.targetId, 'T-1');
    assert.equal(result.targeting, 'Test');
});
test('latest status filtering must not remove earlier paused performance', async () => {
    const rows = await aggregate([
        { ...base, reportDate: '2026-10-01', targetId: 'T-1', sales: 10, status: 'PAUSED' },
        { ...base, reportDate: '2026-10-30', targetId: 'T-1', sales: 5, status: 'ENABLED' },
    ]);
    assert.equal(rows[0].sales, 15);
    assert.equal(rows[0].status, 'ENABLED');
});
test('latest bid uses latest-day maximum rather than a larger earlier bid', async () => {
    const [row] = await aggregate([
        { ...base, reportDate: '2026-10-01', targetId: 'T-1', keywordBid: 100 },
        { ...base, reportDate: '2026-10-30', targetId: 'T-1', keywordBid: 2 },
        { ...base, reportDate: '2026-10-30', targetId: 'R-1', keywordBid: 3 },
    ]);
    assert.equal(row.keywordBid, 3);
});
test('daily impression share maxima are averaged across observed days', async () => {
    const [row] = await aggregate([
        { ...base, reportDate: '2026-10-01', targetId: 'T-1', topOfSearchImpressionShare: '10' },
        { ...base, reportDate: '2026-10-01', targetId: 'R-1', topOfSearchImpressionShare: '20' },
        { ...base, reportDate: '2026-10-30', targetId: 'T-1', topOfSearchImpressionShare: '40' },
    ]);
    assert.equal(row.topOfSearchImpressionShare, 30);
});
test('fractional sums preserve compensated numeric precision', async () => {
    const [row] = await aggregate(Array.from({ length: 30 }, (_, i) => ({ ...base, reportDate: `2026-10-${String(i + 1).padStart(2, '0')}`, targetId: 'T-1', spend: 0.1, sales: 0.3, topOfSearchImpressionShare: '0.1' })));
    assert.equal(row.spend, 3);
    assert.equal(row.sales, 9);
    assert.equal(row.topOfSearchImpressionShare, 0.1);
});
test('missing metrics are ignored without replacing valid negative maxima', async () => {
    const [row] = await aggregate([
        { ...base, reportDate: '2026-10-01', targetId: 'T-1', spend: -2 },
        { ...base, reportDate: '2026-10-01', targetId: 'R-1', spend: null },
    ]);
    assert.equal(row.spend, -2);
    assert.equal(row.sales, 0);
});
test('same text remains separate across campaigns, ad groups, and keyword types', async () => {
    const row = { ...base, reportDate: '2026-10-01', targetId: 'T-1', sales: 1 };
    const result = await aggregate([row, { ...row, campaignId: 3 }, { ...row, adGroupId: 4 }, { ...row, keywordType: 'PHRASE' }]);
    assert.equal(result.length, 4);
});
test('empty target text falls back to ID and match type is normalized', async () => {
    const [row] = await aggregate([{ ...base, targeting: '', keywordType: null, matchType: 'Keyword Phrase', reportDate: '2026-10-01', targetId: 'R-1' }]);
    assert.equal(row.targetId, 'R-1');
    assert.equal(row.keywordType, 'PHRASE');
});
test('account/date constraints and empty results are preserved', async () => {
    const rows = await aggregate([{ ...base, configId: new ObjectId(), reportDate: '2026-10-01' }, { ...base, reportDate: '2025-01-01' }]);
    assert.deepEqual(rows, []);
});
test('legacy missing metadata retains null response fields', async () => {
    const [row] = await aggregate([{ configId, profileId: 7, reportDate: '2026-10-01', targetId: 'R-legacy' }]);
    assert.equal(row.keywordType, null);
    assert.equal(row.matchType, null);
    assert.equal(row.campaignId, null);
    assert.equal(row.adGroupId, null);
});
