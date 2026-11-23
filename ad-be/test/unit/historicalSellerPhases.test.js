'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const moment = require('moment-timezone');
const root = path.resolve(__dirname, '../..');
const profile = { configId: 'config-1', profileId: 123, marketplaceStringId: 'IN', timezone: 'Asia/Kolkata' };
const dates = ['2026-10-01', '2026-10-30'];
const slices = {
  order: ['order', 'const generateSPReport =', 'exports.cronGenerateRefundReport', 'generateSPReport'],
  mfn: ['order', 'async function generateReturnsSPReport', 'const processReturnsReportStream', 'generateReturnsSPReport'],
  fba: ['order', 'async function generateFBAReturnsSPReport', 'const processFBAReturnsReportStream', 'generateFBAReturnsSPReport'],
  sales: ['inventory', 'async function generateSalesReportForDate', 'const processDailyOrderSalesStream', 'generateSalesReportForDate'],
  reimbursement: ['reconciliationReimbursement', 'async function generateReimbursementSPReport', 'const processReimbursementReportStream', 'generateReimbursementSPReport'],
  brand: ['brandAnalytics', 'exports.storeMonthlyBrandAnalysisData =', 'exports.getBrandAnalyticsFilters', 'exports.storeMonthlyBrandAnalysisData'],
};
const slice = (file, start, end) => {
  const source = fs.readFileSync(path.join(root, `api-server/controllers/${file}.controller.js`), 'utf8');
  const from = source.indexOf(start); const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `${file}: ${start}...${end}`);
  return source.slice(from, to);
};

