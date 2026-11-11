const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function writerFixture({ blocked = 0, healthyPending = false, healthyNew = false, failingBatches = 0, verifiedCount = 0, cronHistoryId, entity = 'campaign', stagedKeys = [], mongoDocs = [] } = {}) {
  const runs = new Map();
  const pending = [];
  const fresh = [];
  const writes = [];
  const updates = [];
  const deleted = [];
  const confirmed = new Set();
  const logs = [];
  const finalizedHistories = [];
  const statuses = Object.fromEntries(['STAGING', 'READY', 'IMPORTING', 'WRITE_FAILED', 'COMPLETED', 'VALIDATION_FAILED'].map(s => [s, s]));
  let id = 0;
  function add(run, batch, status = 'READY', list = pending) {
    if (!runs.has(run)) runs.set(run, { importRunId: run, reportId: run, configId: 'config', profileId: 1, entity, status, expectedBatches: 100, processedBatches: 0 });
    list.push({ id: `${++id}-0`, message: { importRunId: run, batchId: batch } });
  }
  for (let i = 0; i < blocked; i++) add(`blocked${i}`, `blocked${i}`, 'STAGING');
  if (healthyPending) add('healthy', 'healthy');
  if (healthyNew) add('new', 'new', 'READY', fresh);
  for (let i = 0; i < failingBatches; i++) add('failing', `bad${i}`);
  const payloads = new Set([...pending, ...fresh].map(msg => msg.message.batchId));
  const ack = async (_stream, _group, msgId) => {
    const i = pending.findIndex(m => m.id === msgId);
    if (i >= 0) pending.splice(i, 1);
  };
  const chain = rows => ({ select() { return this; }, limit() { return this; }, lean: async () => rows });
  const redis = {
    xAutoClaim: async () => ({ messages: [], nextId: '0-0' }),
    sMembers: async () => stagedKeys,
    sIsMember: async (key, batchId) => confirmed.has(`${key}:${batchId}`) ? 1 : 0,
    xReadGroup: async (_group, _consumer, streams) => {
      const cursor = streams[0].id;
      let messages;
      if (cursor === '>') { messages = fresh.splice(0, 10); pending.push(...messages); }
      else messages = pending.filter(m => Number(m.id.split('-')[0]) > Number(cursor.split('-')[0])).slice(0, 10);
      return [{ messages }];
    },
    get: async key => payloads.has(key.replace('batch:', '')) ? JSON.stringify([{ batch: key.replace('batch:', '') }]) : null,
    xAck: ack,
    xDel: async (_stream, msgId) => deleted.push(msgId),
    del: async () => 1,
    expire: async () => 1,
  };
  const staging = {
    STREAM_KEY_PREFIX: 'stream:', BATCH_KEY_PREFIX: 'batch:', MANIFEST_KEY_PREFIX: 'manifest:', CONSUMER_GROUP: 'group', RUN_STATUS: statuses,
    getRunManifest: async run => ({ ...runs.get(run) }),
    saveRunManifest: async (run, update) => Object.assign(runs.get(run), update),
    ensureConsumerGroup: async () => {},
    acquireImportLock: async () => {
      if (staging.beforeAcquire) await staging.beforeAcquire();
      return Object.hasOwn(staging, 'lockResult') ? staging.lockResult : 'token';
    },
    renewImportLock: async () => {}, checkImportLock: async () => true, releaseImportLock: async () => {},
    atomicBatchConfirm: async ({ streamKey, streamMsgId, importRunId, batchId, finalManifestUpdates }) => {
      const key = `manifest:${importRunId}:batches:${batchId}`;
      if (!confirmed.has(key)) runs.get(importRunId).processedBatches++;
      confirmed.add(key);
      if (finalManifestUpdates) Object.assign(runs.get(importRunId), finalManifestUpdates);
      payloads.delete(batchId);
      await ack(streamKey, 'group', streamMsgId);
    },
  };
  const context = { module: { exports: {} }, process, setInterval, clearInterval, require(name) {
    if (name === './redis.service') return { redisClient: redis };
    if (name === './reportStaging.service') return staging;
    if (name === '../models/report.model') return { find: () => chain([]), findOne: () => chain({ status: 'STAGED', cronHistoryId }), updateOne: async (filter, update) => updates.push({ filter, update }) };
    if (name === './reportHistoryCompletion.service') return { finalizeReportHistory: async id => finalizedHistories.push(id) };
    if (name === 'mongoose') return require('mongoose');
    if (name === '../models/campaign.model') return { countDocuments: async () => verifiedCount };
    if (name === '../helper/reportNormalization.helper') return { buildMongoUpsertOp: row => row };
    if (name === '../helper/reportExtendedEntities.helper') return {
      EXTENDED_REPORT_ENTITIES: ['targeting', 'sbTargeting', 'sdTargeting'],
      isExtendedEntity: value => ['targeting', 'sbTargeting', 'sdTargeting'].includes(value),
      getExtendedModel: () => ({ find: () => chain(mongoDocs) }),
      buildExtendedUpsertOp: row => row,
    };
    if (name === '../helper/common') return { parallelBulkWrite: async (_model, ops) => { writes.push(ops[0].batch); if (staging.writeError) throw staging.writeError; if (ops[0].batch.startsWith('bad')) throw new Error('temporary write failure'); } };
    if (name.includes('logger')) return { write_logs: log => logs.push(log) };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../api-server/services/reportBatchWriter.service.js'), 'utf8'), context);
  return { run: () => context.module.exports.processStagedReportBatches([entity]), runEntities: entities => context.module.exports.processStagedReportBatches(entities), runs, writes, updates, deleted, pending, redis, confirmed, payloads, staging, logs, finalizedHistories };
}

test('blocked pending entries do not hide a healthy later pending batch', async () => {
  const f = writerFixture({ blocked: 10, healthyPending: true });
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.ok(f.writes.includes('healthy'));
  assert.equal(f.pending.length, 10);
});

test('blocked pending entries do not prevent new batches from being read', async () => {
  const f = writerFixture({ blocked: 10, healthyNew: true });
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.ok(f.writes.includes('new'));
});

test('five distinct failing batches do not exhaust one another\'s retries', async () => {
  const f = writerFixture({ failingBatches: 5 });
  await f.run();
  assert.equal(f.updates.length, 0);
  assert.equal(f.deleted.length, 0);
  assert.equal(f.pending.length, 5);
  assert.equal(f.runs.get('failing').status, 'WRITE_FAILED');
});

test('a failing pending batch does not starve a healthy new report', async () => {
  const f = writerFixture({ failingBatches: 1, healthyNew: true });
  await f.run();
  assert.ok(f.writes.includes('new'));
  assert.equal(f.writes.filter(b => b === 'bad0').length, 1, 'do not burn retries in one invocation');
});

test('five real failures of the same batch preserve the terminal error', async () => {
  const f = writerFixture({ failingBatches: 1 });
  for (let i = 0; i < 5; i++) await f.run();
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].update.$set.status, 'FAILED');
  assert.match(f.updates[0].update.$set.errorMessage, /temporary write failure/);
});

