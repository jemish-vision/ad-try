const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const moment = require('moment-timezone');

const root = path.resolve(__dirname, '../..');
const profile = { configId: 'config-1', profileId: 123, marketplaceStringId: 'IN', timezone: 'Asia/Kolkata' };
const sync = { ...profile, startDate: '2026-10-01', endDate: '2026-10-30', recurring: false, cronjobid: 'history-1' };
function fixture(kind) {
  const rows = [], history = [], network = [], imports = [];
  let amazonStatus = 'IN_QUEUE', importFailure = false;
  const query = value => ({ sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const reports = {
    findOne(identity) { return query([...rows].reverse().find(row => Object.entries(identity).every(([key, value]) => value?.$in ? value.$in.includes(row[key]) : row[key] === value)) || null); },
    async create(row) { const created = { ...row, _id: `report-row-${rows.length + 1}` }; rows.push(created); return created; },
    async updateOne(filter, update) { const row = rows.find(row => Object.entries(filter).every(([key, value]) => row[key] === value)); if (row) Object.assign(row, update.$set); },
  };
  const locks = { acquireImportLock: async () => 'lease', renewImportLock: async () => true, releaseImportLock: async () => {} };
  const shared = { module: { exports: {} }, setInterval, clearInterval, require(name) {
    if (name === '../models/report.model') return reports;
    if (name === './reportStaging.service') return locks;
    if (name === './reportRequest.service') return { getOrCreateReportRequest: async (identity, create) => {
      const existing = await reports.findOne(identity).lean(); return { report: existing || await create() };
    } };
    throw new Error(`Unexpected shared dependency ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'api-server/services/historicalSellerReport.service.js'), 'utf8'), shared);
  const consume = async () => { imports.push('write'); if (importFailure) throw new Error('write failed'); };
  const context = { exports: {}, __dirname: path.join(root, 'api-server/controllers'), process: { env: { PROCESS_LIMIT: '1' } }, require(name) {
    if (name === 'moment' || name === 'moment-timezone') return moment;
    if (name === 'path') return path;
    if (name === 'fs') return { existsSync: () => true, unlinkSync() {} };
    if (name === 'p-limit') return { default: () => fn => fn() };
    if (name === '../services/historicalSellerReport.service') return shared.module.exports;
    if (name === '../helper/retryHelper') return { retryWithBackoff: fn => fn() };
    if (name === '../helper/reportFile.helper') return { withDownloadedReportFile: (_url, _download, read) => read('fixture-report') };
    if (name === '../models/report.model') return reports;
    if (name === '../models/marketPlaceConfig.model') return { findOne: () => query({ endPoint: 'https://amazon.invalid' }) };
    if (name === '../models/cronJobHistory.model') return { findByIdAndUpdate: async (id, update) => { history.push({ id, ...update }); } };
    if (name === '../helpers/cronHistoryError.helper') return { syncNotCompletedReason: () => 'not approved' };
    if (name === '../helper/common') return {
      getActivePlanProfiles: async () => [profile], getAllowedSyncProfiles: async () => [{ profileId: 123, configId: 'config-1' }],
      getSPAccessToken: async () => ({ spAccessToken: 'dummy' }), downloadFile: async () => {}, unzipReport: async () => {},
    };
    if (name === '../helper/amazonAxios') return async request => {
      network.push(request);
      if (request.method === 'POST') return { data: { reportId: 'amazon-1' } };
      if (request.url.includes('/documents/')) return { data: { url: 'https://download.invalid' } };
      return { data: { processingStatus: amazonStatus, reportDocumentId: 'document-1' } };
    };
    if (name.includes('logger')) return { cron_logs() {}, write_logs() {} };
    return {};
  } };
  if (kind === 'deals') context.processDealsReport = consume;
  else context.processCouponReportStream = consume;
  const source = fs.readFileSync(path.join(root, `api-server/controllers/${kind === 'deals' ? 'deals' : 'coupon'}.controller.js`), 'utf8');
  const stop = kind === 'deals' ? '\nconst processDealsReport =' : '\nconst processCouponReportStream =';
  assert.ok(source.includes(stop));
  vm.runInNewContext(source.slice(0, source.indexOf(stop)), context);
  return { rows, history, network, imports, setStatus: value => { amazonStatus = value; }, failImport: () => { importFailure = true; },
    run: phase => context.exports[kind === 'deals' ? 'cronSyncDealPerformance' : 'cronListCouponFromAmazon']({ ...sync, reportPhase: phase }) };
}

for (const kind of ['deals', 'coupon']) {
  test(`${kind}: submit creates one exact-range report without polling`, async () => {
    const f = fixture(kind);
    assert.equal(await f.run('submit'), 'PENDING');
    assert.equal(f.network.length, 1); assert.equal(f.network[0].method, 'POST');
    assert.equal(f.rows[0].startDate, sync.startDate); assert.equal(f.rows[0].endDate, sync.endDate);
    assert.equal(f.history.at(-1).status, 'PENDING');
    assert.equal(await f.run('submit'), 'PENDING'); assert.equal(f.network.length, 1);
  });
  test(`${kind}: poll with no exact report never creates or borrows another range`, async () => {
    const f = fixture(kind); f.rows.push({ ...sync, startDate: '2026-09-01', endDate: '2026-09-30', reportId: 'other-range', status: 'PENDING' });
    assert.equal(await f.run('poll'), 'ERROR'); assert.equal(f.network.length, 0);
  });
  test(`${kind}: pending poll is a single GET with pending history`, async () => {
    const f = fixture(kind); await f.run('submit'); f.network.length = 0;
    assert.equal(await f.run('poll'), 'PENDING'); assert.equal(f.network.length, 1); assert.equal(f.network[0].method, 'GET');
    assert.equal(f.history.at(-1).status, 'PENDING');
  });
  test(`${kind}: fatal report fails historical run without a replacement POST`, async () => {
    const f = fixture(kind); await f.run('submit'); f.network.length = 0; f.setStatus('FATAL');
    assert.equal(await f.run('poll'), 'ERROR'); assert.equal(f.history.at(-1).status, 'FAILED');
    assert.equal(f.network.filter(request => request.method === 'POST').length, 0);
  });
  test(`${kind}: DONE imports before completing and replay does not import twice`, async () => {
    const f = fixture(kind); await f.run('submit'); f.setStatus('DONE');
    assert.equal(await f.run('poll'), 'COMPLETED'); assert.equal(f.imports.length, 1); assert.equal(f.rows[0].status, 'COMPLETED');
    assert.equal(f.history.at(-1).status, 'COMPLETED');
    assert.equal(await f.run('poll'), 'COMPLETED'); assert.equal(f.imports.length, 1);
  });
  test(`${kind}: importer failure never marks historical run complete`, async () => {
    const f = fixture(kind); await f.run('submit'); f.setStatus('DONE'); f.failImport();
    assert.equal(await f.run('poll'), 'ERROR'); assert.equal(f.history.at(-1).status, 'FAILED'); assert.notEqual(f.rows[0].status, 'COMPLETED');
  });
  test(`${kind}: cancelled empty report settles without importing`, async () => {
    const f = fixture(kind); await f.run('submit'); f.setStatus('CANCELLED');
    assert.equal(await f.run('poll'), 'COMPLETED'); assert.equal(f.rows[0].status, 'CANCELLED'); assert.equal(f.imports.length, 0);
    assert.equal(f.history.at(-1).status, 'COMPLETED');
  });
  test(`${kind}: callers without explicit phase retain the existing single-pass behavior`, async () => {
    const f = fixture(kind);
    assert.equal(await f.run(undefined), undefined);
    assert.equal(f.network.length, 1); assert.equal(f.network[0].method, 'POST');
    assert.equal(f.history.length, 0); assert.equal(f.rows[0].status, 'PENDING');
  });
}
