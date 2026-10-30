const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const sift = require('sift').default;
// The handler runs in a VM. Sift uses instanceof for regex/date matching, so
// translate query values to this realm rather than changing query semantics.
function nativeQuery(value) {
  if (require('node:util').types.isRegExp(value)) return new RegExp(value.source, value.flags);
  if (require('node:util').types.isDate(value)) return new Date(value.getTime());
  if (Array.isArray(value)) return Array.from(value, nativeQuery);
  if (value && typeof value === 'object' && !value._bsontype) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, nativeQuery(entry)]));
  return value;
}
const match = filter => sift(nativeQuery(filter));

const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers/campaign.controller.js'), 'utf8');
const handler = source.slice(source.indexOf('exports.getHistory ='), source.indexOf('exports.getLatestCampaignHistory ='));
const configId = new mongoose.Types.ObjectId('69809498df1b0ea4ae334fc5');
const profileId = 2630925322373862;
const campaignId = 120020904398942;
const targetId = 'T-251559355683609';
const common = { configId, profileId, changeLevel: campaignId, targetId, targeting: 'complements', type: 'SP', updatedFrom: 'Targeting', changeType: 'Update Targeting Bid', matchType: 'Auto' };
const history = [
  { ...common, _id: 'rec', source: 'RECOMMENDATION', oldValue: '1', newValue: '2', createdAt: new Date('2026-10-25') },
  { ...common, _id: 'day', source: 'DAYPARTING', oldValue: '2', newValue: '3', createdAt: new Date('2026-10-24') },
];
const stream = [{ _id: 'stream', configId, profileId, campaignId: String(campaignId), targetId, targeting: 'complements', oldBid: 3, bid: 4, last_updated_date_time: '2026-10-26T12:00:00Z' }];

function query(rows) {
  let result = Array.isArray(rows) ? [...rows] : rows;
  return {
    sort(fields) { if (Array.isArray(result)) result.sort((a, b) => {
      for (const [field, direction] of Object.entries(fields)) {
        if (a[field] < b[field]) return -direction;
        if (a[field] > b[field]) return direction;
      }
      return 0;
    }); return this; },
    skip(n) { result = result.slice(n); return this; }, limit(n) { result = result.slice(0, n); return this; },
    select() { return this; }, project() { return this; }, lean: async () => result, toArray: async () => result,
  };
}
async function run(historyScope, extra = {}, fixture = {}) {
  const fixtureHistory = fixture.history || history;
  const fixtureStream = fixture.stream || stream;
  const failures = [];
  const streamFilters = [];
  const emptyModel = { find: () => query([]) };
  const context = {
    exports: {}, Date, mongoose: { Types: mongoose.Types, connection: { collection: () => ({ find: () => query([]) }) } }, moment, sift: match,
    AD_TYPE_COLLECTIONS: { SP: { campaign: 'campaigns', adGroup: 'ad_groups', targeting: 'targetings' } },
    profileSchema: { findOne: () => query({ timezone: 'UTC' }) },
    campaignChangeHistorySchema: { find: filter => query(fixtureHistory.filter(match(filter))), countDocuments: async filter => fixtureHistory.filter(match(filter)).length },
    targetingHistorySchema: { find: filter => { streamFilters.push(filter); return query(fixtureStream.filter(match(filter))); } },
    bidDataSchema: emptyModel, targetingRuleSchema: { find: () => query(fixture.hourlyRules || []) }, placementRulesSchema: emptyModel, budgetRulesSchema: emptyModel,
    campaignsSchema: emptyModel, targetingSchema: emptyModel,
    console: { error: (...args) => failures.push(args) }, write_logs: entry => failures.push(entry), setImmediate: () => {},
  };
  vm.runInNewContext(handler, context);
  const req = { config: { configId }, adType: 'SP', body: { profileId, campaignId, targetId, targeting: 'complements', pageNo: 1, perPage: 10, historyScope, ...extra } };
  const res = { status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } };
  await context.exports.getHistory(req, res);
  assert.equal(res.code, 200, JSON.stringify(failures));
  assert.deepEqual(failures, []);
  return { ...res.body, streamFilters };
}