test('reclaim follows Redis cursor even when a scanned page has no idle messages', async () => {
  const f = writerFixture({ healthyPending: true });
  const cursors = [];
  f.redis.xReadGroup = async () => [{ messages: [] }];
  f.redis.xAutoClaim = async (_stream, _group, _consumer, _idle, cursor) => {
    cursors.push(cursor);
    return cursor === '0-0'
      ? { messages: [], nextId: '1-0' }
      : { messages: [f.pending[0]], nextId: '0-0' };
  };
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(cursors, ['0-0', '1-0']);
});

test('a legacy report-wide retry counter does not fail a fresh batch', async () => {
  const f = writerFixture({ failingBatches: 1 });
  f.runs.get('failing').failedAttempts = 50;
  await f.run();
  assert.equal(f.runs.get('failing')['batchAttempts:bad0'], 1);
  assert.equal(f.updates.length, 0);
});

test('empty stream stops without spinning', async () => {
  const f = writerFixture();
  let reads = 0;
  f.redis.xReadGroup = async () => { reads++; return []; };
  assert.equal((await f.run()).totalBatchesProcessed, 0);
  assert.equal(reads, 2);
});

test('final Mongo verification failure keeps the batch retryable and never completes report', async () => {
  const f = writerFixture({ healthyPending: true });
  Object.assign(f.runs.get('healthy'), { expectedBatches: 1, expectedUniqueKeys: 1 });
  assert.equal((await f.run()).totalBatchesProcessed, 0);
  assert.equal(f.runs.get('healthy').status, 'WRITE_FAILED');
  assert.match(f.runs.get('healthy').lastError, /Verification Failure/);
  assert.equal(f.updates.length, 0);
  assert.equal(f.pending.length, 1);
});

