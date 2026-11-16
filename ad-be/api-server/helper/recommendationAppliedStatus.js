const syncFields = {
    Budget: ['budget', 'budget'],
    Status: ['campaignStatus', 'status'],
    PlacementBid: ['placementBid', 'placementModifier'],
    TargetingBid: ['targetingBid', 'keywordBid'],
    TargetingStatus: ['keywordStatus', 'status']
};

const grids = {
    Campaign: { model: 'adTypeCampaignSchema', keys: ['campaignId'] },
    Placement: { model: 'adTypePlacementSchema', keys: ['campaignId', 'placement'] },
    Targeting: { model: 'adTypeTargetingSchema', keys: ['campaignId', 'adGroupId', 'targetId'] },
    'Search Term': { receiptName: 'SearchTerm', keys: ['campaignId', 'adGroupId', 'keywordId', 'searchTerm'] }
};

function rowKey(row, keys) {
    return JSON.stringify(keys.map(key => String(row[key] ?? '').trim().toLowerCase()));
}

function valuesMatch(actual, expected, changed) {
    if (actual == null || expected == null || String(actual).trim() === '' || String(expected).trim() === '') return false;
    if (changed === 'Status' || changed === 'TargetingStatus') {
        return String(actual).trim().toUpperCase() === String(expected).trim().toUpperCase();
    }
    const amount = Number(actual);
    return Number.isFinite(amount) && amount === Number(expected);
}

function visibleValue(row, changed) {
    const field = syncFields[changed]?.[0];
    const value = row?.[field];
    return changed === 'Status' && value === 'OUT_OF_BUDGET' ? undefined : value;
}

// An applied status can remove a row through normal eligibility. Check that
// entity's current snapshot so an old tag does not return with the row later.
async function latestSnapshots(model, scope, groups, keys) {
    if (!model || groups.length === 0) return new Map();
    const snapshots = new Map();
    for (let offset = 0; offset < groups.length; offset += 100) {
        const receipts = groups.slice(offset, offset + 100).map(([receipt]) => receipt);
        const snapshotFields = [...new Set(receipts.map(receipt => syncFields[receipt.changed]?.[1]).filter(Boolean))];
        if (!snapshotFields.length) continue;
        const rows = await model.aggregate([
            { $match: { ...scope, $or: receipts.map(receipt => {
                const field = syncFields[receipt.changed]?.[1];
                return {
                    ...Object.fromEntries(keys.map(key => [key, receipt[key]])),
                    reportDate: { $gte: receipt.ruleDate },
                    ...(field && { [field]: { $exists: true, $nin: [null, ''] } })
                };
            }) } },
            { $sort: { reportDate: -1, updatedAt: -1, _id: -1 } },
            { $group: {
                _id: Object.fromEntries(keys.map(key => [key, `$${key}`])),
                values: { $first: Object.fromEntries(snapshotFields.map(field => [field, `$${field}`])) }
            } }
        ]);
        for (const row of rows) snapshots.set(rowKey(row._id, keys), row.values);
    }
    return snapshots;
}

async function annotateAppliedRecommendations({ rows, rule, adType, models, receiptModel, onCleanupError }) {
    const grid = grids[rule.gridName];
    if (!grid) return;
    const scope = { configId: rule.configId, profileId: rule.profileId };
    const receipts = await receiptModel.find({
        ...scope,
        userId: rule.userId,
        ruleId: rule._id,
        ruleSchema: grid.receiptName || rule.gridName,
        type: adType,
        pendingSyncOperationId: { $exists: true },
        isReverted: { $ne: true },
        isDeleted: { $ne: true }
    }, { ...Object.fromEntries(grid.keys.map(key => [key, 1])), changed: 1, newValue: 1, ruleDate: 1, pendingSyncOperationId: 1, updatedAt: 1 })
        .sort({ updatedAt: -1, _id: -1 }).lean();
    if (!receipts.length) return;

    const rowsByKey = new Map(rows.map(row => [rowKey(row, grid.keys), row]));
    const receiptsByKey = new Map();
    for (const receipt of receipts) {
        const id = rowKey(receipt, grid.keys);
        if (!receiptsByKey.has(id)) receiptsByKey.set(id, []);
        receiptsByKey.get(id).push(receipt);
    }

    const snapshotGroups = [...receiptsByKey].filter(([id, [receipt]]) =>
        syncFields[receipt.changed] && visibleValue(rowsByKey.get(id), receipt.changed) == null
    ).map(([, group]) => group);
    const snapshots = await latestSnapshots(models[grid.model], scope, snapshotGroups, grid.keys).catch(error => {
        onCleanupError?.(error);
        return new Map();
    });
    const settled = [];
    for (const [id, group] of receiptsByKey) {
        const [receipt] = group;
        const row = rowsByKey.get(id);
        const snapshotField = syncFields[receipt.changed]?.[1];
        const actual = visibleValue(row, receipt.changed) ?? snapshots.get(id)?.[snapshotField];
        // The search term list already excludes the exact applied term using
        // these same receipts, which is its existing reflection mechanism.
        const reflected = grid.receiptName === 'SearchTerm' ? !row : valuesMatch(actual, receipt.newValue, receipt.changed);
        if (reflected) settled.push(...group);
        else if (row) row.appliedPendingSync = true;
    }

    if (settled.length) {
        try {
            await receiptModel.bulkWrite(settled.map(receipt => ({ updateOne: {
                filter: {
                    _id: receipt._id,
                    pendingSyncOperationId: receipt.pendingSyncOperationId,
                    ...(receipt.updatedAt && { updatedAt: receipt.updatedAt })
                },
                update: { $unset: { pendingSyncOperationId: '' } },
                timestamps: false
            } })), { ordered: false });
        } catch (error) {
            onCleanupError?.(error);
        }
    }
}

module.exports = { annotateAppliedRecommendations };