function fixture(kind) {
  const rows = [], network = [], imports = [], history = [], waits = [], leases = new Set();
  let amazonStatus = 'IN_QUEUE', importFailure = false, postFailure = false, documentFailure = false;
  const query = value => ({ sort() { return this; }, select() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const matches = (row, identity) => Object.entries(identity).every(([key, value]) => value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key]) : row[key] === value);
  const reports = {
    findOne(identity) { return query([...rows].reverse().find(row => matches(row, identity)) || null); },
    async create(row) { const created = { ...row, _id: `row-${rows.length + 1}` }; rows.push(created); return created; },
    async updateOne(filter, update) { const row = rows.find(row => matches(row, filter)); if (row) Object.assign(row, update.$set || update); },
    async findByIdAndUpdate(filter, update) { return this.updateOne(typeof filter === 'object' ? filter : { _id: filter }, update); },
  };
  const locks = {
    acquireImportLock: async scope => { if (leases.has(scope)) return null; leases.add(scope); return `lease-${scope}`; },
    checkImportLock: async () => true, renewImportLock: async () => true,
    releaseImportLock: async scope => { leases.delete(scope); },
  };
  function service(file, requireFn) {
    const context = { module: { exports: {} }, require: requireFn, setInterval, clearInterval };
    vm.runInNewContext(fs.readFileSync(path.join(root, `api-server/services/${file}`), 'utf8'), context);
    return context.module.exports;
  }
  const requestService = service('reportRequest.service.js', name => {
    if (name === '../models/report.model') return reports;
    if (name === './reportStaging.service') return locks;
    if (name.includes('logger')) return { cron_logs() {} };
    throw new Error(name);
  });
  const shared = service('historicalSellerReport.service.js', name => {
    if (name === '../models/report.model') return reports;
    if (name === './reportStaging.service') return locks;
    if (name === './reportRequest.service') return requestService;
    throw new Error(name);
  });
  const consume = async () => { imports.push('write'); if (importFailure) throw new Error('fixture importer failed'); };
  const statusHelper = require('../../api-server/helpers/spReportStatus.helper');
  const context = {
    ...shared, ...statusHelper, exports: {}, global: {}, moment, path, Buffer, crypto: require('node:crypto'), __dirname: path.join(root, 'api-server/controllers'), process: { env: { BATCH: '10' } },
    reportsSchema: reports, getProfile: async () => profile,
    marketPlaceConfigSchema: { findOne: () => query({ endPoint: 'https://amazon.invalid', marketPlaceId: 'IN' }) },
    retryWithBackoff: task => task(),
    amazonAxios: async request => {
      network.push(request);
      if (request.method === 'POST') { if (postFailure) throw new Error('fixture POST failed'); return { status: 202, data: { reportId: `amazon-${rows.length + 1}` } }; }
      if (request.url.includes('/documents/')) { if (documentFailure) throw new Error('fixture document failure'); return { status: 200, data: { url: 'https://download.invalid' } }; }
      return { status: 200, data: { processingStatus: amazonStatus, reportDocumentId: 'document-1' } };
    },
    downloadFile: async () => {}, unzipReport: async () => {}, convertXMLToJSON: async () => {},
    downloadReport: async () => { await consume(); return []; },
    validateReportFile: () => ({ isValid: true }),
    processReturnsReportStream: consume, processFBAReturnsReportStream: consume, processReimbursementReportStream: consume,
    processDailyOrderSalesStream: consume, processReportFileStream: async () => {},
    returnSchema: {}, reimbursementSchema: {}, businessProductSalesSchema: {},
    brandAnalyticsSchema: { bulkWrite: consume },
    fs: { existsSync: () => true, mkdirSync() {}, statSync: () => ({ size: 100 }), openSync: () => 1,
      readSync: (_fd, buffer) => buffer.write('return-date\torder-id\n2026-10-01\tfixture-order'), closeSync() {},
      readFileSync: () => JSON.stringify({ dataByAsin: [{ asin: 'B0FIXTURE', startDate: '2026-10-04', endDate: '2026-10-10' }] }), unlinkSync() {} },
    safeJsonParse: JSON.parse, write_logs() {}, cron_logs() {}, console: { log() {}, error() {} },
    wait: async ms => { waits.push(ms); throw new Error('Report phase must not wait'); },
    cronJobHistorySchema: { findByIdAndUpdate: async (id, update) => history.push({ id, ...(update.$set || update) }) },
    limit: task => task(),
    getActivePlanProfiles: async () => [profile], getAllowedSyncProfiles: async () => [{ configId: profile.configId, profileId: profile.profileId }],
    getSPAccessToken: async () => ({ spAccessToken: 'dummy' }),
    getDatesBetween: (start, end) => { const dates = []; for (let day = moment(start); day.isSameOrBefore(end); day.add(1, 'day')) dates.push(day.format('YYYY-MM-DD')); return dates; },
  };
  const [file, start, end, name] = slices[kind];
  vm.createContext(context); vm.runInContext(`${slice(file, start, end)}\nexports.run = ${name};`, context);
  const run = phase => {
    if (kind === 'order') return context.exports.run(profile.configId, profile.profileId, ...dates, { spAccessToken: 'dummy' }, false, 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', phase);
    if (kind === 'sales') return context.exports.run(profile, dates[0], { spAccessToken: 'dummy' }, false, phase);
    if (kind === 'brand') return context.exports.run({ profile, checkSPConfig: { spAccessToken: 'dummy' }, marketPlaceConfig: { endPoint: 'https://amazon.invalid' }, chunks: [['B0FIXTURE']], startDate: '2026-10-04', endDate: '2026-10-10', reportPhase: phase, reportPeriod: 'WEEK' });
    return context.exports.run(profile, ...dates, { spAccessToken: 'dummy' }, false, phase);
  };
  return { rows, network, imports, history, waits, leases, context, shared, run,
    setStatus: status => { amazonStatus = status; }, failImport: () => { importFailure = true; },
    failPost: () => { postFailure = true; }, failDocument: () => { documentFailure = true; } };
}

for (const kind of Object.keys(slices)) {
  test(`${kind}: submit creates/reuses exact report and never polls or sleeps`, async () => {
    const f = fixture(kind);
    assert.equal(await f.run('submit'), 'PENDING'); assert.equal(f.network.length, 1); assert.equal(f.network[0].method, 'POST');
    assert.equal(await f.run('submit'), 'PENDING'); assert.equal(f.rows.length, 1); assert.equal(f.network.length, 1); assert.equal(f.waits.length, 0);
    assert.equal(f.rows[0].configId, profile.configId); assert.equal(f.rows[0].profileId, profile.profileId);
    const body = f.network[0].data;
    const inclusive = moment(body.dataEndTime).diff(moment(body.dataStartTime), 'days') + 1;
    assert(inclusive <= 30, `${kind} payload length ${inclusive}`);
    if (kind === 'brand') assert.equal(body.reportOptions.reportPeriod, 'WEEK');
  });
  test(`${kind}: missing poll is retryable failure without a POST`, async () => {
    const f = fixture(kind); assert.equal(await f.run('poll'), 'ERROR'); assert.equal(f.network.length, 0);
  });
  test(`${kind}: pending poll checks once without POST, import or sleep`, async () => {
    const f = fixture(kind); await f.run('submit'); f.network.length = 0;
    assert.equal(await f.run('poll'), 'PENDING'); assert.equal(f.network.length, 1); assert.equal(f.network[0].method, 'GET'); assert.equal(f.imports.length, 0); assert.equal(f.waits.length, 0);
  });
  test(`${kind}: DONE imports before completion and replay never imports twice`, async () => {
    const f = fixture(kind); await f.run('submit'); f.setStatus('DONE');
    assert.equal(await f.run('poll'), 'COMPLETED'); assert.equal(f.imports.length, 1); assert.equal(f.rows[0].status, 'COMPLETED');
    assert.equal(await f.run('poll'), 'COMPLETED'); assert.equal(f.imports.length, 1); assert.equal(f.waits.length, 0);
    if (kind === 'brand') assert.equal(f.network[0].data.reportOptions.reportPeriod, 'WEEK');
  });
  test(`${kind}: fatal/cancelled terminal states settle truthfully without POST`, async () => {
    for (const [state, result] of [['FATAL', 'ERROR'], ['CANCELLED', 'COMPLETED']]) {
      const f = fixture(kind); await f.run('submit'); f.network.length = 0; f.setStatus(state);
      assert.equal(await f.run('poll'), result); assert.equal(f.rows[0].status, state); assert.equal(f.imports.length, 0); assert.equal(f.network.length, 1);
    }
  });
  test(`${kind}: document and importer failures never mark complete`, async () => {
    for (const fail of ['failImport', 'failDocument']) {
      const f = fixture(kind); await f.run('submit'); f.setStatus('DONE'); f[fail]();
      assert.equal(await f.run('poll'), 'ERROR'); assert.notEqual(f.rows[0].status, 'COMPLETED'); assert.equal(f.waits.length, 0);
    }
  });
  test(`${kind}: POST failure is error and consumes no poll request`, async () => {
    const f = fixture(kind); f.failPost(); assert.equal(await f.run('submit'), 'ERROR'); assert.equal(f.network.length, 1); assert.equal(f.rows.length, 0);
  });
}

test('phase history aggregation waits for healthy pending siblings before a failure settles', async () => {
  const f = fixture('sales');
  assert.equal(f.shared.aggregateSellerReportStatus(['ERROR', 'PENDING']), 'PENDING');
  assert.equal(f.shared.aggregateSellerReportStatus(['ERROR', 'COMPLETED']), 'ERROR');
  assert.equal(f.shared.aggregateSellerReportStatus(['COMPLETED', 'COMPLETED']), 'COMPLETED');
  await f.shared.saveHistoricalSellerHistory(f.context.cronJobHistorySchema, 'history-1', ['PENDING']);
  await f.shared.saveHistoricalSellerHistory(f.context.cronJobHistorySchema, 'history-1', ['ERROR']);
  assert.equal(f.history[0].status, 'PENDING'); assert.equal(f.history[1].status, 'FAILED');
});

test('overlapping pollers consume under a report-specific lease only once', async () => {
  const f = fixture('sales'); await f.run('submit'); f.setStatus('DONE');
  const outcomes = await Promise.all([f.run('poll'), f.run('poll')]);
  assert(outcomes.includes('COMPLETED')); assert.equal(f.imports.length, 1); assert.equal(f.leases.size, 0);
});

test('Brand rejects partial or overlong week without contacting Amazon', async () => {
  const f = fixture('brand');
  assert.equal(await f.context.exports.run({ profile, checkSPConfig: {}, marketPlaceConfig: {}, chunks: [['B0FIXTURE']], startDate: '2026-10-01', endDate: '2026-10-30', reportPhase: 'submit', reportPeriod: 'WEEK' }), 'ERROR');
  assert.equal(f.network.length, 0);
});

for (const kind of ['order', 'sales', 'reimbursement', 'mfn']) {
  test(`${kind}: public cron persists exact pending/completed history for explicit phases`, async () => {
    const f = fixture(kind); const c = f.context;
    let file, start, end, name;
    if (kind === 'order') [file, start, end, name] = ['order', 'exports.cronGenerateOrderReport =', 'const generateSPReport =', 'cronGenerateOrderReport'];
    else if (kind === 'sales') [file, start, end, name] = ['inventory', 'exports.cronGenerateSalesReport =', 'async function generateSalesReportForDate', 'cronGenerateSalesReport'];
    else if (kind === 'reimbursement') [file, start, end, name] = ['reconciliationReimbursement', 'exports.cronGenerateReimbursementReport =', 'async function generateReimbursementSPReport', 'cronGenerateReimbursementReport'];
    else {
      [file, start, end, name] = ['order', 'exports.cronGenerateRefundReport =', 'async function generateReturnsSPReport', 'cronGenerateRefundReport'];
      vm.runInContext(slice('order', 'async function generateFBAReturnsSPReport', 'const processFBAReturnsReportStream'), c);
    }
    vm.runInContext(slice(file, start, end), c);
    const input = { configId: profile.configId, profileId: profile.profileId, startDate: '2026-10-01', endDate: '2026-10-02', recurring: false, cronjobid: 'exact-history' };
    await c.exports[name]({ ...input, reportPhase: 'submit' });
    assert.equal(f.history.at(-1).id, 'exact-history'); assert.equal(f.history.at(-1).status, 'PENDING');
    f.setStatus('DONE'); await c.exports[name]({ ...input, reportPhase: 'poll' });
    assert.equal(f.history.at(-1).status, 'COMPLETED');
    assert(f.rows.every(row => row.startDate >= input.startDate && row.endDate <= input.endDate));
  });
}

test('Brand freezes exact scoped sorted partitions and reuses them after product-list changes', async () => {
  const f = fixture('brand'); const c = f.context; let asins = ['B0B', 'B0A']; const record = { details: {} }; let collects = 0;
  c.productListingSchema = { find: filter => { assert.equal(filter.configId, profile.configId); return { distinct: async () => { collects++; return asins; } }; } };
  const q = value => ({ select() { return this; }, lean: async () => value });
  const scope = { _id: 'history-week', configId: profile.configId, profileId: profile.profileId, startDate: '2026-10-04', endDate: '2026-10-10' };
  c.cronJobHistorySchema.findOne = filter => { for (const key of Object.keys(scope)) assert.equal(filter[key], scope[key]); return q(record); };
  c.cronJobHistorySchema.findOneAndUpdate = (filter, update) => { assert.equal(filter['details.brandAsinChunks'].$exists, false); record.details.brandAsinChunks ||= update.$set['details.brandAsinChunks']; return q(record); };
  vm.runInContext(`${slice('brandAnalytics', 'const getBrandAsinChunks =', 'const selectBrandReportPeriod =')}\nexports.freezeChunks = getBrandAsinChunks;`, c);
  const input = { cronjobid: scope._id, startDate: scope.startDate, endDate: scope.endDate, reportPhase: 'submit' };
  const original = await c.exports.freezeChunks(profile, input);
  assert.equal(JSON.stringify(original), JSON.stringify([['B0A', 'B0B']]));
  asins = ['B0NEW'];
  assert.equal(JSON.stringify(await c.exports.freezeChunks(profile, { ...input, reportPhase: 'poll' })), JSON.stringify(original));
  assert.equal(JSON.stringify(await c.exports.freezeChunks(profile, input)), JSON.stringify(original));
  assert.equal(collects, 1);
});

test('Brand reader chooses a single grain and falls back to weekly data when monthly is absent', async () => {
  const f = fixture('brand'); const c = f.context; let monthExists = true; const scopes = [];
  c.brandAnalyticsSchema.exists = async filter => { scopes.push(filter); return monthExists ? { _id: 'month' } : null; };
  vm.runInContext(`${slice('brandAnalytics', 'const selectBrandReportPeriod =', 'exports.cronBrandAnalytics =')}\nexports.selectPeriod = selectBrandReportPeriod;`, c);
  const scope = { configId: profile.configId, profileId: profile.profileId };
  assert.equal(await c.exports.selectPeriod(scope, undefined), 'MONTH');
  assert.equal(await c.exports.selectPeriod(scope, 'WEEK'), 'WEEK');
  monthExists = false; assert.equal(await c.exports.selectPeriod(scope, 'MONTH'), 'WEEK');
  assert(scopes.every(item => item.configId === profile.configId && item.reportPeriod === 'MONTH'));
});

test('Seller phase identity rejects invalid dates, reversed windows and over30 days before provider calls', async () => {
  const f = fixture('sales'); let creates = 0;
  for (const [startDate, endDate] of [['2026-02-30', '2026-03-01'], ['2026-10-02', '2026-10-01'], ['2026-10-01', '2026-10-31'], ['2026-1-01', '2026-01-02']]) {
    assert.equal(await f.shared.runHistoricalSellerReport({ phase: 'submit', identity: { configId: profile.configId, profileId: profile.profileId, reportTypeId: 'test', startDate, endDate }, createRequest: async () => { creates++; return {}; }, processReport: async () => 'COMPLETED' }), 'ERROR');
  }
  assert.equal(creates, 0);
});

test('Brand historical provider identity includes stable canonical ASIN hash', async () => {
  const f = fixture('brand'); const args = { profile, checkSPConfig: { spAccessToken: 'dummy' }, marketPlaceConfig: { endPoint: 'https://amazon.invalid' }, startDate: '2026-10-04', endDate: '2026-10-10', reportPhase: 'submit', reportPeriod: 'WEEK' };
  await f.context.exports.run({ ...args, chunks: [['B0A', 'B0B']] });
  await f.context.exports.run({ ...args, chunks: [['B0B', 'B0A']] });
  assert.equal(f.rows.length, 1);
  await f.context.exports.run({ ...args, chunks: [['B0A', 'B0C']] });
  assert.equal(f.rows.length, 2); assert.notEqual(f.rows[0].reportTypeId, f.rows[1].reportTypeId);
});

for (const [file, start, end, name, payload] of [
  ['inventory', 'const processReportFileStream =', 'const buildInventoryBasePipeline', 'processReportFileStream', { value: { childAsin: 'B0FIXTURE' } }],
  ['order', 'const processReturnsReportStream =', 'async function generateFBAReturnsSPReport', 'processReturnsReportStream', { value: { order_id: 'fixture', item_details: {} } }],
  ['order', 'const processFBAReturnsReportStream =', 'exports.refundGraphData', 'processFBAReturnsReportStream', { value: { 'order-id': 'fixture' } }],
  ['reconciliationReimbursement', 'const processReimbursementReportStream =', 'exports.cronGenerateShipmentQueueReport', 'processReimbursementReportStream', { 'reimbursement-id': 'fixture', reason: 'fixture' }],
]) {
  test(`${name}: actual stream propagates asynchronous flush failures`, async () => {
    const f = fixture('sales'); const c = f.context;
    const pipeline = new (require('node:events').EventEmitter)(); pipeline.pause = () => {}; pipeline.resume = () => {}; pipeline.destroy = () => {};
    c.chain = () => pipeline; c.parser = () => {}; c.pick = () => {}; c.streamArray = () => {}; c.csv = () => {};
    c.fs.createReadStream = () => {}; c.mapReimbursementType = () => 'OTHER';
    c.orderSchema = { aggregate: async () => [] }; c.productListingSchema = {};
    c.parallelBulkWrite = async () => { throw new Error('fixture stream write failed'); };
    vm.runInContext(`${slice(file, start, end)}\nexports.stream = ${name};`, c);
    const pending = c.exports.stream({}, 'fixture.file', { configId: profile.configId, profileId: profile.profileId, date: '2026-10-01' });
    const rejected = assert.rejects(pending, /fixture stream write failed/);
    pipeline.emit('data', payload); await new Promise(resolve => setImmediate(resolve)); pipeline.emit('end');
    await rejected;
  });
}

test('historical daily sales scalar importer rejects a failed write instead of reporting success', async () => {
  const f = fixture('sales'); const c = f.context; const pipeline = new (require('node:events').EventEmitter)();
  pipeline.pause = () => {}; pipeline.resume = () => {}; pipeline.destroy = () => {};
  c.chain = () => pipeline; c.parser = () => {}; c.pick = () => {}; c.streamArray = () => {}; c.fs.createReadStream = () => {};
  c.dailyOrderSalesSchema = { updateOne: async () => { throw new Error('fixture daily write failed'); } };
  vm.runInContext(`${slice('inventory', 'const processDailyOrderSalesStream =', 'const processReportFileStream =')}\nexports.daily = processDailyOrderSalesStream;`, c);
  const rejected = assert.rejects(c.exports.daily('fixture.file', { configId: profile.configId, profileId: profile.profileId, date: '2026-10-01', strict: true }), /fixture daily write failed/);
  pipeline.emit('data', { value: { salesByDate: { orderedProductSales: { amount: 0 } } } }); await rejected;
});

test('stream error guard preserves synchronous backpressure before the next row can emit', async () => {
  const f = fixture('sales'); let paused = false;
  const callback = f.shared.sellerReportStreamHandler({ destroy() {} }, () => {}, async () => { paused = true; await Promise.resolve(); });
  callback(); assert.equal(paused, true);
});