test('confirmed batch with deleted payload is cleaned up without failing the run', async () => {
  const f = writerFixture({ healthyPending: true });
  f.confirmed.add('manifest:healthy:batches:healthy');
  f.payloads.delete('healthy');
  Object.assign(f.runs.get('healthy'), { status: 'IMPORTING', processedBatches: 1 });
  let payloadReads = 0;
  f.redis.get = async () => { payloadReads++; return null; };
  assert.equal((await f.run()).totalBatchesProcessed, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(payloadReads, 0);
  assert.equal(f.runs.get('healthy').status, 'IMPORTING');
  assert.equal(f.runs.get('healthy').processedBatches, 1);
  assert.equal(f.runs.get('healthy')['batchAttempts:healthy'], undefined);
  assert.equal(f.pending.length, 0);
  assert.equal(f.deleted.length, 1);
});

test('confirmed batch is not rewritten or counted again even if payload remains', async () => {
  const f = writerFixture({ healthyPending: true });
  f.confirmed.add('manifest:healthy:batches:healthy');
  f.runs.get('healthy').processedBatches = 1;
  assert.equal((await f.run()).totalBatchesProcessed, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.runs.get('healthy').processedBatches, 1);
});

test('another writer can confirm a batch between its initial read and lock acquisition', async () => {
  const f = writerFixture({ healthyPending: true });
  f.staging.beforeAcquire = async () => {
    await f.staging.atomicBatchConfirm({ streamKey: 'stream:campaign', streamMsgId: '1-0', importRunId: 'healthy', batchId: 'healthy' });
  };
  await f.run();
  assert.equal(f.writes.length, 0);
  assert.equal(f.updates.length, 0);
  assert.equal(f.runs.get('healthy')['batchAttempts:healthy'], undefined);
  assert.equal(f.runs.get('healthy').processedBatches, 1);
});

test('completed run observed after acquiring the lock cleans up the stale entry', async () => {
  const f = writerFixture({ healthyPending: true });
  f.staging.beforeAcquire = async () => { f.runs.get('healthy').status = 'COMPLETED'; };
  await f.run();
  assert.equal(f.pending.length, 0);
  assert.equal(f.deleted.length, 1);
  assert.equal(f.writes.length, 0);
  assert.equal(f.updates.length, 0);
});

test('processed-marker check runs under the lock and uses the run-specific set', async () => {
  const f = writerFixture({ healthyPending: true });
  let locked = false;
  f.staging.beforeAcquire = async () => { locked = true; };
  f.redis.sIsMember = async (key, batchId) => {
    assert.equal(locked, true);
    assert.equal(key, 'manifest:healthy:batches');
    assert.equal(batchId, 'healthy');
    return true;
  };
  await f.run();
  assert.equal(f.writes.length, 0);
  assert.equal(f.pending.length, 0);
});

test('confirmed stale batch does not block an unprocessed healthy report', async () => {
  const f = writerFixture({ healthyPending: true, healthyNew: true });
  f.confirmed.add('manifest:healthy:batches:healthy');
  f.payloads.delete('healthy');
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(f.writes, ['new']);
  assert.equal(f.runs.get('healthy')['batchAttempts:healthy'], undefined);
});

test('missing payload without a committed marker still fails rather than falsely completing', async () => {
  const f = writerFixture({ healthyPending: true });
  f.payloads.delete('healthy');
  for (let i = 0; i < 4; i++) {
    await f.run();
    assert.equal(f.pending.length, 1);
    assert.equal(f.updates.length, 0);
    assert.equal(f.runs.get('healthy').status, 'WRITE_FAILED');
  }
  await f.run();
  assert.equal(f.updates[0].update.$set.status, 'FAILED');
  assert.match(f.updates[0].update.$set.errorMessage, /not found in Redis/);
  assert.equal(f.writes.length, 0);
});

test('scans multiple blocked pending pages and bounds diagnostic run samples', async () => {
  const f = writerFixture({ blocked: 25, healthyPending: true });
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(f.writes, ['healthy']);
  const summaries = f.logs.filter(log => log.message.startsWith('[Report Batch Skipped]'));
  assert.equal(summaries.length, 1);
  const summary = JSON.parse(summaries[0].message.slice('[Report Batch Skipped] '.length));
  assert.equal(summary.entity, 'campaign');
  assert.equal(summary.reasons.staging, 25);
  assert.equal(summary.sampleRunIds.length, 5);
  assert.equal(f.pending.length, 25);
});

test('busy scope leaves its batch retryable without hiding another ready report', async () => {
  const f = writerFixture({ healthyPending: true, healthyNew: true });
  let locks = 0;
  f.staging.beforeAcquire = async () => { f.staging.lockResult = ++locks === 1 ? null : 'token'; };
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(f.writes, ['new']);
  assert.equal(f.pending.length, 1);
  assert.equal(f.runs.get('healthy').status, 'READY');
  assert.ok(f.logs.some(log => log.message.includes('"lockBusy":1')));
});

test('same message returned by reclaim and pending reads is written only once', async () => {
  const f = writerFixture({ healthyPending: true });
  const message = f.pending[0];
  f.redis.xAutoClaim = async () => ({ messages: [message], nextId: '0-0' });
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(f.writes, ['healthy']);
  assert.equal(f.runs.get('healthy').processedBatches, 1);
});

test('current manifest count under the lock drives final verification and report history completion', async () => {
  const f = writerFixture({ healthyPending: true, verifiedCount: 1, cronHistoryId: 'history' });
  Object.assign(f.runs.get('healthy'), { expectedBatches: 2, expectedUniqueKeys: 1 });
  f.staging.beforeAcquire = async () => { f.runs.get('healthy').processedBatches = 1; };
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(f.writes, ['healthy']);
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].update.$set.status, 'COMPLETED');
  assert.equal(f.updates[0].update.$set.verifiedRows, 1);
  assert.deepEqual(f.finalizedHistories, ['history']);
  assert.equal(f.runs.get('healthy').status, 'COMPLETED');
  assert.equal(f.runs.get('healthy').processedBatches, 2);
  assert.equal(f.payloads.has('healthy'), false);
});