for (const [scope, expected] of [
  [['recommendation'], ['rec']],
  [['recommendation', 'dayparting'], ['rec', 'day']],
  [['dayparting'], ['day']],
  [['dayparting', 'other'], ['stream', 'day']],
  [['other'], ['stream']],
  [['recommendation', 'other'], ['stream', 'rec']],
  [['recommendation', 'dayparting', 'other'], ['stream', 'rec', 'day']],
  ['all', ['stream', 'rec', 'day']],
  [' Recommendation ', ['rec']],
  [[], ['stream', 'rec', 'day']],
]) {
  test(`scope ${JSON.stringify(scope)} filters both history stores`, async () => {
    const res = await run(scope);
    assert.deepEqual(Array.from(res.data, row => row._id), expected);
    assert.equal(res.totalRecords, expected.length);
  });
}
test('scope filtering happens before pagination and total calculation', async () => {
  const res = await run(['recommendation', 'dayparting'], { pageNo: 2, perPage: 1 });
  assert.deepEqual(Array.from(res.data, row => row._id), ['day']);
  assert.equal(res.totalRecords, 2);
  assert.equal(res.totalPages, 2);
});
test('stream lookup remains scoped to the requested config', async () => {
  const res = await run('all');
  assert.equal(String(res.streamFilters[0].configId), String(configId));
});
test('source and date filters also apply to appended stream records', async () => {
  assert.equal((await run('all', { source: 'Recommendation' })).data.some(row => row._id === 'stream'), false);
  assert.equal((await run('all', { fromDate: '2026-10-01', toDate: '2026-10-25' })).data.some(row => row._id === 'stream'), false);
});
test('change type filters do not reintroduce stream bid changes into status history', async () => {
  const res = await run('all', { type: ['Status'] });
  assert.equal(res.totalRecords, 0);
});

