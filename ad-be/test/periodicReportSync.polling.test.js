const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const moment = require('moment-timezone');
const errors = require('../queue-service/contracts/errors');
const { SYNC_TASKS } = require('../queue-service/queues/queueNames');

const categories = [
  ['CAMPAIGNS', ['spCampaigns', 'sbCampaigns', 'sdCampaigns']],
  ['AD_GROUPS', ['spCampaigns', 'sbAdGroup', 'sdAdGroup']],
  ['Targeting Report', ['spTargeting', 'sbTargeting', 'sdTargeting']],
  ['PRODUCT_ADS', ['spAdvertisedProduct', 'sdAdvertisedProduct']],
  ['PLACEMENTS', ['spCampaigns', 'sbCampaignPlacement']],
  ['SEARCHTERM', ['spSearchTerm', 'sbSearchTerm']],
];
const completeReports = () => categories.flatMap(([reportName, types]) => types.map(reportTypeId => ({
  reportName, reportTypeId, status: 'COMPLETED', createdAt: new Date('2026-11-03T01:00:00Z'),
})));
function fixture({ weekly = true, reports = completeReports(), backlog = [], oldReports = completeReports() } = {}) {
  const calls = [], queries = [], historyUpdates = [], historyQueries = [];
  const state = { reports, oldReports, backlog };
  const chain = value => ({ sort() { return this; }, select() { return this; }, limit() { return this; }, lean: async () => value });
  const history = {
    findOneAndUpdate(query) { historyQueries.push(query); return chain({ _id: 'history' }); },
    updateOne: async (_query, update) => historyUpdates.push(update.$set.status),
  };
  const model = { find(query) {
    queries.push(query);
    if (query.status === 'PENDING') return chain(state.backlog.slice(0, 1));
    return chain(query.startDate === '2026-10-19' ? state.oldReports : state.reports);
  } };
  const context = { module: { exports: {} }, Date, require(name) {
    if (name === 'moment-timezone') return moment;
    if (name.includes('cronJobHistory.model')) return history;
    if (name.includes('report.model')) return model;
    if (name.includes('contracts/errors')) return errors;
    throw new Error(`Unexpected require ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/services/automation/periodicReportSync.service.js'), 'utf8'), context);
  const options = {
    task: weekly ? SYNC_TASKS.WEEKLY_REPORT : SYNC_TASKS.BIWEEKLY_REPORT,
    configId: 'config', profileId: 123, syncDate: '2026-11-03', weekly,
    pastSyncObj: { configId: 'config', profileId: 123, timeBlock: '20261103T23Z' },
    delegates: Object.fromEntries(['campaign', 'adGroup', 'targeting', 'productAds', 'placement', 'searchTerm'].map(name => [name, async (w, b, scope) => { calls.push({ name, w, b, scope }); }])),
  };
  return { run: () => context.module.exports.runPeriodicReportSync(options), invoke: context.module.exports.runPeriodicReportSync, options, calls, queries, historyUpdates, historyQueries, state };
}

for (const weekly of [true, false]) {
  test(`${weekly ? 'weekly' : 'biweekly'} PENDING report keeps the job waiting`, async () => {
    const reports = completeReports();
    reports[0].status = 'PENDING';
    const f = fixture({ weekly, reports });
    await assert.rejects(f.run(), err => err instanceof errors.ReportImportPendingError);
    assert.equal(f.calls.length, 6);
    assert.equal(f.historyUpdates.length, 0);
    for (const call of f.calls) {
      assert.equal(call.w, weekly);
      assert.equal(call.b, !weekly);
      assert.equal(call.scope.recurring, false);
      assert.equal(call.scope.startDate, weekly ? '2026-10-25' : '2026-10-20');
      assert.equal(call.scope.endDate, '2026-11-02');
      assert.equal(call.scope.profileId, 123);
    }
    // Retry on a later wall-clock date still uses the job's original syncDate.
    f.state.reports = completeReports();
    await f.run();
    assert.equal(f.calls[6].scope.startDate, f.calls[0].scope.startDate);
    assert.equal(f.calls[6].scope.endDate, f.calls[0].scope.endDate);
    assert.deepEqual(f.historyUpdates, ['COMPLETED']);
    assert.equal(f.historyQueries[0].historyDate, '2026-11-03');
  });
}

for (const status of ['PENDING', 'IN_PROGRESS', 'STAGED', 'IMPORTING', 'VERIFYING', 'WRITE_FAILED']) {
  test(`${status} never completes the periodic job or its history`, async () => {
    const reports = completeReports();
    reports[0].status = status;
    const f = fixture({ reports });
    await assert.rejects(f.run(), err => err instanceof errors.ReportImportPendingError);
    assert.deepEqual(f.historyUpdates, []);
  });
}

test('missing category cannot be hidden by another category sharing spCampaigns', async () => {
  const f = fixture({ reports: completeReports().filter(r => r.reportName !== 'AD_GROUPS') });
  await assert.rejects(f.run(), /AD_GROUPS\/spCampaigns:NOT_FOUND/);
});

for (const status of ['FAILED', 'FATAL', 'EXPIRED']) {
  test(`${status} report fails explicitly instead of completing or waiting forever`, async () => {
    const reports = completeReports();
    reports[0].status = status;
    const f = fixture({ reports });
    await assert.rejects(f.run(), err => !(err instanceof errors.ReportImportPendingError) && err.message.includes(status));
    assert.deepEqual(f.historyUpdates, ['FAILED']);
  });
}

test('newer pending request takes precedence over an older completed record', async () => {
  const reports = completeReports();
  reports.unshift({ ...reports[0], status: 'PENDING', createdAt: new Date('2026-11-03T02:00:00Z') });
  await assert.rejects(fixture({ reports }).run(), errors.ReportImportPendingError);
});

test('all 15 completed report types complete the history', async () => {
  const f = fixture();
  const result = await f.run();
  assert.deepEqual(Object.keys(result), ['campaign', 'adGroup', 'targeting', 'productAds', 'placement', 'searchTerm']);
  assert.deepEqual(f.historyUpdates, ['COMPLETED']);
  const query = f.queries.find(q => q.startDate);
  assert.equal(query.configId, 'config');
  assert.equal(query.profileId, 123);
  assert.equal(query.$or.length, 6);
});

test('delegate request failure is recorded as failure', async () => {
  const f = fixture();
  f.options.delegates.campaign = async () => 'ERROR';
  await assert.rejects(f.run(), /campaign report request failed/);
  assert.deepEqual(f.historyUpdates, ['FAILED']);
});

test('resumes one orphaned recent range alongside current range without legacy recurring loops', async () => {
  const oldReports = completeReports();
  oldReports[0].status = 'PENDING';
  const f = fixture({ oldReports, backlog: [{ startDate: '2026-10-19', endDate: '2026-11-01' }, { startDate: '2026-10-18', endDate: '2026-10-31' }] });
  await assert.rejects(f.run(), errors.ReportImportPendingError);
  assert.equal(f.calls.length, 8);
  assert.equal(f.calls[6].scope.startDate, '2026-10-19');
  assert.equal(f.calls[6].scope.endDate, '2026-11-01');
  assert.deepEqual(f.calls.slice(6).map(call => call.name), ['campaign', 'adGroup']);
  assert.ok(f.calls.every(c => c.scope.recurring === false));
  assert.deepEqual(f.historyUpdates, []);
  const query = f.queries[0];
  assert.equal(query.profileId, 123);
  assert.equal(query.configId, 'config');
  assert.equal(query.createdAt.$lte - query.createdAt.$gte, 42 * 3600000);
  f.state.oldReports = completeReports();
  await f.run();
  assert.deepEqual(f.historyUpdates, ['COMPLETED']);
});

test('current range also in backlog is polled once', async () => {
  const f = fixture({ backlog: [{ startDate: '2026-10-25', endDate: '2026-11-02' }] });
  await f.run();
  assert.equal(f.calls.length, 6);
});

for (const [file, name, campaign] of [
  ['campaign', 'spGenerateReport', true],
  ['adGroups', 'spGenerateReport', false],
  ['adGroups', 'sbGenerateReport', false],
]) {
  for (const status of ['PENDING', 'FAILED', 'FATAL', 'EXPIRED', 'CANCELLED', 'CANCELED']) {
    test(`${file}/${name} reuses original Amazon report ID and handles ${status}`, async () => {
      const source = fs.readFileSync(path.join(__dirname, `../api-server/controllers/${file}.controller.js`), 'utf8').replace(/\r\n/g, '\n');
      const start = source.indexOf(`async function ${name}(`);
      const next = source.indexOf('\nasync function ', start + 1);
      const body = source.slice(start, next);
      const updates = [];
      let sorted = false, getCalled = false;
      const ctx = { require, getProfile: async () => ({ amazonUrl: 'https://amazon.invalid' }),
        retryWithBackoff: async fn => fn(),
        amazonAxios: async request => {
          assert.equal(request.method, 'GET');
          assert.ok(request.url.endsWith('/original-report-id'));
          getCalled = true;
          return { data: { status } };
        },
        reportsSchema: {
          findOne(query) {
            assert.equal(query.startDate, '2026-10-19');
            assert.equal(query.endDate, '2026-11-01');
            return {
              sort(order) { assert.equal(order.createdAt, -1); sorted = true; return this; },
              lean: async () => ({ _id: 'report', reportId: 'original-report-id', status: 'PENDING' }),
            };
          },
          create() { throw new Error('must reuse original request'); },
          updateOne: async (_query, update) => updates.push(update.$set.status),
        },
        cron_logs: () => {}, getAxiosErrorMessage: err => err.message,
      };
      vm.runInNewContext(`${body};globalThis.generate = ${name};`, ctx);
      const args = campaign
        ? [123, '2026-10-19', '2026-11-01', {}, 'config', 'UTC', false]
        : [123, 'config', '2026-10-19', '2026-11-01', {}, 'UTC', false];
      assert.equal(await ctx.generate(...args), status);
      assert.equal(sorted, true);
      assert.equal(getCalled, true);
      assert.deepEqual(updates, status === 'PENDING' ? [] : [status]);
    });
  }
}

for (const task of [SYNC_TASKS.WEEKLY_REPORT, SYNC_TASKS.BIWEEKLY_REPORT]) {
  test(`${task} moves sync run to WAITING until all imports complete`, async () => {
    const reports = completeReports();
    reports[0].status = 'PENDING';
    const f = fixture({ reports });
    const states = [];
    const ctx = { module: { exports: {} }, require(name) {
      if (name === 'moment-timezone') return moment;
      if (name.includes('profileEligibility')) return { getEligibleProfile: async () => ({ timezone: 'UTC' }) };
      if (name.includes('automationMode')) return { isShadowModeEnabled: () => false };
      if (name === './syncRun.service') return {
        checkPrerequisiteStatus: async () => ({ ready: true }),
        claimSyncRun: async () => ({ shouldExecute: true, record: { _id: 'run' } }),
        markSyncRunWaiting: async () => states.push('WAITING'),
        markSyncRunCompleted: async () => states.push('COMPLETED'),
        markSyncRunFailed: async () => states.push('FAILED'),
      };
      if (name.includes('queueNames')) return { SYNC_TASKS };
      if (name.includes('contracts/errors')) return errors;
      if (name === './periodicReportSync.service') return { runPeriodicReportSync: f.invoke };
      // Profile has completed initial sync, so periodic reports are allowed to run.
      if (name === '../../models/synchronizeDetails.model') return { findOne: () => ({ select() { return this; }, lean: async () => ({ groupId: 'CAMPAIGNS' }) }) };
      if (name.includes('cronAutomation/logger')) return { cron_logs: () => {} };
      const mapping = {
        campaign: 'cronGenerateCampaignReport', adGroups: 'cronGenerateAdGroupReport',
        targeting: 'cronGenerateTargetingReport', productAds: 'cronGenerateAdProductReport',
        placement: 'cronGeneratePlacementReport', searchTerm: 'cronGenerateSearchTermReport',
      };
      for (const [file, exported] of Object.entries(mapping)) {
        if (name.endsWith(`/${file}.controller`)) return { [exported]: async () => {} };
      }
      throw new Error(`Unexpected require ${name}`);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/services/automation/hourlySync.service.js'), 'utf8'), ctx);
    const options = { task, configId: 'config', profileId: 123, scheduledFor: '2026-11-03T23:00:00Z', timeBlock: '20261103T23Z', jobId: 'job' };
    await assert.rejects(ctx.module.exports.runHourlySyncForProfile(options), errors.ReportImportPendingError);
    assert.deepEqual(states, ['WAITING']);
    f.state.reports = completeReports();
    await ctx.module.exports.runHourlySyncForProfile(options);
    assert.deepEqual(states, ['WAITING', 'COMPLETED']);
  });

  test(`${task} delays BullMQ job using its lock token without consuming failure retries`, async () => {
    const { DelayedError } = require('bullmq');
    let delayed;
    const ctx = { module: { exports: {} }, process: { env: {} }, require(name) {
      if (name === 'bullmq') return { DelayedError };
      if (name === 'moment-timezone') return moment;
      if (name.includes('jobPayload')) return { validateJobPayload: data => data };
      if (name.includes('queueNames')) return { SYNC_TASKS };
      if (name.includes('contracts/errors')) return errors;
      if (name.includes('hourlySync.service')) return { runHourlySyncForProfile: async () => { throw new errors.ReportImportPendingError('pending'); } };
      if (name.includes('logger')) return { cron_logs: () => {} };
      throw new Error(`Unexpected require ${name}`);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../queue-service/processors/hourlySync.processor.js'), 'utf8'), ctx);
    const job = { id: 'job', data: { task, profileId: 123, scheduledFor: new Date().toISOString() }, moveToDelayed: async (until, token) => { delayed = { until, token }; } };
    const now = Date.now();
    await assert.rejects(ctx.module.exports.createHourlySyncProcessor()(job, 'lock'), DelayedError);
    assert.equal(delayed.token, 'lock');
    assert.ok(delayed.until >= now + 60000);
    assert.equal(job.data._prereqRetries, undefined);
  });
}