for (const entity of ['targeting', 'sbTargeting', 'sdTargeting']) {
  test(`${entity} drains past blocked batches, verifies Mongo rows, and completes the report`, async () => {
    const identity = { targetId: 'T1', reportDate: '2026-10-29' };
    const f = writerFixture({
      entity, blocked: 12, healthyNew: true,
      stagedKeys: [`v2:${JSON.stringify(Object.entries(identity))}`],
      mongoDocs: [{ ...identity, lastImportRunId: 'new', importSourceVersion: 1, spend: 12 }],
    });
    Object.assign(f.runs.get('new'), { expectedBatches: 1, expectedUniqueKeys: 1, sourceVersion: 1, expectedSpend: 12 });
    assert.equal((await f.run()).totalBatchesProcessed, 1);
    assert.deepEqual(f.writes, ['new']);
    assert.equal(f.updates[0].update.$set.status, 'COMPLETED');
    assert.equal(f.updates[0].update.$set.verifiedRows, 1);
    assert.equal(f.runs.get('new').status, 'COMPLETED');
    assert.equal(f.pending.length, 12);
  });
}


test('pool outages preserve payload and data retry budget across repeated attempts', async () => {
  const f = writerFixture({ healthyPending: true });
  const error = Object.assign(new Error('Timed out while checking out a connection from connection pool'), { name: 'MongoWaitQueueTimeoutError' });
  f.staging.writeError = error;
  for (let i = 0; i < 6; i++) await assert.rejects(f.run(), { name: error.name });
  assert.equal(f.pending.length, 1);
  assert.equal(f.payloads.size, 1);
  assert.equal(f.deleted.length, 0);
  assert.equal(f.updates.length, 0);
  assert.equal(f.runs.get('healthy')['batchAttempts:healthy'], undefined);
  f.staging.writeError = null;
  assert.equal((await f.run()).totalBatchesProcessed, 1);
});

