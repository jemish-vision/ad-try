const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { SYNC_TASKS } = require('../queue-service/queues/queueNames');
const errors = require('../queue-service/contracts/errors');

function fixture({ status = 'STAGED', controllerResult = 'STAGED', missing = false, shadow = false } = {}) {
  const states = [];
  let controllerArgs;
  const sync = {
    checkPrerequisiteStatus: async () => ({ ready: true }),
    claimSyncRun: async () => ({ shouldExecute: true, record: { _id: 'sync' } }),
    markSyncRunCompleted: async () => states.push('COMPLETED'),
    markSyncRunFailed: async () => states.push('FAILED'),
    markSyncRunWaiting: async () => states.push('WAITING'),
  };
  const reports = ['spTargeting', 'sbTargeting', 'sdTargeting'].map(reportTypeId => ({ reportTypeId, status }));
  const ctx = { module: { exports: {} }, require(name) {
    if (name === 'moment-timezone') return require('moment-timezone');
    if (name === './profileEligibility.service') return { getEligibleProfile: async () => ({ timezone: 'Asia/Kolkata', name: 'Test' }) };
    if (name.includes('automationMode')) return { isShadowModeEnabled: () => shadow };
    if (name === './syncRun.service') return sync;
    if (name.includes('queueNames')) return { SYNC_TASKS };
    if (name.includes('contracts/errors')) return errors;
    if (name === '../../models/report.model') return { find: filter => {
      assert.equal(filter.startDate, '2026-10-28');
      assert.equal(filter.endDate, '2026-10-28');
      assert.equal(filter.$or[0].createdAt.$gte.toISOString(), '2026-10-28T12:00:00.000Z');
      assert.equal(filter.$or[1].completedAt.$gte.toISOString(), '2026-10-28T12:00:00.000Z');
      assert.ok(filter.$or[2].status.$in.includes('PENDING'));
      return { sort() { return this; }, select() { return this; }, lean: async () => missing ? [] : reports };
    } };
    if (name === '../../controllers/targeting.controller') return { cronGenerateTargetingReport: async (...args) => { controllerArgs = args; return controllerResult; } };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../api-server/services/automation/hourlySync.service.js'), 'utf8'), ctx);
  return { states, run: () => ctx.module.exports.runHourlySyncForProfile({ task: SYNC_TASKS.TARGETING_REPORT, configId: 'config', profileId: 1, timeBlock: '20261028T12Z', scheduledFor: '2026-10-28T12:00:00Z', jobId: 'job' }), args: () => controllerArgs };
}

test('staged imports keep targeting sync WAITING, never COMPLETED', async () => {
  const f = fixture();
  await assert.rejects(f.run(), e => e.name === 'ReportImportPendingError');
  assert.deepEqual(f.states, ['WAITING']);
});
test('only verified Mongo reports complete targeting sync', async () => {
  const f = fixture({ status: 'COMPLETED', controllerResult: 'STAGED' });
  assert.equal((await f.run()).success, true);
  assert.deepEqual(f.states, ['COMPLETED']);
  assert.equal(f.args()[2].recurring, false, 'queue polling must reuse reports, not start recurring recursion');
  assert.equal(f.args()[2].startDate, '2026-10-28');
  assert.equal(f.args()[2].reportRequestedAfter, '2026-10-28T12:00:00Z');
});
test('Amazon errors fail the job instead of reporting success', async () => {
  const f = fixture({ controllerResult: 'ERROR' });
  await assert.rejects(f.run(), /Targeting report request failed/);
  assert.deepEqual(f.states, ['FAILED']);
});
test('missing reports are pending rather than vacuously complete', async () => {
  const f = fixture({ missing: true });
  await assert.rejects(f.run(), e => e.name === 'ReportImportPendingError');
  assert.deepEqual(f.states, ['WAITING']);
});
test('a terminal Mongo report failure fails sync', async () => {
  const f = fixture({ status: 'FAILED' });
  await assert.rejects(f.run(), /Targeting report import failed/);
  assert.deepEqual(f.states, ['FAILED']);
});
test('shadow execution never reads reports or invokes Amazon controller', async () => {
  const f = fixture({ shadow: true });
  assert.equal((await f.run()).dryRun, true);
  assert.equal(f.args(), undefined);
  assert.deepEqual(f.states, ['COMPLETED']);
});
