const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const identity = { configId: 'config', profileId: 123, reportName: 'CAMPAIGNS', reportTypeId: 'sbCampaigns', startDate: '2026-10-28', endDate: '2026-11-05' };
const row = (status, id, createdAt = '2026-11-06T05:00:00Z') => ({ ...identity, status, _id: id, reportId: id, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });
function fixture(initial = [], { busy = false, loseLock = false, getStatus = 'PENDING' } = {}) {
  const rows = initial.map(r => ({ ...r })), calls = [], updates = [], locks = [], released = [], renewed = [], timers = new Set();
  let held = false, beforeAcquire, beforePost;
  const model = {
    findOne(query) {
      let order;
      return {
        sort(value) { order = value; return this; },
        lean: async () => {
          let matches = rows.filter(r => Object.entries(query).every(([k, v]) => k === 'status' ? v.$in.includes(r.status) : String(r[k]) === String(v)));
          if (order) matches.sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)));
          return matches[0] && { ...matches[0] };
        },
      };
    },
    create: async record => { const created = { ...record, _id: `db-${rows.length}`, createdAt: new Date(), updatedAt: new Date() }; rows.push(created); return created; },
    updateOne: async (query, update) => { updates.push(update); Object.assign(rows.find(r => r._id === query._id), update.$set); },
  };
  const staging = {
    acquireImportLock: async (scope, ttl) => {
      locks.push({ scope, ttl });
      if (busy || held) return null;
      held = true;
      if (beforeAcquire) await beforeAcquire();
      return 'token';
    },
    releaseImportLock: async (scope, token) => { released.push({ scope, token }); held = false; },
    renewImportLock: async (scope, token, ttl) => { renewed.push({ scope, token, ttl }); return !loseLock; },
    checkImportLock: async () => held && !loseLock,
  };
  let helper;
  const helperPath = path.join(__dirname, '../api-server/services/reportRequest.service.js');
  if (fs.existsSync(helperPath)) {
    const ctx = { module: { exports: {} },
      setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
      require(name) {
        if (name === '../models/report.model') return model;
        if (name === './reportStaging.service') return staging;
        if (name.includes('logger')) return { cron_logs: () => {} };
        throw new Error(`Unexpected require ${name}`);
      },
    };
    vm.runInNewContext(fs.readFileSync(helperPath, 'utf8'), ctx);
    helper = ctx.module.exports;
  }
  const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers/campaign.controller.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('async function sbGenerateReport('), end = source.indexOf('\nasync function ', start + 1);
  const ctx = {
    path,
    __dirname: path.join(__dirname, '../api-server/controllers'),
    getOrCreateReportRequest: helper?.getOrCreateReportRequest,
    getProfile: async () => ({ amazonUrl: 'https://amazon.invalid' }),
    reportsSchema: model,
    retryWithBackoff: async fn => fn(),
    amazonAxios: async request => {
      calls.push(request);
      if (request.method === 'POST') {
        if (beforePost) await beforePost();
        return { data: { reportId: `amazon-${calls.length}`, status: 'PENDING' } };
      }
      return { data: { status: getStatus, url: 'https://amazon.invalid/file' } };
    },
    downloadFile: async () => {},
    unzipReport: async () => {},
    stageReportFileInRedis: async data => { calls.push({ method: 'STAGE', data }); },
    processStagedReportBatches: async entities => { calls.push({ method: 'DRAIN', entities }); },
    cron_logs: () => {}, getAxiosErrorMessage: err => err.message,
  };
  vm.runInNewContext(`${source.slice(start, end)};globalThis.generate=sbGenerateReport;`, ctx);
  return { rows, calls, updates, locks, released, renewed, timers, model,
    beforeAcquire: fn => { beforeAcquire = fn; }, beforePost: fn => { beforePost = fn; },
    run: (recurring = false) => ctx.generate(identity.profileId, identity.startDate, identity.endDate, {}, identity.configId, 'UTC', recurring),
  };
}

for (const recurring of [false, true]) {
  test(`failed historical row does not hide an existing pending request (recurring=${recurring})`, async () => {
    const f = fixture([row('FAILED', 'failed', '2026-11-06T00:00:00Z'), row('PENDING', 'pending')]);
    for (let i = 0; i < 3; i++) assert.equal(await f.run(recurring), 'PENDING');
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
    assert.equal(f.calls.filter(c => c.method === 'GET').length, 3);
    assert.ok(f.calls.every(c => c.url.endsWith('/pending')));
    assert.equal(f.rows.length, 2);
  });
}

test('uses newest reusable request even if the newest overall row failed', async () => {
  const f = fixture([row('PENDING', 'older', '2026-11-06T01:00:00Z'), row('PENDING', 'newer'), row('FAILED', 'failed', '2026-11-06T06:00:00Z')]);
  await f.run();
  assert.ok(f.calls[0].url.endsWith('/newer'));
});

