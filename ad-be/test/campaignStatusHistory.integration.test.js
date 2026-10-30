const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fs = require("node:fs");
const vm = require("node:vm");
const moment = require("moment-timezone");
require("dotenv").config({ quiet: true });
const { createCampaignStatusRecorder } = require("../api-server/services/campaignStatusHistory.service");
let connection, db, observations, history, recorder;
const configId = new mongoose.Types.ObjectId("69809498df1b0ea4ae334fc5");
const base = { configId, profileId: 123, campaignId: 55, adType: "SP", dimension: "STATE" };
const origin = Date.now() - 3600000;
const at = seconds => new Date(origin + seconds * 1000);
let sequence = 100;
function entity(dimension = "STATE") { return { ...base, campaignId: sequence++, dimension }; }
before(async () => {
  connection = await mongoose.createConnection(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
  db = connection.useDb("advertiseiq_status_history_test_" + Date.now()).db;
  observations = db.collection("observations"); history = db.collection("history");
  recorder = createCampaignStatusRecorder({ observations, history });
});
after(async () => {
  if (db && db.databaseName.startsWith("advertiseiq_status_history_test_")) await db.dropDatabase();
  if (connection) await connection.close();
});
const rows = e => history.find({ changeLevel: e.campaignId }).sort({ createdAt: 1 }).toArray();
const observe = (e, value, seconds) => recorder.observe({ ...e, value, timestamp: at(seconds) });

test("baseline does not invent an initial change; source time is retained", async () => {
  const e = entity(); await observe(e, "ENABLED", 0); assert.equal((await rows(e)).length, 0);
  await observe(e, "PAUSED", 1); const records = await rows(e);
  assert.equal(records.length, 1); assert.equal(records[0].oldValue, "ENABLED");
  assert.equal(records[0].newValue, "PAUSED"); assert.equal(+records[0].createdAt, +at(1));
});
test("rapid repeated transitions and repeated values are handled independently", async () => {
  const e = entity(); for (const [value, time] of [["ENABLED",0],["PAUSED",1],["ENABLED",2],["PAUSED",3],["PAUSED",4]]) await observe(e,value,time);
  const records = await rows(e); assert.equal(records.length, 3);
  assert.deepEqual(records.map(r => r.newValue), ["PAUSED","ENABLED","PAUSED"]);
});
test("replaying an identical event never duplicates history", async () => {
  const e = entity(); await observe(e,"ENABLED",0);
  await Promise.all(Array.from({length:8},()=>observe(e,"PAUSED",1)));
  assert.equal((await rows(e)).length,1);
});
test("late events repair both their transition and the following transition", async () => {
  const e = entity(); await observe(e,"ENABLED",0); await observe(e,"ENABLED",3);
  assert.equal((await rows(e)).length,0); await observe(e,"PAUSED",1);
  const records=await rows(e); assert.deepEqual(records.map(r=>[r.oldValue,r.newValue,+r.createdAt]),[["ENABLED","PAUSED",+at(1)],["PAUSED","ENABLED",+at(3)]]);
});
test("concurrent workers and reversed arrival order converge to the source timeline", async () => {
  const e=entity(); await Promise.all([observe(e,"ENABLED",3),observe(e,"PAUSED",2),observe(e,"ENABLED",0),observe(e,"PAUSED",1)]);
  const records=await rows(e); assert.deepEqual(records.map(r=>[r.oldValue,r.newValue]),[["ENABLED","PAUSED"],["PAUSED","ENABLED"]]);
});
test("budget availability is independent from configuration and actual delivery", async () => {
  const e=entity("IN_BUDGET"); await observe(e,"IN_BUDGET",0); await observe(e,"OUT_OF_BUDGET",1); await observe(e,"IN_BUDGET",2); await observe(e,"OUT_OF_BUDGET",3);
  const records=await rows(e); assert.equal(records.length,3); assert.equal(records[0].changeType,"Update Campaign Budget Status");
  assert.ok(records.every(r=>r.oldValue!=="Delivering"&&r.newValue!=="Delivering"));
});
test("unknown source statuses and actual delivery states are preserved", async () => {
  const e=entity("DELIVERY"); await observe(e,"DELIVERING",0); await observe(e,"ADVERTISER_PAYMENT_FAILURE",1);
  assert.equal((await rows(e))[0].newValue,"ADVERTISER_PAYMENT_FAILURE");
});
test("same IDs in different profiles and ad products stay isolated", async () => {
  const e=entity(); await observe(e,"ENABLED",0); await observe({...e,profileId:999},"PAUSED",1); await observe({...e,adType:"SB"},"PAUSED",1);
  assert.equal((await rows(e)).length,0);
});
test("missing and invalid source timestamps are rejected without fake-time rows", async () => {
  const e=entity(); await assert.rejects(()=>recorder.observe({...e,value:"PAUSED"}),/source event timestamp/);
  await assert.rejects(()=>recorder.observe({...e,value:"PAUSED",timestamp:"invalid"}),/Invalid/); assert.equal((await rows(e)).length,0);
});
test("a failed projection is repaired by replaying the source event", async () => {
  const e=entity(); await observe(e,"ENABLED",0); let fail=true;
  const fragile=createCampaignStatusRecorder({observations,history:{deleteOne:(...a)=>history.deleteOne(...a),updateOne:(...a)=>{if(fail){fail=false;throw Error("fixture failure");}return history.updateOne(...a);}}});
  await assert.rejects(()=>fragile.observe({...e,value:"PAUSED",timestamp:at(1)}),/fixture failure/);
  await fragile.observe({...e,value:"PAUSED",timestamp:at(1)}); assert.equal((await rows(e)).length,1);
});
test("real budget processor records 97->100->99->100 without changing PAUSED", async () => {
  const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
  const fn=source.slice(source.indexOf("async function updateCampaignBudgetUsage("),source.indexOf("async function updateKeywordsHourlyData("));
  const updates=[]; const schema={updateMany:async(q,u)=>updates.push({q,u})};
  const e=entity("IN_BUDGET"); const context={Number,Date,moment,normalizeCampaignAdType:require("../api-server/services/campaignStatusHistory.service").normalizeCampaignAdType,observeCampaignStatus:p=>recorder.observe(p),eventDate:require("../api-server/services/campaignStatusHistory.service").eventDate,campaignsSchema:schema,sbCampaignsSchema:schema,sdCampaignsSchema:schema};
  vm.runInNewContext(fn+";globalThis.run=updateCampaignBudgetUsage;",context);
  for(const [index,usage] of [97,100,99,100].entries()) await context.run({budget:100,budget_usage_percentage:usage,budget_scope_id:e.campaignId,advertising_product_type:"sp",usage_updated_timestamp:at(index)},{configId,profileId:123,timezone:"UTC"});
  assert.equal((await rows(e)).length,3); assert.ok(updates.every(({u})=>!("status" in u.$set)));
  assert.equal(updates[1].u.$set["budgetTracking.isOutOfBudget"],true);
});


test("actual campaign-management processor records rapid changes before message deduplication", async () => {
 const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
 const fn=source.slice(source.indexOf("async function updateCampaignManagementData("),source.indexOf("async function updateAdgroupManagementData("));
 const e=entity();let previous=null;let markerCalls=0;
 class BidData { constructor(row){this.row=row;} async save(){previous=this.row;} static findOne(){return{sort(){return this;},lean:async()=>previous};} }
 class Marker {async save(){markerCalls++;}}
 const context={Number,Date,String,Array,JSON,console,normalizeCampaignAdType:require("../api-server/services/campaignStatusHistory.service").normalizeCampaignAdType,observeCampaignStatus:p=>recorder.observe(p),eventDate:require("../api-server/services/campaignStatusHistory.service").eventDate,
 bidDataSchema:BidData,processedSQSMessageSchema:Marker,campaignChangeHistorySchema:{findOne:()=>({lean:async()=>null})},ams_write_logs:()=>{}};
 vm.runInNewContext(fn+";globalThis.run=updateCampaignManagementData;",context);
 for(const [i,state]of ["ENABLED","PAUSED","ENABLED","PAUSED"].entries())await context.run({campaign_id:String(e.campaignId),dataset_id:"ads-campaign-management-campaigns",state,
 last_updated_date_time:at(i).toISOString(),idempotency_id:"id-"+i},{configId,profileId:123});
 const records=await rows(e);assert.equal(records.length,3);assert.equal(markerCalls,4);assert.equal(+records[2].createdAt,+at(3));
});

test("a rejected campaign update in HTTP 207 performs no local status or audit writes", async () => {
 const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
 const fn=source.slice(source.indexOf("exports.updateCampaignStatus ="),source.indexOf("// Sync Historical Status"));
 const writes=[];const schema={findOne:()=>({sort(){return this},lean:async()=>({status:"ENABLED"})}),updateMany:async()=>writes.push("status")};
 const context={exports:{},normalizeCampaignAdType:require("../api-server/services/campaignStatusHistory.service").normalizeCampaignAdType,getAccessToken:async()=>({adsAccessToken:"mock",adsClientId:"mock"}),getProfile:async()=>({amazonUrl:"https://example.invalid",timezone:"UTC"}),
 campaignsSchema:schema,sbCampaignsSchema:schema,sdCampaignsSchema:schema,campaignChangeHistorySchema:{create:async()=>writes.push("history")},
 amazonAxios:async()=>({status:207,data:{campaigns:{success:[],error:[{campaignId:55,code:"INVALID_ARGUMENT"}]}}}),retryWithBackoff:fn=>fn(),moment,write_logs:()=>{}};
 vm.runInNewContext(fn,context);const res={status(){return this},send(body){this.body=body;return this}};
 await context.exports.updateCampaignStatus({config:{configId},user:{_id:configId},body:{profileId:123,campaignId:55,status:"PAUSED"}},res);
 assert.equal(res.body.isSuccess,false);assert.deepEqual(writes,[]);
});


test("scheduled Campaign Listing invokes automatic status import after all product syncs", async () => {
 const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
 const fn=source.slice(source.indexOf("exports.cronListCampaignsFromAmazon ="),source.indexOf("async function processSPCampaigs("));
 const order=[];const profile={_id:configId,configId,profileId:123,name:"fixture",timezone:"UTC"};
 const context={exports:{},global:{},Number,String,Date,Promise,moment,limit:fn=>fn(),cron_logs:()=>{},
 getAllowedSyncProfiles:async()=>[{profileId:123,configId:String(configId)}],profileSchema:{find:()=>({lean:async()=>[profile]})},
 getAccessToken:async()=>({adsAccessToken:"mock"}),processSPCampaigs:async()=>order.push("SP"),processSBCampaigs:async()=>order.push("SB"),processSDCampaigs:async()=>order.push("SD"),
 syncProfileCampaignStatusHistory:async()=>order.push("history"),cronJobHistorySchema:{findOneAndUpdate:()=>({lean:async()=>({})})}};
 vm.runInNewContext(fn,context);await context.exports.cronListCampaignsFromAmazon({});assert.deepEqual(order,["SP","SB","SD","history"]);
});

test("successful manual updates record history only after entity-level Amazon success", async () => {
 const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
 const fn=source.slice(source.indexOf("exports.updateCampaignStatus ="),source.indexOf("// Sync Historical Status"));
 const writes=[];let requested;const schema={findOne:()=>({sort(){return this},lean:async()=>({status:"ENABLED"})}),updateMany:async()=>writes.push("status")};
 const context={exports:{},normalizeCampaignAdType:require("../api-server/services/campaignStatusHistory.service").normalizeCampaignAdType,
 getAccessToken:async()=>({adsAccessToken:"mock",adsClientId:"mock"}),getProfile:async()=>({amazonUrl:"https://example.invalid",timezone:"UTC"}),
 campaignsSchema:schema,sbCampaignsSchema:schema,sdCampaignsSchema:schema,campaignChangeHistorySchema:{create:async row=>writes.push(row)},
 amazonAxios:async p=>{requested=p;return{status:207,data:{campaigns:{success:[{campaignId:55}],error:[]}}}},retryWithBackoff:fn=>fn(),moment,write_logs:()=>{}};
 vm.runInNewContext(fn,context);const res={status(){return this},send(body){this.body=body;return this}};
 await context.exports.updateCampaignStatus({config:{configId},user:{_id:configId},headers:{adtype:"SB"},body:{profileId:123,campaignId:55,status:"PAUSED"}},res);
 assert.equal(res.body.isSuccess,true);assert.ok(requested.url.endsWith("/sb/v4/campaigns"));assert.equal(writes[1].type,"SB");assert.equal(writes[1].statusHistoryEvent,true);
});


test("portfolio budget events are not recorded as campaign changes", async () => {
 const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
 const fn=source.slice(source.indexOf("async function updateCampaignBudgetUsage("),source.indexOf("async function updateKeywordsHourlyData("));
 let calls=0;const context={String,observeCampaignStatus:()=>calls++};vm.runInNewContext(fn+";globalThis.run=updateCampaignBudgetUsage;",context);
 assert.equal(await context.run({budget_scope_type:"PORTFOLIO"},{}),true);assert.equal(calls,0);
});
test("Amazon long-form ad-product names normalize to the displayed ad type", async () => {
 const e=entity();await observe({...e,adType:"SPONSORED_PRODUCTS"},"ENABLED",0);await observe({...e,adType:"SP"},"PAUSED",1);
 const records=await rows(e);assert.equal(records.length,1);assert.equal(records[0].type,"SP");
});


test("budget notifications use the existing derived status resolver, not mutated Enabled/Paused state", async () => {
 const source=fs.readFileSync(require.resolve("../api-server/controllers/campaign.controller"),"utf8");
 const fn=source.slice(source.indexOf("exports.budgetMonitor ="),source.indexOf("const sleep =",source.indexOf("exports.budgetMonitor =")));
 let lastMatch;class Cron {async save(){}}
 const context={exports:{},moment,Promise,cron_logs:()=>{},limit:fn=>fn(),getActivePlanProfiles:async()=>[{configId,profileId:123,timezone:"UTC"}],
 getRuleDate:()=>({fromDate:"2026-10-23",toDate:"2026-10-30"}),campaignPipeline:async()=>[],resolveMatchingCampaignIdsByStatus:async()=>({matchingCampaignIds:[55]}),
 campaignsSchema:{aggregate:p=>{lastMatch=p.at(-1).$match;return{allowDiskUse:async()=>[]}}},cronJobHistorySchema:Cron};
 vm.runInNewContext(fn,context);await context.exports.budgetMonitor();assert.deepEqual(Array.from(lastMatch.campaignId.$in),[55]);
});
