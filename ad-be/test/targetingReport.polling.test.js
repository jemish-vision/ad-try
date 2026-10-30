const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.resolve(__dirname, '../api-server/controllers/targeting.controller.js'), 'utf8');
for (const [name, entity] of [['spGenerateReport', 'targeting'], ['sbGenerateReport', 'sbTargeting'], ['sdGenerateReport', 'sdTargeting']]) {
  for (const status of ['STAGED', 'IMPORTING', 'WRITE_FAILED']) {
    test(`${entity} reuses ${status} queue report even after two hours`, async () => {
      const start = code.indexOf(`async function ${name}(`);
      const end = code.indexOf('\n};', start) + 3;
      let filter, drained;
      const ctx = {
        getProfile: async () => ({}),
        reportsSchema: {
          findOne(query) {
            filter = query;
            return { sort(order) { assert.equal(order.createdAt, -1); return this; }, lean: async () => ({ status, updatedAt: new Date(Date.now() - 3 * 3600000) }) };
          },
          updateOne() { throw new Error('must not fail a report solely because it is old'); },
        },
        processStagedReportBatches: async entities => { drained = entities[0]; },
        cron_logs: () => {}, getAxiosErrorMessage: err => err.message,
      };
      vm.runInNewContext(`${code.slice(start, end)};globalThis.generate = ${name};`, ctx);
      const result = await ctx.generate(1, '2026-10-28', '2026-10-28', {}, 'config', 'UTC', false, '2026-10-28T12:00:00Z');
      assert.equal(result, status);
      assert.equal(drained, entity);
      assert.equal(filter.$or[0].createdAt.$gte.toISOString(), '2026-10-28T12:00:00.000Z');
      assert.ok(filter.$or.some(branch => branch.status?.$in.includes('PENDING')), 'reuse active requests from previous queue occurrences');
    });
  }
}

for (const name of ['spGenerateReport', 'sbGenerateReport', 'sdGenerateReport']) {
  test(`${name} polls a pending report created before the current queue occurrence`, async () => {
    const start = code.indexOf(`async function ${name}(`);
    const end = code.indexOf('\n};', start) + 3;
    const requestedAfter = new Date().toISOString();
    const createdAt = new Date(Date.now() - 90 * 60000);
    let polled = false;
    const matches = (filter, row) => Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return value.some(branch => matches(branch, row));
      if (value && typeof value === 'object' && '$gte' in value) return row[key] >= value.$gte;
      if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(row[key]);
      return row[key] === value;
    });
    const row = { profileId: 1, configId: 'config', reportTypeId: name.slice(0, 2) + 'Targeting', reportName: 'Targeting Report', startDate: '2026-10-28', endDate: '2026-10-28', reportId: 'already-pending', status: 'PENDING', createdAt };
    const ctx = {
      getProfile: async () => ({ amazonUrl: 'https://example.invalid' }),
      reportsSchema: { findOne(filter) { return { sort() { return this; }, lean: async () => matches(filter, row) ? row : null }; }, create() { throw new Error('must not create a second pending request'); } },
      retryWithBackoff: async fn => fn(),
      amazonAxios: async request => { assert.equal(request.method, 'GET', 'must poll existing report instead of POSTing another'); assert.ok(request.url.endsWith('/already-pending')); polled = true; return { data: { status: 'IN_PROGRESS' } }; },
      cron_logs: () => {}, getAxiosErrorMessage: err => err.message,
    };
    vm.runInNewContext(`${code.slice(start, end)};globalThis.generate = ${name};`, ctx);
    assert.equal(await ctx.generate(1, '2026-10-28', '2026-10-28', {}, 'config', 'UTC', false, requestedAfter), 'IN_PROGRESS');
    assert.equal(polled, true);
  });
}

test('pending targeting import delays BullMQ job with its lock token', async () => {
  const errors = require('../queue-service/contracts/errors');
  const { DelayedError } = require('bullmq');
  const { SYNC_TASKS } = require('../queue-service/queues/queueNames');
  let delayed;
  const ctx = { module: { exports: {} }, process: { env: {} }, require(name) {
    if (name === 'bullmq') return { DelayedError };
    if (name === 'moment-timezone') return require('moment-timezone');
    if (name.includes('jobPayload')) return { validateJobPayload: data => data };
    if (name.includes('queueNames')) return { SYNC_TASKS };
    if (name.includes('contracts/errors')) return errors;
    if (name.includes('hourlySync.service')) return { runHourlySyncForProfile: async () => { throw new errors.ReportImportPendingError('awaiting import'); } };
    if (name.includes('logger')) return { cron_logs: () => {} };
    throw new Error(`Unexpected require ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../queue-service/processors/hourlySync.processor.js'), 'utf8'), ctx);
  const job = { id: 'job', data: { task: SYNC_TASKS.TARGETING_REPORT, scheduledFor: new Date().toISOString(), profileId: 1 }, moveToDelayed: async (until, token) => { delayed = { until, token }; } };
  const now = Date.now();
  await assert.rejects(ctx.module.exports.createHourlySyncProcessor()(job, 'lock-token'), err => err instanceof DelayedError);
  assert.equal(delayed.token, 'lock-token');
  assert.ok(delayed.until >= now + 60000);
  assert.equal(job.data._prereqRetries, undefined);
});

test('report schema retains failure diagnostics without a connection', () => {
  const Report = require('../api-server/models/report.model');
  const report = new Report({ status: 'FAILED', errorMessage: 'write failed', failedAt: new Date('2026-10-28T12:00:00Z') });
  assert.equal(report.toObject().errorMessage, 'write failed');
  assert.equal(report.toObject().failedAt.toISOString(), '2026-10-28T12:00:00.000Z');
});

for (const taskName of ['PRODUCT_ADS_REPORT', 'PLACEMENT_REPORT', 'SEARCH_TERM_REPORT']) {
  test(`${taskName} continues waiting beyond ten polls for targeting import`, async () => {
    const errors = require('../queue-service/contracts/errors');
    const { DelayedError } = require('bullmq');
    const { SYNC_TASKS } = require('../queue-service/queues/queueNames');
    let delayed = false;
    const ctx = { module: { exports: {} }, process: { env: {} }, require(name) {
      if (name === 'bullmq') return { DelayedError };
      if (name === 'moment-timezone') return require('moment-timezone');
      if (name.includes('jobPayload')) return { validateJobPayload: data => data };
      if (name.includes('queueNames')) return { SYNC_TASKS };
      if (name.includes('contracts/errors')) return errors;
      if (name.includes('hourlySync.service')) return { runHourlySyncForProfile: async () => { throw new errors.DependencyNotReadyError('targeting import pending', { prereqCheck: { prerequisiteState: 'WAITING' } }); } };
      if (name.includes('logger')) return { cron_logs: () => {} };
      throw new Error(`Unexpected require ${name}`);
    } };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../queue-service/processors/hourlySync.processor.js'), 'utf8'), ctx);
    const job = { id: 'job', data: { task: SYNC_TASKS[taskName], scheduledFor: new Date().toISOString(), profileId: 1, _prereqRetries: 12 }, updateData: async () => {}, moveToDelayed: async () => { delayed = true; } };
    await assert.rejects(ctx.module.exports.createHourlySyncProcessor()(job, 'lock-token'), err => err instanceof DelayedError);
    assert.equal(delayed, true);
  });
}
