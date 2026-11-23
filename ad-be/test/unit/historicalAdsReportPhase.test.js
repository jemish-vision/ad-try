const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const moment = require('moment-timezone');
const controllerNames = ['campaign', 'adGroups', 'targeting', 'searchTerm', 'placement', 'keyword', 'productAds'];
const profileId = 7, configId = '111111111111111111111111', startDate = '2026-11-01', endDate = '2026-11-07';
for (const controller of controllerNames) {
  const source = fs.readFileSync(require.resolve(`../../api-server/controllers/${controller}.controller`), 'utf8');
  for (const match of source.matchAll(/^async function ((?:sp|sb|sd)GenerateReport)\(/gm)) {
    const name = match[1], start = match.index;
    const next = [...source.slice(start + match[0].length).matchAll(/\n(?:async function |exports\.)/g)][0];
    const end = next ? start + match[0].length + next.index : source.length;
    const code = source.slice(start, end);
    const signature = code.slice(code.indexOf('(') + 1, code.indexOf(')'));
    const names = signature.split(',').map(value => value.trim().split(/\s*=/)[0]).filter(Boolean);
    test(`${controller}/${name}: submit never polls; poll never submits or retries`, async () => {
      const calls = [], saved = [];
      function Report(data) { Object.assign(this, data); this.save = async () => saved.push(data); }
      Report.create = async data => { saved.push(data); return data; };
      Report.findOne = () => { throw new Error('Historical adapter unexpectedly used legacy lookup'); };
      const context = {
        getProfile: async () => ({ amazonUrl: 'https://ads.test', type: 'seller' }),
        reportsSchema: Report, moment, cron_logs() {}, getAxiosErrorMessage: error => error.message,
        retryWithBackoff() { throw new Error('Historical phase must not use retry delays'); },
        setTimeout() { throw new Error('Unexpected report wait'); },
        amazonAxios: async options => {
          calls.push(options.method.toUpperCase());
          return { status: 200, data: options.method.toUpperCase() === 'POST' ? {
            reportId: 'amazon-report', status: 'PENDING', startDate, endDate,
            configuration: options.data.configuration,
          } : { status: 'PENDING' } };
        }
      };
      const fn = vm.runInNewContext(code + `\n${name}`, context);
      const args = phase => names.map(key => ({ profileId, configId, startDate, endDate,
        timezone: 'UTC', currencyCode: 'USD', recurring: false, forceRefresh: false, requestedAfter: null,
        checkConfigAds: { adsAccessToken: 'test-access', adsClientId: 'test-client' }, historicalPhase: phase })[key]);
      assert.equal(await fn(...args({ phase: 'submit', creationLocked: true })), 'PENDING');
      assert.deepEqual(calls, ['POST']); assert.equal(saved.length, 1);
      assert.equal(saved[0].configId, configId); assert.equal(saved[0].profileId, profileId);
      assert.equal(saved[0].startDate, startDate); assert.equal(saved[0].endDate, endDate);
      calls.length = 0;
      assert.equal(await fn(...args({ phase: 'poll', report: { ...saved[0], _id: 'row' } })), 'PENDING');
      assert.deepEqual(calls, ['GET']); assert.equal(saved.length, 1);
      calls.length = 0;
      assert.equal(await fn(...args({ phase: 'poll' })), 'ERROR'); assert.deepEqual(calls, []);
      assert.equal(await fn(...args({ phase: 'poll', report: { ...saved[0], status: 'COMPLETED' } })), 'COMPLETED');
      assert.deepEqual(calls, []);
    });
  }
}
function phaseFixture({ failures = new Set(), busyPoll = false } = {}) {
  const rows = [], history = [], calls = [], staged = [], locks = new Map(); let id = 0, pollAcquired;
  const query = filter => ({ sort() { return this; }, async lean() {
    return [...rows].reverse().find(row => Object.entries(filter).every(([key, value]) =>
      value && typeof value === 'object' && value.$in ? value.$in.includes(row[key]) : String(row[key]) === String(value))) || null;
  } });
  const reports = { findOne: query, updateOne: async (filter, update) => { Object.assign(rows.find(row => row._id === filter._id), update.$set); } };
  const leases = {
    acquireImportLock: async key => { if (locks.has(key) || busyPoll && key.startsWith('historical_report_poll:')) return null; const token = 'lease'; locks.set(key, token); if (key.startsWith('historical_report_poll:') && pollAcquired) await pollAcquired(key); return token; },
    renewImportLock: async () => true, checkImportLock: async () => true,
    releaseImportLock: async key => { locks.delete(key); }
  };
  const requestContext = { module: { exports: {} }, setInterval, clearInterval, require(name) {
    if (name.includes('report.model')) return reports;
    if (name.includes('reportStaging')) return leases;
    if (name.includes('logger')) return { cron_logs() {} };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../api-server/services/reportRequest.service'), 'utf8'), requestContext);
  const context = { module: { exports: {} }, setInterval, clearInterval, require(name) {
    if (name.includes('report.model')) return reports;
    if (name.includes('profiles.model')) return { findOne: filter => ({ lean: async () => filter.configId === configId && filter.profileId === profileId ? { configId, profileId, isActive: true } : null }) };
    if (name.includes('cronJobHistory.model')) return { findByIdAndUpdate: async (_, update) => history.push(update.$set) };
    if (name.includes('reportRequest.service')) return requestContext.module.exports;
    if (name.includes('reportStaging.service')) return leases;
    if (name.includes('reportBatchWriter')) return { processStagedReportBatches: async entities => { staged.push(entities); } };
    if (name.includes('reportHistoryCompletion')) return { linkReportHistory: async () => {} };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../api-server/services/historicalAdsReportPhase.service'), 'utf8'), context);
  const identity = type => ({ configId, profileId, startDate, endDate, reportName: 'CAMPAIGNS', reportTypeId: type });
  let onPoll = async row => row.status;
  const options = { group: 'CAMPAIGNS', reportName: 'CAMPAIGNS', getAllowedSyncProfiles: async () => [{ configId, profileId }], getAccessToken: async () => ({ adsAccessToken: 'test' }),
    types: ['SP', 'SB', 'SD'].map(type => ({ reportTypeId: type, entity: 'campaign', run: async (_profile, _credentials, phase) => {
      calls.push([phase.phase, type]);
      if (phase.phase === 'submit') {
        if (failures.has(type)) return 'ERROR';
        rows.push({ ...identity(type), _id: String(++id), reportId: 'amazon-' + id, status: 'PENDING' });
        return 'PENDING';
      }
      return onPoll(phase.report, phase, type);
    } })) };
  return { rows, calls, history, staged, options, identity, onPollLease(fn) { pollAcquired = fn; }, setPoll(fn) { onPoll = fn; },
    run: (reportPhase, extra = {}) => context.module.exports.runHistoricalAdsReportPhase({ configId, profileId, startDate, endDate, cronjobid: 'history', reportPhase, ...extra }, options) };
}
test('historical phase submits independent types, deduplicates accepted rows, and retries only missing failures', async () => {
  const failures = new Set(['SB']); const f = phaseFixture({ failures });
  assert.equal(await f.run('submit'), 'PENDING'); assert.equal(f.rows.length, 2); assert.equal(f.calls.length, 3);
  failures.clear(); assert.equal(await f.run('submit'), 'PENDING'); assert.equal(f.rows.length, 3);
  assert.deepEqual(f.calls, [['submit','SP'],['submit','SB'],['submit','SD'],['submit','SB']]);
  assert.equal(f.history.at(-1).status, 'PENDING');
});
test('concurrent submissions share existing creation leases and never double POST', async () => {
  const f = phaseFixture(); await Promise.all([f.run('submit'), f.run('submit')]);
  assert.equal(f.rows.length, 3); assert.equal(f.calls.filter(row => row[0] === 'submit').length, 3);
});
test('poll missing or failed siblings never blocks accepted sibling work or creates a report', async () => {
  const f = phaseFixture(); f.rows.push({ ...f.identity('SP'), _id: 'row', reportId: 'accepted', status: 'PENDING' });
  f.rows.push({ ...f.identity('SD'), _id: 'failed', reportId: 'terminal', status: 'FAILED' });
  assert.equal(await f.run('poll'), 'PENDING'); assert.deepEqual(f.calls, [['poll','SP']]);
  assert.equal(f.history.at(-1)['details.reportTypeStatuses'].SB, 'ERROR');
});
test('poll completion requires every expected type to finish persistence', async () => {
  const f = phaseFixture(); await f.run('submit'); f.calls.length = 0;
  f.setPoll(async row => { row.status = 'COMPLETED'; return 'COMPLETED'; });
  assert.equal(await f.run('poll'), 'COMPLETED'); assert.equal(f.history.at(-1).status, 'COMPLETED');
  assert.equal(f.calls.filter(row => row[0] === 'submit').length, 0);
});
test('transient poll failure preserves accepted report IDs and later submission reuses them', async () => {
  const f = phaseFixture(); await f.run('submit'); const ids = f.rows.map(row => row.reportId);
  f.setPoll(async () => 'ERROR'); assert.equal(await f.run('poll'), 'PENDING');
  assert.deepEqual(f.rows.map(row => row.status), ['PENDING','PENDING','PENDING']);
  await f.run('submit'); assert.deepEqual(f.rows.map(row => row.reportId), ids);
  assert.equal(f.calls.filter(row => row[0] === 'submit').length, 3);
  f.setPoll(async row => { row.status = 'COMPLETED'; return 'COMPLETED'; });
  assert.equal(await f.run('poll'), 'COMPLETED');
});
test('only verified terminal Amazon statuses invalidate accepted requests', async () => {
  const f = phaseFixture(); await f.run('submit');
  f.setPoll(async (_row, phase) => { phase.onProviderStatus('FAILED'); return 'FAILED'; });
  assert.equal(await f.run('poll'), 'FAILED'); assert.ok(f.rows.every(row => row.status === 'FAILED'));
  await f.run('submit'); assert.equal(f.rows.length, 6);
});
test('historical phases reject oversized and invalid ranges without requests', async () => {
  for (const end of ['2026-12-01', '2026-11-99']) {
    const f = phaseFixture(); assert.equal(await f.run('submit', { endDate: end }), 'FAILED'); assert.deepEqual(f.calls, []);
  }
});
test('poll import lease prevents simultaneous work on an accepted report', async () => {
  const f = phaseFixture({ busyPoll: true }); await f.run('submit'); f.calls.length = 0;
  assert.equal(await f.run('poll'), 'PENDING'); assert.deepEqual(f.calls, []);
});
test('poll rereads after lease acquisition and skips a report completed by a racing caller', async () => {
  const f = phaseFixture(); await f.run('submit'); f.calls.length = 0;
  f.onPollLease(key => { f.rows.find(row => key.endsWith(row.reportId)).status = 'COMPLETED'; });
  assert.equal(await f.run('poll'), 'COMPLETED'); assert.deepEqual(f.calls, []);
});
test('poll rereads staged state after lease acquisition without a duplicate download', async () => {
  const f = phaseFixture(); await f.run('submit'); f.calls.length = 0;
  f.onPollLease(key => { f.rows.find(row => key.endsWith(row.reportId)).status = 'STAGED'; });
  assert.equal(await f.run('poll'), 'PENDING'); assert.deepEqual(f.calls, []); assert.equal(f.staged.length, 3);
});
test('poll never imports an old snapshot after the accepted report ID changes during lease acquisition', async () => {
  const f = phaseFixture(); await f.run('submit'); f.calls.length = 0;
  f.onPollLease(key => { f.rows.find(row => key.endsWith(row.reportId)).reportId += '-replacement'; });
  assert.equal(await f.run('poll'), 'PENDING'); assert.deepEqual(f.calls, []);
});
