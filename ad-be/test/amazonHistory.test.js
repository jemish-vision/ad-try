const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync(require.resolve("../api-server/services/amazonHistory.service"),"utf8");
const helpers=require("../api-server/services/campaignStatusHistory.service");
const params={profile:{_id:"profile",amazonUrl:"https://example.invalid",profileId:123,configId:"69809498df1b0ea4ae334fc5"},checkConfigAds:{adsClientId:"mock",adsAccessToken:"mock"},campaignIds:[55]};
const event={entityType:"CAMPAIGN",entityId:"55",changeType:"STATUS",previousValue:"PAUSED",newValue:"ENABLED",timestamp:Date.now()-60000};
function fixture(responder=()=>({status:200,data:{events:[event]}})){
 const calls=[],ops=[],checkpoints=[];const module={exports:{}};
 vm.runInNewContext(source,{module,Date,Set,require:name=>{
  if(name==="mongoose")return require("mongoose");
  if(name==="../helper/amazonAxios")return async p=>{calls.push(p);return responder(p,calls.length)};
  if(name==="../helper/retryHelper")return{retryWithBackoff:fn=>fn()};
  if(name==="./campaignStatusHistory.service")return helpers;
  if(name==="../models/campaignChangeHistory.model")return{collection:{bulkWrite:async o=>{ops.push(...o);return{upsertedCount:o.length}}}};
  if(name==="../models/profiles.model")return{collection:{updateOne:async(q,u)=>checkpoints.push(u)}};
  if(/Campaign.model|campaign.model/.test(name))return{distinct:async()=>[55]};
  throw Error(name);
 }});return{api:module.exports,calls,ops,checkpoints};
}
test("required profile arguments are validated",async()=>{
 await assert.rejects(()=>fixture().api.fetchAmazonCampaignStatusHistory({...params,profile:null}),/Missing required profile/);
});
test("campaign parents and campaign IDs use the nested Amazon request shape",async()=>{
 const f=fixture();await f.api.fetchAmazonCampaignStatusHistory(params);const p=f.calls[0].data;
 assert.equal(p.parents,undefined);assert.equal(p.eventTypes.CAMPAIGN.parents[0].useProfileIdAdvertiser,true);
 assert.deepEqual(Array.from(p.eventTypes.CAMPAIGN.eventTypeIds),["55"]);assert.equal(p.campaignIds,undefined);
});
test("modern token pagination imports every page",async()=>{
 const f=fixture((_p,n)=>({status:200,data:{events:[{...event,timestamp:event.timestamp+n}],...(n<3?{nextToken:"page"+(n+1)}:{})}}));
 assert.equal((await f.api.fetchAmazonCampaignStatusHistory(params)).length,3);
 assert.equal(f.calls[1].data.nextToken,"page2");assert.equal(f.calls[1].data.pageOffset,undefined);
});
test("legacy pageOffset pagination imports all 201 records",async()=>{
 const f=fixture((_p,n)=>({status:200,data:{events:Array.from({length:n<3?100:1},()=>event),totalRecords:201}}));
 assert.equal((await f.api.fetchAmazonCampaignStatusHistory(params)).length,201);
 assert.deepEqual(f.calls.map(r=>r.data.pageOffset),[0,1,2]);
});
test("pagination rejects repeated tokens and incomplete responses",async()=>{
 await assert.rejects(()=>fixture(()=>({status:200,data:{events:[event],nextToken:"repeat"}})).api.fetchAmazonCampaignStatusHistory(params),/repeated/);
 await assert.rejects(()=>fixture(()=>({status:200,data:{events:[],totalRecords:10}})).api.fetchAmazonCampaignStatusHistory(params),/before all/);
});
test("upstream 401 and failed later pages cannot report a successful sync",async()=>{
 const denied=fixture(()=>{throw Error("401 Unauthorized")});await assert.rejects(()=>denied.api.syncAmazonCampaignStatusHistory(params),/401/);assert.equal(denied.ops.length,0);
 const later=fixture((_p,n)=>{if(n===2)throw Error("429 exhausted");return{status:200,data:{events:[event],nextToken:"next"}}});
 await assert.rejects(()=>later.api.syncAmazonCampaignStatusHistory(params),/429/);assert.equal(later.ops.length,0);
});
test("the real parser preserves source times and unknown status values",async()=>{
 const f=fixture(()=>({status:200,data:{events:[{...event,newValue:"FUTURE_STATE"}]}}));await f.api.syncAmazonCampaignStatusHistory(params);
 const row=f.ops[0].updateOne.update.$setOnInsert;assert.equal(String(row.configId),params.profile.configId);assert.equal(row.configId._bsontype,"ObjectId");assert.equal(row.newValue,"FUTURE_STATE");assert.equal(+row.createdAt,event.timestamp);assert.equal(row.statusHistoryEvent,true);
});
test("IN_BUDGET booleans do not fabricate actual Delivering status",async()=>{
 const f=fixture(()=>({status:200,data:{events:[{...event,changeType:"IN_BUDGET",previousValue:false,newValue:true}]}}));await f.api.syncAmazonCampaignStatusHistory(params);
 const row=f.ops[0].updateOne.update.$setOnInsert;assert.equal(row.oldValue,"OUT_OF_BUDGET");assert.equal(row.newValue,"IN_BUDGET");
});
test("missing original timestamps fail instead of inventing the import time",async()=>{
 const f=fixture(()=>({status:200,data:{events:[{...event,timestamp:undefined}]}}));await assert.rejects(()=>f.api.syncAmazonCampaignStatusHistory(params),/source event timestamp/);assert.equal(f.ops.length,0);
});
test("import is idempotent and scoped to the selected campaigns",async()=>{
 const f=fixture(()=>({status:200,data:{events:[event,{...event,entityId:"99"}]}}));await f.api.syncAmazonCampaignStatusHistory(params);await f.api.syncAmazonCampaignStatusHistory(params);
 assert.equal(f.ops.length,2);assert.equal(String(f.ops[0].updateOne.filter._id),String(f.ops[1].updateOne.filter._id));
});
test("automatic sync checks all ad products and saves watermarks only after success",async()=>{
 const f=fixture();await f.api.syncProfileCampaignStatusHistory({...params,campaignIds:undefined});assert.equal(f.checkpoints.length,3);
 const denied=fixture(()=>{throw Error("upstream rejected")});await assert.rejects(()=>denied.api.syncProfileCampaignStatusHistory({...params,campaignIds:undefined}),/rejected/);assert.equal(denied.checkpoints.length,0);
});
test("recently synchronized profiles avoid repeated automatic backfills",async()=>{
 const f=fixture();await f.api.syncProfileCampaignStatusHistory({...params,profile:{...params.profile,campaignStatusHistorySyncedAt:{SP:new Date(),SB:new Date(),SD:new Date()}}});assert.equal(f.calls.length,0);
});