test('newer completed request prevents replaying older pending duplicates', async () => {
  const f = fixture([row('PENDING', 'old', '2026-11-06T01:00:00Z'), row('COMPLETED', 'done')]);
  assert.equal(await f.run(), 'COMPLETED');
  assert.equal(f.calls.length, 0);
});

for (const status of ['STAGED', 'IMPORTING', 'VERIFYING', 'WRITE_FAILED']) {
  test(`reuses ${status} import older than two hours without failing or replacing it`, async () => {
    const f = fixture([row(status, 'staged', '2026-11-01T00:00:00Z')]);
    assert.equal(await f.run(), status);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].method, 'DRAIN');
    assert.equal(f.updates.length, 0);
  });
}

test('concurrent callers create at most one new Amazon request', async () => {
  const f = fixture([row('FAILED', 'failed')]);
  await Promise.all([f.run(), f.run()]);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.rows.filter(r => r.status === 'PENDING').length, 1);
  assert.equal(f.released.length, 1);
  assert.equal(f.timers.size, 0);
});

test('busy creation lock waits without creating another request', async () => {
  const f = fixture([], { busy: true });
  assert.equal(await f.run(), 'PENDING');
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows.length, 0);
});

test('rechecks Mongo under the lock before contacting Amazon', async () => {
  const f = fixture();
  f.beforeAcquire(async () => { f.rows.push(row('PENDING', 'other-writer')); });
  await f.run();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  assert.ok(f.calls[0].url.endsWith('/other-writer'));
  assert.equal(f.released.length, 1);
});

test('request creation error releases the lock and heartbeat', async () => {
  const f = fixture();
  f.beforePost(async () => { throw new Error('Amazon unavailable'); });
  assert.equal(await f.run(), 'ERROR');
  assert.equal(f.rows.length, 0);
  assert.equal(f.released.length, 1);
  assert.equal(f.timers.size, 0);
});

test('subsequent calls poll the newly saved ID instead of creating again', async () => {
  const f = fixture([row('FAILED', 'failed')]);
  for (let i = 0; i < 3; i++) await f.run();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.calls.filter(c => c.method === 'GET').length, 2);
});

test('lost creation lease prevents the Amazon request', async () => {
  const f = fixture([], { loseLock: true });
  assert.equal(await f.run(), 'ERROR');
  assert.equal(f.calls.length, 0);
  assert.equal(f.released.length, 1);
});

test('renews creation lease while Amazon is slow and clears heartbeat afterward', async () => {
  const f = fixture();
  let unblock, started;
  const waiting = new Promise(resolve => { unblock = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  f.beforePost(async () => { started(); await waiting; });
  const running = f.run();
  await ready;
  assert.equal(f.timers.size, 1);
  await [...f.timers][0]();
  assert.equal(f.renewed.length, 1);
  assert.equal(f.renewed[0].scope, f.locks[0].scope);
  assert.equal(f.renewed[0].token, 'token');
  assert.equal(f.renewed[0].ttl, 300);
  assert.ok(f.locks[0].scope.includes('config:123:CAMPAIGNS:sbCampaigns:2026-10-28:2026-11-05'));
  unblock();
  await running;
  assert.equal(f.timers.size, 0);
});

test('Mongo save failure also releases the request lock', async () => {
  const f = fixture();
  f.model.create = async () => { throw new Error('Mongo unavailable'); };
  assert.equal(await f.run(), 'ERROR');
  assert.equal(f.released.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.rows.length, 0);
});

test('ready existing report follows normal staging and verified completion without another POST', async () => {
  const f = fixture([
    row('FAILED', 'failed', '2026-11-06T00:00:00Z'),
    row('PENDING', 'older-pending', '2026-11-06T01:00:00Z'),
    row('PENDING', 'ready'),
  ], { getStatus: 'COMPLETED' });
  assert.equal(await f.run(), 'STAGED');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  assert.ok(f.calls.find(c => c.method === 'GET').url.endsWith('/ready'));
  const staged = f.calls.find(c => c.method === 'STAGE').data;
  assert.equal(staged.entity, 'sbCampaign');
  assert.equal(staged.meta.reportId, 'ready');
  assert.equal(staged.meta.startDate, identity.startDate);
  assert.equal(staged.meta.endDate, identity.endDate);
  assert.equal(f.rows.find(r => r._id === 'ready').status, 'STAGED');
  // A further poll drains the staged run instead of requesting/downloading again.
  assert.equal(await f.run(), 'STAGED');
  assert.equal(f.calls.filter(c => c.method === 'GET').length, 1);
  assert.equal(f.calls.filter(c => c.method === 'STAGE').length, 1);
  // Simulate the verified batch writer's completion; older duplicates stay intact.
  f.rows.find(r => r._id === 'ready').status = 'COMPLETED';
  assert.equal(await f.run(), 'COMPLETED');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  assert.equal(f.rows.find(r => r._id === 'older-pending').status, 'PENDING');
});
