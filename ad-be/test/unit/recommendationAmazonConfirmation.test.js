const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { confirmedRecommendationIndexes } = require('../../api-server/helper/recommendationAmazonConfirmation');

test('named SP batch outcomes confirm only the identified successful target', () => {
    const payload = { targetingClauses: [{ targetId: '111' }, { targetId: '222' }, { targetId: '333' }] };
    const response = { status: 207, data: { targetingClauses: {
        success: [{ index: 2, targetId: '333' }, { index: 0, targetId: '111' }],
        error: [{ index: 0, code: 'BAD_REQUEST' }, { index: 1 }]
    } } };
    assert.deepEqual(confirmedRecommendationIndexes(response, payload), [2]);
    assert.deepEqual(confirmedRecommendationIndexes({ status: 207 }, payload), []);
});

test('placement outcomes with duplicate campaign IDs need exact request indices', () => {
    const payload = { campaigns: [{ campaignId: '111' }, { campaignId: '111' }] };
    const response = { status: 207, data: { campaigns: {
        success: [{ campaignId: '111' }, { index: 1, campaignId: '111' }], error: [{ index: 0 }]
    } } };
    assert.deepEqual(confirmedRecommendationIndexes(response, payload), [1]);
});

test('legacy responses and new entities require explicit item evidence', () => {
    const payload = [{ targetId: '111' }, { targetId: '222' }];
    const response = { status: 207, data: [
        { targetId: '222', code: 'SUCCESS' }, { targetId: '111', code: 'INVALID_ARGUMENT' }
    ] };
    assert.deepEqual(confirmedRecommendationIndexes(response, payload), [1]);
    assert.deepEqual(confirmedRecommendationIndexes({ status: 200, data: [{}] }, payload), []);
    const created = { keywords: [{ keywordText: 'first' }, { keywordText: 'second' }] };
    assert.deepEqual(confirmedRecommendationIndexes({ status: 207, data: { keywords: {
        success: [{ index: 1, keywordId: 'existing-generated-id' }], error: [{ index: 0 }]
    } } }, created, { create: true }), [1]);
});

test('partially successful SP targeting apply writes and returns only the confirmed item', async () => {
    const controller = fs.readFileSync(path.join(__dirname, '../../api-server/controllers/recommendation.controller.js'), 'utf8');
    const start = controller.indexOf('const { confirmedRecommendationIndexes }');
    const end = controller.indexOf('const applySearchTermRecommendation =', start);
    const writes = { receipt: [], history: [], snapshots: [] };
    const context = {
        require: () => ({ confirmedRecommendationIndexes }),
        moment: () => ({ tz: () => ({ format: () => '2026-11-16' }) }),
        getRuleSettings: async () => ({}),
        getMarketplaceMinBid: () => 0.1,
        retryWithBackoff: fn => fn(),
        amazonAxios: async () => ({ status: 207, data: { targetingClauses: {
            success: [{ index: 1, targetId: '222' }], error: [{ index: 0, code: 'INVALID_ARGUMENT' }]
        } } }),
        recommandationCampaignByRuleSchema: { bulkWrite: async ops => { writes.receipt.push(...ops); } },
        insertOperationHistory: async (_model, docs) => { writes.history.push(...docs); },
        campaignChangeHistorySchema: {},
        targetingSchema: { bulkWrite: async ops => { writes.snapshots.push(...ops); } },
        recommendation_logs: () => {}
    };
    const apply = vm.runInNewContext(`${controller.slice(start, end)}\napplyTargetingRecommendation`, context);
    const item = { campaignId: 7, adGroupId: 8, targeting: 'same text', targetingBid: 2.37 };
    const items = [{ ...item, targetId: 'T-111' }, { ...item, targetId: 'T-222' }];
    const rule = { _id: 'rule', configId: 'account', profileId: 9, actions: [{
        actionName: 'DecreaseBid', actionValueType: 'Percentage', actionValue: 3
    }] };
    const response = await apply(rule, items, { configId: 'account', profileId: 9 }, {}, 'SP', 'operation');
    assert.equal(response.isSuccess, true);
    assert.equal(response.appliedCount, 1);
    assert.equal(response.appliedItems[0].targetId, 'T-222');
    assert.equal(writes.receipt.length, 1);
    assert.equal(writes.receipt[0].updateOne.filter.targetId, 'T-222');
    assert.equal(writes.receipt[0].updateOne.update.$set.pendingSyncOperationId, 'operation');
    assert.equal(writes.receipt[0].updateOne.update.$set.newValue, 2.3);
    assert.equal(writes.history.length, 1);
    assert.equal(writes.history[0].historyEntityId, 'T-222');
    assert.equal(writes.snapshots.length, 1);
    assert.equal(writes.snapshots[0].updateMany.filter.targetId, 'T-222');
    assert.equal(writes.snapshots[0].updateMany.filter.campaignId, 7);
    assert.equal(writes.snapshots[0].updateMany.filter.adGroupId, 8);
});
