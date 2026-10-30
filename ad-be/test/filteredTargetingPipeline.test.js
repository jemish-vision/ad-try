const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { buildFilteredTargetingPipeline, buildArchivedCampaignPipeline, canFilterWithoutCampaignJoin } = require('../api-server/helper/filteredTargetingPipeline');
const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers/targeting.controller.js'), 'utf8');
const context = { exports: {}, AD_TYPE_COLLECTIONS: { SP: { campaign: 'campaigns', adGroup: 'ad_groups' } } };
vm.runInNewContext(source.slice(source.indexOf('exports.targetingPipeline ='), source.indexOf('exports.manualGenerateReport =')), context);
const query = { configId: 'config', profileId: 7, reportDate: { $gte: '2026-10-23', $lte: '2026-10-29' } };
const legacy = () => context.exports.targetingPipeline(query, '2026-10-29', 'SP');
const aliases = pipeline => pipeline.filter(stage => stage.$lookup).map(stage => stage.$lookup.as);
const status = [{ $match: { status: 'ENABLED' } }];

test('status-only membership needs neither daily metrics nor per-target joins after archive precheck', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), status, { archivedCampaignIds: [3] });
    assert.deepEqual(aliases(result), []);
    assert.equal(JSON.stringify(result).includes('dailyMetrics'), false);
    assert.equal(result[0].$match, query, 'archive exclusion must not alter the source scan/tie order');
    assert.ok(result.includes(status[0]));
    assert.deepEqual(result.at(-1), { $match: { $expr: { $not: [{ $in: ['$campaignId', [3]] }] } } });
});
test('without archive precheck the campaign check remains', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), status);
    assert.deepEqual(aliases(result), ['campaign']);
    assert.ok(result.some(stage => stage.$match?.campaignStatus?.$nin));
});
test('default campaign lookup is covered by status fields only', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), status);
    const lookup = result.find(stage => stage.$lookup).$lookup;
    assert.deepEqual(lookup.pipeline.find(stage => stage.$project).$project, { _id: 0, status: 1 });
});
test('aggregate metric and expression filters keep the daily-deduplicated metric calculation', () => {
    const filters = [{ $match: { $expr: { $gt: ['$acos', 10] } } }];
    const result = buildFilteredTargetingPipeline(query, legacy(), filters, { archivedCampaignIds: [] });
    assert.equal(JSON.stringify(result).includes('dailyMetrics'), true);
    assert.deepEqual(aliases(result), []);
    assert.deepEqual(result.at(-1), filters[0]);
});
test('ad-group filters retain their join and campaign archive check', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), [{ $match: { adGroupStatus: 'ENABLED' } }]);
    assert.deepEqual(aliases(result), ['campaign', 'adGroup']);
});
test('threshold filters retain campaign ID and threshold lookup', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), [{ $match: { 'bidThreshold.minBid': { $gt: 0 } } }]);
    assert.deepEqual(aliases(result), ['campaign', 'bidThreshold']);
    assert.equal(result.find(stage => stage.$lookup?.as === 'campaign').$lookup.pipeline.find(stage => stage.$project).$project.campaignId, 1);
});
test('creation-date filters retain the campaign start date', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), [{ $match: { daysSinceCreation: { $gt: 10 } } }]);
    assert.equal(result.find(stage => stage.$lookup?.as === 'campaign').$lookup.pipeline.find(stage => stage.$project).$project.startDate, 1);
});
test('unknown dependencies conservatively retain all joins and metrics', () => {
    const result = buildFilteredTargetingPipeline(query, legacy(), [{ $match: { absent: { $exists: false } } }]);
    assert.deepEqual(aliases(result), ['campaign', 'adGroup', 'bidThreshold']);
    assert.equal(JSON.stringify(result).includes('dailyMetrics'), true);
});
test('archive precheck preserves the exact original first-row lookup rule', () => {
    const original = legacy().find(stage => stage.$lookup?.as === 'campaign').$lookup;
    const result = buildArchivedCampaignPipeline(7, '2026-10-29', legacy());
    assert.deepEqual(result[0], { $match: { profileId: 7, reportDate: '2026-10-29' } });
    const lookup = result.find(stage => stage.$lookup).$lookup;
    assert.equal(lookup.pipeline.length, original.pipeline.length);
    assert.equal(JSON.stringify(lookup.pipeline), JSON.stringify(original.pipeline));
    assert.equal(lookup.let.cId, '$_id');
    assert.equal(lookup.let.pId, 7);
});
test('logical and expression dependencies cannot bypass required joins', () => {
    assert.equal(canFilterWithoutCampaignJoin([{ $match: { $or: [{ status: 'ENABLED' }, { campaignStatus: 'PAUSED' }] } }]), false);
    assert.equal(canFilterWithoutCampaignJoin([{ $match: { $expr: { $eq: ['$campaignName', 'Name'] } } }]), false);
});
test('ambiguous legacy null campaign IDs retain the original join path', () => {
    assert.deepEqual(aliases(buildFilteredTargetingPipeline(query, legacy(), status, { archivedCampaignIds: [null] })), ['campaign']);
});