test('concurrent background drains for an entity share active work', async () => {
  const f = writerFixture({ healthyPending: true });
  const results = await Promise.all(Array.from({ length: 30 }, () => f.run()));
  assert.equal(f.writes.length, 1);
  assert.ok(results.every(result => result.totalBatchesProcessed === 1));
  assert.equal((await f.run()).totalBatchesProcessed, 0);
});

test('different entities use one process lane and duplicates coalesce', async () => {
  const f = writerFixture();
  let active = 0, maxActive = 0;
  f.redis.xAutoClaim = async () => {
    maxActive = Math.max(maxActive, ++active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { messages: [], nextId: '0-0' };
  };
  await Promise.all([f.runEntities(['campaign', 'targeting', 'campaign']), f.runEntities(['targeting'])]);
  assert.equal(maxActive, 1);
});

for (const name of ['MongoNetworkTimeoutError', 'MongoNetworkError', 'MongoServerSelectionError']) {
  test(`${name} leaves the batch pending without a data failure`, async () => {
    const f = writerFixture({ healthyPending: true });
    f.staging.writeError = Object.assign(new Error('database temporarily unavailable'), { name });
    await assert.rejects(f.run(), { name });
    assert.equal(f.pending.length, 1);
    assert.equal(f.payloads.size, 1);
    assert.equal(f.runs.get('healthy')['batchAttempts:healthy'], undefined);
    assert.equal(f.updates.length, 0);
  });
}


for (const status of ['READY', 'IMPORTING', 'WRITE_FAILED']) {
  test(`replayed batch preserves ${status} run verification keys and manifest lifetime`, async () => {
    const keys = ['expected-row'];
    const f = writerFixture({ healthyPending: true, stagedKeys: keys });
    Object.assign(f.runs.get('healthy'), { status, processedBatches: 1, expectedBatches: 2 });
    f.confirmed.add('manifest:healthy:batches:healthy');
    let expirations = 0;
    f.redis.del = async key => { if (key === 'manifest:healthy:keys') keys.length = 0; };
    f.redis.expire = async () => { expirations++; };
    await f.run();
    assert.deepEqual(keys, ['expected-row']);
    assert.equal(expirations, 0);
    assert.equal(f.pending.length, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.runs.get('healthy').processedBatches, 1);
  });
}

test('replay followed by final batch retains exact-key verification and completes the report', async () => {
  const identity = { targetId: 'T1', reportDate: '2026-11-06' };
  const keys = [`v2:${JSON.stringify(Object.entries(identity))}`];
  const f = writerFixture({ entity: 'targeting', healthyPending: true, stagedKeys: keys,
    mongoDocs: [{ ...identity, lastImportRunId: 'healthy', importSourceVersion: 1, spend: 12 }] });
  Object.assign(f.runs.get('healthy'), { status: 'IMPORTING', expectedBatches: 2, processedBatches: 1,
    expectedUniqueKeys: 1, sourceVersion: 1, expectedSpend: 12 });
  f.confirmed.add('manifest:healthy:batches:healthy');
  f.pending.push({ id: '2-0', message: { importRunId: 'healthy', batchId: 'final' } });
  f.payloads.add('final');
  f.redis.del = async key => { if (key === 'manifest:healthy:keys') keys.length = 0; };
  assert.equal((await f.run()).totalBatchesProcessed, 1);
  assert.deepEqual(f.writes, ['final']);
  assert.equal(f.runs.get('healthy').status, 'COMPLETED');
  assert.equal(f.updates[0].update.$set.verifiedRows, 1);
  assert.equal(f.pending.length, 0);
});


test('completed run still cleans up verification keys and expires the manifest', async () => {
  const f = writerFixture({ healthyPending: true });
  const removed = [], expired = [];
  f.staging.beforeAcquire = async () => { f.runs.get('healthy').status = 'COMPLETED'; };
  f.redis.del = async key => removed.push(key);
  f.redis.expire = async (key, seconds) => expired.push([key, seconds]);
  await f.run();
  assert.deepEqual(removed, ['manifest:healthy:keys']);
  assert.deepEqual(expired, [['manifest:healthy', 300]]);
  assert.equal(f.pending.length, 0);
  assert.equal(f.writes.length, 0);
});
