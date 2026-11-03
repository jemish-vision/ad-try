const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuleSlotExecutionService } = require('../api-server/services/automation/ruleSlotExecution.service');
const identity = {configId:'config',profileId:42,ruleSchema:'TargetingRule',ruleId:'rule',ruleDate:'2026-10-18',scheduledTime:'00:00'};
const key = row => JSON.stringify(['configId','profileId','ruleSchema','ruleId','ruleDate','ruleTime'].map(k=>row[k]));
function matches(row, query) {
    return Object.entries(query).every(([k,v])=>{
        if (v && typeof v==='object' && !(v instanceof Date)) return Object.entries(v).every(([op,x])=>op==='$ne'?row[k]!==x:op==='$exists'?(row[k]!==undefined)===x:op==='$gt'?row[k]>x:false);
        if (v===null) return row[k]==null;
        if (v instanceof Date) return row[k] instanceof Date && +v===+row[k];
        return row[k]===v;
    });
}
function fixture({ realClock=false, leaseMs=1000, heartbeatMs=100 }={}) {
    const records=[];let clock=new Date('2026-10-18T00:00:00Z');let heartbeatFailure=false;
    const model={
        collection:{indexes:async()=>[{unique:true,key:{configId:1,profileId:1,ruleId:1,ruleSchema:1,ruleDate:1,ruleTime:1}}]},
        findOne(query) {return{lean:async()=>structuredClone(records.find(r=>matches(r,query))||null)};},
        async findOneAndUpdate(query,update,options={}) {
            if (heartbeatFailure && update.$set.slotHeartbeatAt && !update.$set.slotClaimedAt) throw new Error('fixture heartbeat disconnected');
            let record=records.find(r=>matches(r,query));
            if(!record&&options.upsert){const inserted=Object.fromEntries(Object.entries(query).filter(([k,v])=>v==null||typeof v!=='object'));Object.assign(inserted,structuredClone(update.$set));if(records.some(r=>key(r)===key(inserted)))throw Object.assign(new Error('unique slot'),{code:11000});record=inserted;records.push(record);}
            else if(record)Object.assign(record,structuredClone(update.$set));
            return structuredClone(record||null);
        }
    };
    return { records, model, service:createRuleSlotExecutionService({model,now:realClock?()=>new Date():()=>clock,leaseMs,heartbeatMs}),advance:ms=>{clock=new Date(+clock+ms);}, failHeartbeat:()=>{heartbeatFailure=true;}, seed:fields=>records.push({...identity,ruleTime:identity.scheduledTime,...fields}) };
}
test('40 concurrent first claims have exactly one owner; legacy completed row skips',async()=>{
    const f=fixture();const claims=await Promise.all(Array.from({length:40},()=>f.service.claimRuleSlot(identity)));
    assert.equal(claims.filter(c=>c.shouldExecute).length,1);assert.equal(f.records.length,1);
    assert(claims.filter(c=>!c.shouldExecute).every(c=>c.reason==='ACTIVE_CLAIM'));
    const old=fixture();old.seed({isRun:true});assert.equal((await old.service.claimRuleSlot(identity)).reason,'ALREADY_COMPLETED');assert.equal(old.records[0].slotState,undefined);
});
test('existing legacy uncompleted row is atomically claimed once',async()=>{
    const f=fixture();f.seed({isRun:false});const claims=await Promise.all(Array.from({length:20},()=>f.service.claimRuleSlot(identity)));
    assert.equal(claims.filter(c=>c.shouldExecute).length,1);assert.equal(f.records.length,1);
});
test('different dates, scheduled slots, profiles, rules and families remain independent',async()=>{
    const f=fixture();for(const change of [{},{ruleDate:'2026-10-19'},{scheduledTime:'01:00'},{profileId:43},{ruleId:'other'},{ruleSchema:'BudgetRule'},{configId:'other'}])assert.equal((await f.service.claimRuleSlot({...identity,...change})).shouldExecute,true);
    assert.equal(f.records.length,7);
});
test('completion is token fenced and existing completed slots never rerun',async()=>{
    const f=fixture(),claim=await f.service.claimRuleSlot(identity),wrong={...claim,ownerToken:'wrong'};
    assert.equal(await f.service.heartbeatRuleSlot(wrong),false);assert.equal(await f.service.failRuleSlot(wrong,new Error('wrong')),null);
    await assert.rejects(f.service.completeRuleSlot(wrong),{code:'RULE_SLOT_OWNERSHIP_LOST'});
    await f.service.completeRuleSlot(claim);assert.equal(f.records[0].isRun,true);assert.equal(f.records[0].slotState,'COMPLETED');
    assert.equal((await f.service.claimRuleSlot(identity)).reason,'ALREADY_COMPLETED');
    await assert.rejects(f.service.completeRuleSlot(claim),{code:'RULE_SLOT_OWNERSHIP_LOST'});
});
test('partial failure blocks retries and cannot be overwritten by a stale completion',async()=>{
    const f=fixture(),claim=await f.service.claimRuleSlot(identity);await f.service.failRuleSlot(claim,new Error('two of three Amazon actions applied'));
    assert.equal(f.records[0].isRun,false);assert.match(f.records[0].slotFailureReason,/two of three/);
    assert.equal((await f.service.claimRuleSlot(identity)).reason,'RECOVERY_REQUIRED');
    assert.equal(await f.service.heartbeatRuleSlot(claim),false);
    await assert.rejects(f.service.completeRuleSlot(claim),{code:'RULE_SLOT_OWNERSHIP_LOST'});
});
test('expired owner is not automatically reclaimed; recovery is explicit and fences owner',async()=>{
    const f=fixture(),claim=await f.service.claimRuleSlot(identity);f.advance(1001);
    assert.equal(await f.service.heartbeatRuleSlot(claim),false);
    await assert.rejects(f.service.completeRuleSlot(claim),{code:'RULE_SLOT_OWNERSHIP_LOST'});
    const blocked=await f.service.claimRuleSlot(identity);assert.equal(blocked.shouldExecute,false);assert.equal(blocked.reason,'RECOVERY_REQUIRED');
    assert.equal(f.records[0].slotOwnerToken,claim.ownerToken);assert.equal(f.records[0].slotState,'RECOVERY_REQUIRED');
});
test('heartbeat extends live ownership without allowing lease resurrection',async()=>{
    const f=fixture(),claim=await f.service.claimRuleSlot(identity);f.advance(900);assert.equal(await f.service.heartbeatRuleSlot(claim),true);f.advance(900);await f.service.assertRuleSlotActive(claim);f.advance(101);assert.equal(await f.service.heartbeatRuleSlot(claim),false);
});
test('an observer with stale expiry cannot overwrite a concurrent successful heartbeat',async()=>{
    const f=fixture(),claim=await f.service.claimRuleSlot(identity),stale=structuredClone(f.records[0]);
    f.advance(900);assert.equal(await f.service.heartbeatRuleSlot(claim),true);f.advance(200);
    const originalRead=f.model.findOne;let staleRead=true;
    f.model.findOne=query=>{if(staleRead&&query.slotState===undefined){staleRead=false;return{lean:async()=>stale};}return originalRead(query);};
    const other=await f.service.claimRuleSlot(identity);assert.equal(other.reason,'ACTIVE_CLAIM');assert.equal(f.records[0].slotState,'RUNNING');await f.service.assertRuleSlotActive(claim);
});
test('wrapper claims before work, commits successful work and skips later invocations',async()=>{
    const f=fixture();let actions=0;const first=await f.service.runWithRuleSlot(identity,async({assertActive})=>{await assertActive();actions++;return{affected:1};});
    assert.deepEqual(first.result,{affected:1});assert.equal(first.reason,'COMPLETED');
    const second=await f.service.runWithRuleSlot(identity,async()=>{actions++;});assert.equal(second.skipped,true);assert.equal(actions,1);
});
test('wrapper propagates partial failure, marks recovery and never retries actions',async()=>{
    const f=fixture();let actions=0;await assert.rejects(f.service.runWithRuleSlot(identity,async()=>{actions++;throw new Error('Amazon outcome uncertain');}),/outcome uncertain/);
    await assert.rejects(f.service.runWithRuleSlot(identity,async()=>{actions++;}),{code:'RULE_SLOT_RECOVERY_REQUIRED'});assert.equal(actions,1);assert.equal(f.records[0].isRun,false);
});
test('long work receives heartbeat renewal beyond its initial lease',async()=>{
    const f=fixture({realClock:true,leaseMs:160,heartbeatMs:20});const result=await f.service.runWithRuleSlot(identity,async({assertActive})=>{await new Promise(r=>setTimeout(r,240));await assertActive();return true;});assert.equal(result.reason,'COMPLETED');assert(+f.records[0].slotHeartbeatAt>+f.records[0].slotClaimedAt);
});
test('heartbeat transport failure fails closed and records recovery rather than completing',async()=>{
    const f=fixture({realClock:true,leaseMs:160,heartbeatMs:15});f.failHeartbeat();await assert.rejects(f.service.runWithRuleSlot(identity,async({assertActive})=>{await new Promise(r=>setTimeout(r,45));await assertActive();}),/heartbeat failed/);assert.equal(f.records[0].slotState,'RECOVERY_REQUIRED');assert.equal(f.records[0].isRun,false);
});
test('invalid identity or unowned completion cannot broaden a DB update',async()=>{
    const f=fixture();for(const change of [{scheduledTime:'00:03:00'},{scheduledTime:'24:00'},{profileId:null},{ruleDate:null},{ruleId:null}])await assert.rejects(f.service.claimRuleSlot({...identity,...change}),/requires/);
    await assert.rejects(f.service.completeRuleSlot({identity}),{code:'RULE_SLOT_OWNERSHIP_LOST'});assert.equal(f.records.length,0);
});
test('missing, partial or nonunique indexes fail before any claim is written',async()=>{
    for(const invalid of [[],[{key:{configId:1,profileId:1,ruleId:1,ruleSchema:1,ruleDate:1,ruleTime:1}}],[{unique:true,partialFilterExpression:{isRun:false},key:{configId:1,profileId:1,ruleId:1,ruleSchema:1,ruleDate:1,ruleTime:1}}]]){
        const f=fixture();f.model.collection.indexes=async()=>invalid;
        await assert.rejects(f.service.claimRuleSlot(identity),{code:'RULE_SLOT_INDEX_REQUIRED'});assert.equal(f.records.length,0);
    }
});
