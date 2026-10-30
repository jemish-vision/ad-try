// Group once per target. Ordered, compact metric tuples preserve daily maxima
// without creating and sorting an intermediate document for every target/day.
const buildTargetingMetricsPipeline = query => {
    const metrics = ['impressions', 'clicks', 'orders', 'spend', 'sales', 'topOfSearchImpressionShare'];
    const at = (input, index) => ({ $arrayElemAt: [input, index] });
    const latestDayMax = {
        $reduce: {
            input: '$dailyMetrics',
            initialValue: { date: null, daily: metrics.map(() => null), completed: [] },
            in: {
                $cond: [
                    { $eq: [at('$$this', 0), '$$value.date'] },
                    { date: '$$value.date', completed: '$$value.completed', daily: metrics.map((_, index) => ({ $max: [at('$$value.daily', index), at('$$this', index + 1)] })) },
                    { date: at('$$this', 0), completed: { $cond: [{ $eq: ['$$value.date', null] }, [], { $concatArrays: ['$$value.completed', ['$$value.daily']] }] }, daily: metrics.map((_, index) => at('$$this', index + 1)) },
                ]
            }
        }
    };
    return [
        { $match: query },
        { $sort: { reportDate: 1 } },
        {
            $group: {
                _id: {
                    campaignId: '$campaignId', adGroupId: '$adGroupId', profileId: '$profileId',
                    targetingKey: { $cond: [
                        { $and: [{ $ne: ['$targeting', null] }, { $ne: ['$targeting', ''] }] },
                        { $toLower: { $trim: { input: '$targeting' } } }, '$targetId'
                    ] },
                    keywordType: { $ifNull: ['$keywordType', { $switch: {
                        branches: ['EXACT', 'PHRASE', 'BROAD'].map(type => ({ case: { $regexMatch: { input: { $ifNull: ['$matchType', ''] }, regex: new RegExp(type, 'i') } }, then: type })),
                        default: '$matchType'
                    } }] }
                },
                dailyMetrics: { $push: { $concatArrays: [['$reportDate', ...metrics.map(field => field === 'topOfSearchImpressionShare'
                    ? { $toDouble: { $ifNull: [`$${field}`, '0'] } } : { $ifNull: [`$${field}`, null] })]] } },
                realTargetId: { $max: { $cond: [{ $regexMatch: { input: { $ifNull: ['$targetId', ''] }, regex: /^R-/i } }, null, '$targetId'] } },
                fallbackTargetId: { $last: '$targetId' },
                targeting: { $first: '$targeting' },
                // The latest day's bid is the max of that day's duplicate copies.
                latestBid: { $max: { date: '$reportDate', bid: { $ifNull: ['$keywordBid', null] } } },
                reportDate: { $last: '$reportDate' }, status: { $last: '$status' }
            }
        },
        { $set: { dailySummary: latestDayMax } },
        { $set: {
            ...Object.fromEntries(metrics.map((field, index) => {
                const values = { $map: { input: { $concatArrays: ['$dailySummary.completed', ['$dailySummary.daily']] }, as: 'day', in: at('$$day', index) } };
                // $sum/$avg retain MongoDB's compensated numeric accumulation;
                // repeated $add would introduce visible floating-point drift.
                return [field, { [field === 'topOfSearchImpressionShare' ? '$avg' : '$sum']: values }];
            })),
            targetId: { $ifNull: ['$realTargetId', '$fallbackTargetId'] },
            keywordBid: '$latestBid.bid',
            '_id.targetId': { $ifNull: ['$realTargetId', '$fallbackTargetId'] },
            profileId: '$_id.profileId', campaignId: { $ifNull: ['$_id.campaignId', null] }, adGroupId: { $ifNull: ['$_id.adGroupId', null] },
            keywordType: { $ifNull: ['$_id.keywordType', null] }, matchType: { $ifNull: ['$_id.keywordType', null] }
        } },
        { $unset: ['dailyMetrics', 'dailySummary', 'latestBid'] },
    ];
};

module.exports = { buildTargetingMetricsPipeline };
