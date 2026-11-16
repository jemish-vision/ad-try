const { test } = require('node:test');
const assert = require('node:assert/strict');
const { annotateAppliedRecommendations } = require('../../api-server/helper/recommendationAppliedStatus');

const rule = { _id: 'rule', configId: 'account', profileId: 7, userId: 'owner', gridName: 'Targeting' };
const receipt = {
    _id: 'receipt', campaignId: 1, adGroupId: 2, targetId: 'T-3',
    changed: 'TargetingBid', newValue: '2.30', ruleDate: '2026-11-16', pendingSyncOperationId: 'apply-1'
};

async function run({ rows, receipts, gridName = 'Targeting', snapshots = [], models, cleanupError }) {
    const calls = { cleanup: [], snapshots: [] };
    const model = {
        aggregate: async pipeline => {
            calls.snapshots.push(pipeline);
            return snapshots;
        }
    };
    const receiptModel = {
        find: filter => {
            calls.filter = filter;
            return { sort: () => ({ lean: async () => receipts }) };
        },
        bulkWrite: async operations => {
            calls.cleanup.push(...operations.map(operation => operation.updateOne.filter));
            if (cleanupError) throw cleanupError;
        }
    };
    await annotateAppliedRecommendations({
        rows, rule: { ...rule, gridName }, adType: 'SP', receiptModel,
        models: models || { adTypeTargetingSchema: model, adTypeCampaignSchema: model },
        onCleanupError: error => { calls.error = error; }
    });
    return calls;
}

test('only the confirmed target gets tagged on each fresh read while its bid is stale', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
        const rows = [
            { campaignId: 1, adGroupId: 2, targetId: 'T-3', targetingBid: 2.37, isNew: true },
            { campaignId: 1, adGroupId: 2, targetId: 'T-4', targetingBid: 2.37 },
            { campaignId: 1, adGroupId: 9, targetId: 'T-3', targetingBid: 2.37 }
        ];
        const calls = await run({ rows, receipts: [receipt] });
        assert.deepEqual(rows.map(row => row.appliedPendingSync), [true, undefined, undefined]);
        assert.equal(rows[0].isNew, true);
        assert.equal(calls.filter.configId, rule.configId);
        assert.equal(calls.filter.profileId, rule.profileId);
        assert.equal(calls.filter.ruleId, rule._id);
        assert.equal(calls.filter.type, 'SP');
        assert.deepEqual(calls.cleanup, []);
        assert.deepEqual(calls.snapshots, []);
    }
});

test('a reapply tracks the newest confirmed result and settles superseded markers with it', async () => {
    const repeat = { ...receipt, _id: 'second', pendingSyncOperationId: 'apply-2', newValue: '2.20' };
    const rows = [{ campaignId: 1, adGroupId: 2, targetId: 'T-3', targetingBid: 2.30 }];
    assert.deepEqual((await run({ rows, receipts: [repeat, receipt] })).cleanup, []);
    assert.equal(rows[0].appliedPendingSync, true);
    const refreshedRows = [{ campaignId: 1, adGroupId: 2, targetId: 'T-3', targetingBid: 2.20 }];
    const calls = await run({ rows: refreshedRows, receipts: [repeat, receipt] });
    assert.equal(refreshedRows[0].appliedPendingSync, undefined);
    assert.deepEqual(calls.cleanup, [
        { _id: 'second', pendingSyncOperationId: 'apply-2' },
        { _id: 'receipt', pendingSyncOperationId: 'apply-1' }
    ]);
    const reappeared = [{ ...refreshedRows[0], targetingBid: 2.37 }];
    await run({ rows: reappeared, receipts: [] });
    assert.equal(reappeared[0].appliedPendingSync, undefined);
});

test('a removed row settles only when its current snapshot confirms the change', async () => {
    const paused = { ...receipt, changed: 'TargetingStatus', newValue: 'PAUSED' };
    const key = { campaignId: 1, adGroupId: 2, targetId: 'T-3' };
    const stale = await run({ rows: [], receipts: [paused], snapshots: [{ _id: key, values: { status: 'ENABLED' } }] });
    assert.deepEqual(stale.cleanup, []);
    assert.deepEqual(stale.snapshots[0][0].$match.$or[0].reportDate, { $gte: '2026-11-16' });
    const synced = await run({ rows: [], receipts: [paused], snapshots: [{ _id: key, values: { status: 'paused' } }] });
    assert.deepEqual(synced.cleanup, [{ _id: 'receipt', pendingSyncOperationId: 'apply-1' }]);
});

test('zero placement is a valid reflected value while a missing value is not', async () => {
    const placement = { ...receipt, placement: 'Top of Search', changed: 'PlacementBid', newValue: '0' };
    const rows = [{ campaignId: 1, placement: 'Top of Search', placementBid: null }];
    assert.deepEqual((await run({ gridName: 'Placement', rows, receipts: [placement] })).cleanup, []);
    assert.equal(rows[0].appliedPendingSync, true);
    const synced = await run({ gridName: 'Placement', rows: [{ campaignId: 1, placement: 'Top of Search', placementBid: 0 }], receipts: [placement] });
    assert.equal(synced.cleanup.length, 1);
});

test('search-term tags follow the existing exclusion after successful apply', async () => {
    const term = { ...receipt, keywordId: 4, searchTerm: 'Cotton Shirt', changed: 'AddNegativeKeyword' };
    const rows = [{ campaignId: 1, adGroupId: 2, keywordId: 4, searchTerm: 'cotton shirt' }];
    const visible = await run({ gridName: 'Search Term', rows, receipts: [term] });
    assert.equal(visible.filter.ruleSchema, 'SearchTerm');
    assert.equal(rows[0].appliedPendingSync, true);
    assert.deepEqual(visible.cleanup, []);
    const removed = await run({ gridName: 'Search Term', rows: [], receipts: [term] });
    assert.equal(removed.cleanup.length, 1);
});

test('a cleanup failure does not bring back the already reflected tag', async () => {
    const rows = [{ campaignId: 1, budget: 2.30 }];
    const error = new Error('temporary write failure');
    const calls = await run({ gridName: 'Campaign', rows, receipts: [{ ...receipt, changed: 'Budget' }], cleanupError: error });
    assert.equal(calls.error, error);
    assert.equal(rows[0].appliedPendingSync, undefined);
});

test('cleanup uses the receipt version so a retry with the same operation ID can keep its marker', async () => {
    const updatedAt = new Date('2026-11-16T10:00:00Z');
    const rows = [{ campaignId: 1, adGroupId: 2, targetId: 'T-3', targetingBid: 2.30 }];
    const calls = await run({ rows, receipts: [{ ...receipt, updatedAt }] });
    assert.deepEqual(calls.cleanup, [{ _id: 'receipt', pendingSyncOperationId: 'apply-1', updatedAt }]);
});

test('an out-of-budget label does not hide a reflected campaign status change', async () => {
    const rows = [{ campaignId: 1, campaignStatus: 'OUT_OF_BUDGET' }];
    const calls = await run({
        gridName: 'Campaign', rows,
        receipts: [{ ...receipt, changed: 'Status', newValue: 'PAUSED' }],
        snapshots: [{ _id: { campaignId: 1 }, values: { status: 'PAUSED' } }]
    });
    assert.equal(calls.cleanup.length, 1);
    assert.equal(rows[0].appliedPendingSync, undefined);
    assert.equal(rows[0].campaignStatus, 'OUT_OF_BUDGET');
});