const mixed = {
  history: [{ ...history[0], source: undefined }, history[1]],
  stream: [...stream, ...history.map((row, i) => ({
    ...stream[0], _id: `echo-${i}`, oldBid: Number(row.oldValue), bid: Number(row.newValue),
    last_updated_date_time: new Date(row.createdAt.getTime() + 10000).toISOString(),
  }))],
};
for (const scope of ['other', 'recommendation', 'dayparting', ['recommendation', 'other'], ['dayparting', 'other'], ['dayparting', 'recommendation']]) {
  test(`mixed echoes: ${JSON.stringify(scope)} is exactly its subset of All`, async () => {
    const all = await run('all', {}, mixed);
    const selected = await run(scope, {}, mixed);
    const scopes = Array.isArray(scope) ? scope : [scope];
    const expected = all.data.filter(row => scopes.includes(row.triggerSource === 'Recommendation' ? 'recommendation' : row.triggerSource === 'Dayparting' ? 'dayparting' : 'other'));
    assert.deepEqual(Array.from(selected.data, row => row._id), Array.from(expected, row => row._id));
    assert.equal(selected.totalRecords, expected.length);
    assert.equal(all.totalRecords, 3);
  });
}
test('Amazon source filter cannot resurrect echoes of recommendation/dayparting changes', async () => {
  const res = await run('all', { source: 'Amazon API' }, mixed);
  assert.deepEqual(Array.from(res.data, row => row._id), ['stream']);
});
test('date range cannot resurrect an echo across the authoritative event date boundary', async () => {
  const fixture = { history: [{ ...history[0], createdAt: new Date('2026-10-24T23:59:59Z') }], stream: [{ ...mixed.stream[1], last_updated_date_time: '2026-10-25T00:00:05Z' }] };
  const res = await run('all', { fromDate: '2026-10-25', toDate: '2026-10-25' }, fixture);
  assert.equal(res.totalRecords, 0);
});
test('ascending sort and pagination are applied after canonicalization', async () => {
  const all = await run('all', { sortType: 'ASC' }, mixed);
  assert.deepEqual(Array.from(all.data, row => row._id), ['day', 'rec', 'stream']);
  const page = await run(['other', 'recommendation'], { sortType: 'ASC', perPage: 1, pageNo: 2 }, mixed);
  assert.deepEqual(Array.from(page.data, row => row._id), ['stream']);
  assert.equal(page.totalRecords, 2);
  assert.equal(page.totalPages, 2);
});
test('joined-field sorting uses the same canonical scope set', async () => {
  const res = await run('other', { fieldName: 'updatedBy', sortType: 'ASC' }, mixed);
  assert.deepEqual(Array.from(res.data, row => row._id), ['stream']);
  assert.equal(res.totalRecords, 1);
});
test('legacy hourly rule changes own their echoes before scope filtering', async () => {
  const fixture = { ...mixed, history: [{ ...history[0], source: 'RULE', changeType: 'Rule (Hourly bid): Targeting bid adjusted' }], hourlyRules: [{ ruleName: 'Hourly bid' }] };
  assert.equal((await run('dayparting', {}, fixture)).data[0].triggerSource, 'Dayparting');
  assert.equal((await run('other', {}, fixture)).data.some(row => row._id === 'echo-0'), false);
});
test('scoped totals do not silently truncate at 1000 records', async () => {
  const rows = Array.from({ length: 1005 }, (_, i) => ({ ...stream[0], _id: `row-${i}`, oldBid: i, bid: i + 0.1 }));
  const res = await run('other', { pageNo: 101, perPage: 10 }, { history: [], stream: rows });
  assert.equal(res.totalRecords, 1005);
  assert.equal(res.data.length, 5);
});
test('a different explicit target ID with the same target text is excluded', async () => {
  const fixture = { history: [{ ...history[0], targetId: 'T-different' }, history[1]], stream: [] };
  assert.deepEqual(Array.from((await run('all', {}, fixture)).data, row => row._id), ['day']);
});
test('legacy rows without a target ID remain eligible by exact targeting text', async () => {
  const fixture = { history: [{ ...history[0], targetId: undefined }], stream: [] };
  assert.equal((await run('recommendation', {}, fixture)).totalRecords, 1);
});
test('deduplication preserves different target IDs when querying a target text', async () => {
  const fixture = { history: [history[0], { ...history[0], _id: 'other-target', targetId: 'T-other' }], stream: [] };
  assert.equal((await run('all', { targetId: undefined }, fixture)).totalRecords, 2);
});
test('deduplication preserves known different ad groups', async () => {
  const fixture = { history: [{ ...history[0], adGroupId: 1 }, { ...history[0], _id: 'other-adgroup', adGroupId: 2 }], stream: [] };
  assert.equal((await run('all', {}, fixture)).totalRecords, 2);
});
test('stream ad-group identity survives normalization and deduplication', async () => {
  const fixture = { history: [{ ...history[0], adGroupId: 'a' }], stream: [{ ...mixed.stream[1], adGroupId: 'b' }] };
  const res = await run('all', {}, fixture);
  assert.equal(res.totalRecords, 2);
  assert.equal(res.data.find(row => row._id === 'echo-0').adGroupId, 'b');
});
for (const [source, changeType, expectedScope, label] of [
  [undefined, 'Revert Targeting Bid', 'recommendation', 'Recommendation'],
  ['RULE', 'Update Targeting Bid', 'other', 'Rule'],
  ['MANUAL', 'Update Targeting Bid', 'other', 'Manual'],
]) {
  test(`classifier partitions ${source || changeType} consistently with response label`, async () => {
    const fixture = { history: [{ ...history[0], source, changeType }], stream: [] };
    const all = await run('all', {}, fixture);
    assert.equal(all.data[0].triggerSource, label);
    for (const scope of ['other', 'recommendation', 'dayparting']) {
      assert.equal((await run(scope, {}, fixture)).totalRecords, scope === expectedScope ? 1 : 0);
    }
  });
}


test('campaign default history includes state, budget availability, and delivery transitions', async () => {
  const rows = ['Update Campaign Status','Update Campaign Budget Status','Update Campaign Delivery Status'].map((changeType,i)=>({
    configId,profileId,changeLevel:campaignId,type:'SP',_id:'status-'+i,changeType,oldValue:'ENABLED',newValue:'PAUSED',
    source:'AMAZON_SQS',updatedFrom:'Amazon Stream',statusHistoryEvent:true,createdAt:new Date(Date.now()+i*1000),
  }));
  const result=await run('all',{targeting:undefined,targetId:undefined,type:'Campaign'},{history:rows,stream:[]});
  assert.equal(result.totalRecords,3);
});
test('genuine repeated campaign transitions are not collapsed by 24-hour generic deduplication', async () => {
  const rows=[0,60,120].map((seconds,i)=>({configId,profileId,changeLevel:campaignId,type:'SP',_id:'repeat-'+i,
    changeType:'Update Campaign Status',oldValue:i===1?'PAUSED':'ENABLED',newValue:i===1?'ENABLED':'PAUSED',source:'AMAZON_SQS',
    statusHistoryEvent:true,updatedFrom:'Amazon Stream',createdAt:new Date(Date.now()+seconds*1000)}));
  const result=await run('all',{targeting:undefined,targetId:undefined,type:'Status'},{history:rows,stream:[]});
  assert.equal(result.totalRecords,3);
});
