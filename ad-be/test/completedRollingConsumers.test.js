const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const moment = require('moment-timezone');
const { getRollingReportDates } = require('../api-server/helper/rollingReportDates');
const controller = fs.readFileSync(path.join(__dirname, '../api-server/controllers/fcInventory.controller.js'), 'utf8');
const mfnSource = controller.slice(controller.indexOf('exports.getMfnToFbaRecommendations ='));
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
function fixture(timezone = 'Asia/Kolkata') {
  const queries = [];
  const emptyModel = { find() { return { lean: async () => [] }; } };
  const context = { exports: {}, moment, console, mongoose: { Types: { ObjectId: { isValid: () => false } } },
    sanitizeProfileAndConfig: async () => ({ cleanProfileId: 123 }),
    profilesSchema: { findOne() { return { select() { return { lean: async () => ({ timezone }) }; } }; } },
    orderDetailsModel: { find(query) { queries.push(query); return { select() { return { lean: async () => [] }; } }; } },
    fulfillmentCenterSchema: emptyModel, fulfillmentCenterMasterSchema: emptyModel,
    enrichProductsWithListing: async () => {},
  };
  vm.runInNewContext(mfnSource, context);
  return { handler: context.exports.getMfnToFbaRecommendations, queries };
}
for (const timezone of ['Asia/Kolkata', 'America/Los_Angeles']) {
  test(`MFN selected Last 30 queries completed dates and does not widen empty results (${timezone})`, async () => {
    const originalNow = moment.now;
    moment.now = () => Date.parse('2026-10-26T10:00:00Z');
    try {
      const { handler, queries } = fixture(timezone);
      const res = response();
      await handler({ body: { profileId: 123, days: 30 } }, res);
      assert.equal(res.code, 200);
      assert.equal(res.body.isSuccess, true);
      assert.equal(queries.length, 1, 'empty filtered data must not trigger an all-time fallback');
      const bounds = queries[0].orderCreatedTime;
      assert.equal(bounds.$gte.toISOString(), moment.tz('2026-09-26', timezone).startOf('day').toISOString());
      assert.equal(bounds.$lte.toISOString(), moment.tz('2026-10-25', timezone).endOf('day').toISOString());
      assert.equal(res.body.data.periodStart, '2026-09-26');
      assert.equal(res.body.data.periodEnd, '2026-10-25');
    } finally { moment.now = originalNow; }
  });
}
test('MFN preserves explicitly selected dates, including today, and All Time', async () => {
  for (const body of [{ fromDate: '2026-10-26', toDate: '2026-10-26' }, { days: 'ALL' }]) {
    const { handler, queries } = fixture();
    const res = response();
    await handler({ body: { profileId: 123, ...body } }, res);
    assert.equal(res.code, 200);
    assert.equal(queries.length, 1);
    if (body.days) assert.equal(queries[0].orderCreatedTime, undefined);
    else assert.equal(res.body.data.periodEnd, '2026-10-26');
  }
});
test('weekly performance email uses same completed date bounds in queries and labels', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers/dashboard.controller.js'), 'utf8');
  const start = source.indexOf('const getWeeklyPerformance =');
  const end = source.indexOf('\n};', start) + 3;
  const queries = [];
  const context = { moment, getRollingReportDates, campaignSchema: { aggregate: async pipeline => { queries.push(pipeline[0].$match); return []; } }, console, write_logs() {} };
  vm.runInNewContext(source.slice(start, end) + '\nthis.run = getWeeklyPerformance;', context);
  const originalNow = moment.now;
  moment.now = () => Date.parse('2026-10-26T10:00:00Z');
  try {
    const result = await context.run(123, 'Asia/Kolkata');
    assert.deepEqual(JSON.parse(JSON.stringify(queries[0].reportDate)), { $gte: '2026-10-19', $lte: '2026-10-25' });
    assert.deepEqual(JSON.parse(JSON.stringify(queries[1].reportDate)), { $gte: '2026-09-26', $lte: '2026-10-25' });
    assert.equal(result.dateRanges.last7Days.to, '25/10');
    assert.equal(result.dateRanges.last30Days.to, '25/10');
    assert.equal(result.dateRanges.mtd.to, '26/10');
  } finally { moment.now = originalNow; }
});
test('FC matrix rolling order ranges exclude today while preserving stock snapshot and custom dates', async () => {
  const matrixSource = controller.slice(controller.indexOf('exports.getFcSkuMatrix ='), controller.indexOf('/**', controller.indexOf('exports.getFcSkuMatrix =') + 10));
  const originalNow = moment.now;
  moment.now = () => Date.parse('2026-10-26T10:00:00Z');
  try {
    for (const [snapshot, body, expectedStart, expectedEnd] of [
      ['2026-10-26', { days: 7 }, '2026-10-19', '2026-10-25'],
      ['2026-10-10', { days: 7, date: '2026-10-10' }, '2026-10-04', '2026-10-10'],
      ['2026-10-26', { days: 7, fromDate: '2026-10-26', toDate: '2026-10-26' }, '2026-10-26', '2026-10-26'],
    ]) {
      const ledgers = [], orders = [];
      const emptyModel = { find() { return { lean: async () => [] }; } };
      const context = { exports: {}, moment, console, mongoose: { Types: { ObjectId: { isValid: () => false } } },
        sanitizeProfileAndConfig: async () => ({ cleanProfileId: 123 }),
        getLatestReportDate: async () => '2026-10-26', resolveReportDate: async () => snapshot,
        profilesSchema: { findOne() { return { select() { return { lean: async () => ({ timezone: 'Asia/Kolkata' }) }; } }; } },
        fcInventoryLedgerSchema: { aggregate: async pipeline => { ledgers.push(pipeline[0].$match); return []; } },
        orderDetailsModel: {
          findOne() { return { sort() { return { select() { return { lean: async () => ({ orderCreatedTime: '2026-10-26T01:00:00Z' }) }; } }; } }; },
          find(query) { orders.push(query); return { select() { return { lean: async () => [] }; } }; },
        },
        fulfillmentCenterSchema: emptyModel, fulfillmentCenterMasterSchema: emptyModel,
        enrichProductsWithListing: async () => {},
      };
      vm.runInNewContext(matrixSource, context);
      const res = response();
      await context.exports.getFcSkuMatrix({ body: { profileId: 123, ...body } }, res);
      assert.equal(res.code, 200);
      assert.equal(res.body.isSuccess, true);
      assert.equal(ledgers[0].reportDate, snapshot, 'stock snapshot must stay intact');
      assert.equal(ledgers[1].reportDate.$gte, expectedStart);
      assert.equal(ledgers[1].reportDate.$lte, expectedEnd);
      assert.equal(moment(orders[0].orderCreatedTime.$gte).tz("Asia/Kolkata").format('YYYY-MM-DD'), expectedStart);
      assert.equal(moment(orders[0].orderCreatedTime.$lte).tz("Asia/Kolkata").format('YYYY-MM-DD'), expectedEnd);
    }
  } finally { moment.now = originalNow; }
});
