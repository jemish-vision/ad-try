const { buildTargetingMetricsPipeline } = require('./targetingMetricsPipeline');

const metadataFields = new Set(['_id', 'targetId', 'targeting', 'profileId', 'campaignId', 'adGroupId', 'keywordType', 'matchType', 'status', 'keywordBid']);
const metricFields = new Set(['impressions', 'clicks', 'orders', 'spend', 'sales', 'topOfSearchImpressionShare', 'acos', 'roas', 'cpc', 'ctr', 'cvr', 'conversionRate']);
const campaignFields = new Set(['campaignName', 'campaignStatus', 'budget', 'daysSinceCreation']);
const adGroupFields = new Set(['adGroupName', 'adGroupStatus']);

function referencedFields(value, fields = new Set()) {
    if (Array.isArray(value)) value.forEach(item => referencedFields(item, fields));
    else if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            if (!key.startsWith('$')) fields.add(key.split('.')[0]);
            referencedFields(entry, fields);
        }
    } else if (typeof value === 'string' && value.startsWith('$')) {
        fields.add(value.startsWith('$$') ? '*' : value.slice(1).split('.')[0]);
    }
    return fields;
}

function buildTargetingMetadataPipeline(query) {
    const metricsPipeline = buildTargetingMetricsPipeline(query);
    const group = { ...metricsPipeline.find(stage => stage.$group).$group };
    delete group.dailyMetrics;
    return [
        metricsPipeline[0], metricsPipeline[1], { $group: group },
        { $set: {
            targetId: { $ifNull: ['$realTargetId', '$fallbackTargetId'] },
            '_id.targetId': { $ifNull: ['$realTargetId', '$fallbackTargetId'] },
            keywordBid: '$latestBid.bid', profileId: '$_id.profileId',
            campaignId: { $ifNull: ['$_id.campaignId', null] }, adGroupId: { $ifNull: ['$_id.adGroupId', null] },
            keywordType: { $ifNull: ['$_id.keywordType', null] }, matchType: { $ifNull: ['$_id.keywordType', null] },
        } },
    ];
}

// This path selects chart membership only. Keep the legacy projection and
// archived-campaign exclusion, but calculate/join only filter dependencies.
function canFilterWithoutCampaignJoin(filterStages) {
    return [...referencedFields(filterStages)].every(field => metadataFields.has(field) || metricFields.has(field));
}

function buildArchivedCampaignPipeline(profileId, lastDate, legacyPipeline) {
    const campaignLookup = legacyPipeline.find(stage => stage.$lookup?.as === 'campaign').$lookup;
    return [
        { $match: { profileId, reportDate: lastDate } },
        { $group: { _id: '$campaignId' } },
        // Reuse the exact legacy lookup/first-row rule, once per campaign.
        { $lookup: { ...campaignLookup, let: { ...campaignLookup.let, cId: '$_id', pId: profileId } } },
        { $unwind: '$campaign' },
        { $match: { 'campaign.status': { $in: ['ARCHIVED', 'archived'] } } },
        { $project: { _id: 0, campaignId: '$_id' } },
    ];
}

function buildFilteredTargetingPipeline(query, legacyPipeline, filterStages, { archivedCampaignIds } = {}) {
    const fields = referencedFields(filterStages);
    const knownField = field => metadataFields.has(field) || metricFields.has(field) || campaignFields.has(field) || adGroupFields.has(field) || field === 'bidThreshold';
    const unknown = [...fields].some(field => !knownField(field));
    const metricsNeeded = unknown || [...fields].some(field => metricFields.has(field));
    const adGroupNeeded = unknown || [...fields].some(field => adGroupFields.has(field));
    const thresholdNeeded = unknown || fields.has('bidThreshold');
    const skipCampaign = Array.isArray(archivedCampaignIds) && archivedCampaignIds.every(id => id !== null && id !== undefined) && canFilterWithoutCampaignJoin(filterStages);
    const firstLookup = legacyPipeline.findIndex(stage => stage.$lookup);
    if (firstLookup < 0) return [...legacyPipeline, ...filterStages];

    const joins = legacyPipeline.slice(firstLookup).flatMap(stage => {
        const alias = stage.$lookup?.as || stage.$unwind?.path?.replace(/^\$/, '');
        if (alias === 'campaign' && skipCampaign) return [];
        if ((alias === 'adGroup' && !adGroupNeeded) || (alias === 'bidThreshold' && !thresholdNeeded)) return [];
        if (stage.$lookup?.as === 'campaign' && !unknown) {
            const projection = { _id: 0, status: 1 };
            if (thresholdNeeded) projection.campaignId = 1;
            if (fields.has('campaignName')) projection.name = 1;
            if (fields.has('budget')) projection.budget = 1;
            if (fields.has('daysSinceCreation')) projection.startDate = 1;
            return [{ $lookup: { ...stage.$lookup, pipeline: stage.$lookup.pipeline.map(item => item.$project ? { $project: projection } : item) } }];
        }
        return [stage];
    });
    return [
        ...(metricsNeeded ? buildTargetingMetricsPipeline(query) : buildTargetingMetadataPipeline(query)),
        ...joins, ...filterStages,
        // Keep the source scan identical: prefiltering campaigns can change
        // same-date $last status selection when legacy duplicate copies disagree.
        ...(skipCampaign && archivedCampaignIds.length ? [{ $match: { $expr: { $not: [{ $in: ['$campaignId', archivedCampaignIds] }] } } }] : []),
    ];
}

module.exports = { buildFilteredTargetingPipeline, canFilterWithoutCampaignJoin, buildArchivedCampaignPipeline };
