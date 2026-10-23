'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportService } = require('../api-server/services/chatbotReporting.handlers');
const { createChatService } = require('../api-server/services/chatbotReporting.chat');
const { validateReportResponse } = require('../api-server/contracts/chatbotReporting.contract');

const HEX24 = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-22T18:00:00Z');
const D = '2026-10-20';

const SCOPE = {
  configId: HEX24,
  profiles: [{
    profileId: '1001', timezone: 'America/Los_Angeles', currencyCode: 'USD', accountType: 'seller',
    adTypes: ['SP'], attributionWindows: { SP: 7 },
    supportedDimensions: { SP: ['profile', 'campaign', 'product', 'date'] },
  }],
  currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
};

function matchesFilter(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$ne' in value) return String(row[key]) !== String(value.$ne);
      return true; // range operators handled separately in find()
    }
    if (value === null) return row[key] === null || row[key] === undefined;
    return String(row[key]) === String(value);
  });
}

function fakeDb(data) {
  return { collection(name) {
    const all = data[name] || [];
    return {
      find(filter = {}) {
        const range = filter.reportDate || filter.ruleDate || filter.date;
        const rows = all.filter(row => {
          const d = row.reportDate || row.ruleDate || row.date;
          if (range && range.$gte && d < range.$gte) return false;
          if (range && range.$lte && d > range.$lte) return false;
          return true;
        });
        return { limit() { return { toArray: async () => rows }; }, sort() { return this; }, toArray: async () => rows };
      },
      findOne: async (filter = {}) => all.find(row => matchesFilter(row, filter)) || null,
      countDocuments: async () => all.length,
    };
  } };
}

// An active, non-disconnected Seller (SP-API) connection for profile 1001.
const SELLER_ACTIVE = [{ configId: HEX24, profileId: 1001, isActive: true, disconnectedAt: null, spRefreshToken: 'x' }];

function service(data) {
  // Default to a connected Seller account unless the test overrides it.
  const withSeller = { sellerconfigs: SELLER_ACTIVE, ...data };
  return createReportService({
    db: fakeDb(withSeller),
    resolveScope: async () => SCOPE,
    checkReportPermission: async () => true,
    readKeywords: async () => ({ existingKeywords: new Set() }),
    now: () => NOW,
    makeReportId: () => 'rep_test',
  });
}

const AUTH = { userId: HEX24, configId: HEX24, organizationId: HEX24, currencyCode: 'USD', profileIds: ['1001'] };
const base = { schemaVersion: '1.0', adTypes: ['SP'], profileIds: ['1001'], comparison: { mode: 'none' }, groupBy: [], filters: [], limit: 25, offset: 0, presentation: 'auto' };

const INVENTORY = [
  { configId: HEX24, profileId: 1001, asin: 'B00AAA0001', name: 'Blue Widget', currentStock: 4, totalStock: 4, inboundStock: 2, fulfillmentType: 'FBA', status: 'LOW', daysLeft: 3 },
  { configId: HEX24, profileId: 1001, asin: 'B00AAA0001', name: 'Blue Widget', currentStock: 1, totalStock: 1, inboundStock: 0, fulfillmentType: 'FBM', status: 'LOW' },
  { configId: HEX24, profileId: 1001, asin: 'B00BBB0002', name: 'Red Gadget', currentStock: 120, totalStock: 120, inboundStock: 0, fulfillmentType: 'FBA', status: 'HEALTHY' },
  { configId: HEX24, profileId: 1001, asin: 'B00CCC0003', name: 'Green Thing', currentStock: 0, totalStock: 0, inboundStock: 0, fulfillmentType: 'FBA', status: 'OUT_OF_STOCK' },
];

const TACOS_DATA = {
  campaigns: [
    { configId: HEX24, profileId: 1001, reportDate: D, campaignId: 11, spend: 60, sales: 300, currencyCode: 'USD' },
    { configId: HEX24, profileId: 1001, reportDate: D, campaignId: 12, spend: 40, sales: 100, currencyCode: 'USD' },
  ],
  dailyordersales: [
    { configId: HEX24, profileId: 1001, date: D, orderSales: 400 },
    { configId: HEX24, profileId: 1001, date: '2026-10-19', orderSales: 100 },
  ],
  businessproductsales: [
    { configId: HEX24, profileId: 1001, reportDate: D, asin: 'B00AAA0001', sales: 150 },
    { configId: HEX24, profileId: 1001, reportDate: D, asin: 'B00BBB0002', sales: 350 },
  ],
  product_ads: [
    { configId: HEX24, profileId: 1001, reportDate: D, adId: 71, campaignId: 11, asins: 'B00AAA0001', name: 'Blue Widget', spend: 30, sales: 150, orders: 3, clicks: 10, impressions: 100, currencyCode: 'USD' },
    { configId: HEX24, profileId: 1001, reportDate: D, adId: 72, campaignId: 12, asins: 'B00BBB0002', name: 'Red Gadget', spend: 70, sales: 350, orders: 5, clicks: 20, impressions: 200, currencyCode: 'USD' },
  ],
};

test('low stock lists products lowest-first, summing FBA+FBM per ASIN, with a chart', async () => {
  const report = await service({ inventories: INVENTORY })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['stock'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);

  validateReportResponse(report); // throws if the contract is violated
  assert.equal(report.status, 'partial');
  const ds = report.datasets.find(d => d.rows.some(r => 'stock' in r));
  assert.ok(ds, 'has a stock dataset');
  assert.deepEqual(ds.rows.map(r => r.productId), ['B00CCC0003', 'B00AAA0001', 'B00BBB0002'], 'sorted ascending by stock');
  const blueWidget = ds.rows.find(r => r.productId === 'B00AAA0001');
  assert.equal(blueWidget.stock, 5, 'FBA(4) + FBM(1) summed');
  assert.ok(report.blocks.some(b => b.type === 'bar'), 'renders a bar chart');
  assert.ok(report.blocks.some(b => b.type === 'table'), 'renders a table');
});

test('days_of_stock is included and flagged when sales velocity is missing', async () => {
  const noVelocity = INVENTORY.map(({ daysLeft, ...rest }) => rest); // strip daysLeft
  const report = await service({ inventories: noVelocity })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['stock', 'days_of_stock'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  const ds = report.datasets.find(d => d.columns.some(c => c.key === 'days_of_stock'));
  assert.ok(ds, 'days_of_stock column present');
  assert.ok(report.freshness.missingInputs.some(m => /sales velocity/i.test(m)), 'notes missing velocity');
});

test('low stock with no inventory is unavailable and offers the basic alternative', async () => {
  const report = await service({ inventories: [] })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['stock'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  assert.equal(report.status, 'unavailable');
  assert.ok(report.followUps.some(f => /spend|sales/i.test(f.label)), 'offers an honest alternative');
});

test('TACOS returns the account headline and a per-product breakdown', async () => {
  const report = await service(TACOS_DATA)(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['tacos'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  assert.equal(report.status, 'partial');

  const card = report.cards.find(c => c.metric === 'tacos');
  assert.ok(card, 'has a TACOS card');
  // total ad spend 100 / total ordered sales 500 = 20%
  assert.equal(Math.round(card.value * 100) / 100, 20);
  assert.equal(card.unit, 'percent');
  assert.ok(report.blocks.some(b => b.type === 'number_card' && b.metricId === card.id), 'card has a number_card block');

  const ds = report.datasets.find(d => d.columns.some(c => c.key === 'tacos'));
  assert.ok(ds, 'per-product table present');
  const blue = ds.rows.find(r => r.productId === 'B00AAA0001');
  assert.equal(blue.adSpend, 30);
  assert.equal(blue.totalSales, 150);
  assert.equal(Math.round(blue.tacos * 100) / 100, 20, 'per-product TACOS 30/150 = 20%');
});

test('TACOS with zero total sales reports no_sales, not a divide-by-zero', async () => {
  const report = await service({ ...TACOS_DATA, dailyordersales: [{ configId: HEX24, profileId: 1001, date: D, orderSales: 0 }] })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['tacos'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  const card = report.cards.find(c => c.metric === 'tacos');
  assert.equal(card.value, null);
  assert.equal(card.status, 'no_sales');
});

test('product profit stays unavailable (not silently wrong) - only stock & tacos were wired', async () => {
  const report = await service({ product_ads: [] })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['profit'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  assert.equal(report.status, 'unavailable');
});

test('end-to-end: a "low stock" chat turn returns a rendered report', async () => {
  const mockAi = {
    async requestTurn() {
      return {
        provider: 'anthropic', model: 'm', text: '',
        toolCalls: [{ id: 'c1', name: 'run_report', arguments: { category: 'products', groupBy: ['product'], metrics: ['stock'], presentation: 'bar', period: { preset: 'last_7_days' } } }],
      };
    },
  };
  const chat = createChatService({ aiProvider: mockAi, reportService: service({ inventories: INVENTORY }) });
  const res = await chat({ message: 'Which advertised products are low on stock?', profileIds: ['1001'] }, AUTH);
  assert.equal(res.isReport, true);
  assert.equal(res.report.status, 'partial');
  assert.ok(res.report.datasets.some(d => d.columns.some(c => c.key === 'stock')), 'stock data rendered');
});

test('seller not connected: TACOS says so clearly and offers the ads-only alternative', async () => {
  const report = await service({ ...TACOS_DATA, sellerconfigs: [] })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['tacos'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  assert.equal(report.status, 'unavailable');
  assert.ok(report.freshness.missingInputs.some(m => /Seller account.*connection|SP-API/i.test(m)), 'flags the seller connection');
  assert.ok(report.followUps.some(f => /spend|sales/i.test(f.label)), 'offers the ads-only alternative');
});

test('seller not connected: low stock and profit are gated too', async () => {
  for (const metric of ['stock', 'profit', 'days_of_stock']) {
    const report = await service({ inventories: INVENTORY, sellerconfigs: [] })(
      { ...base, category: 'products', groupBy: ['product'], metrics: [metric], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
    validateReportResponse(report);
    assert.equal(report.status, 'unavailable', `${metric} gated`);
    assert.ok(report.freshness.missingInputs.some(m => /Seller account.*connection|SP-API/i.test(m)), `${metric} flags seller connection`);
  }
});

test('seller not connected: a disconnected sellerConfig is treated as not connected', async () => {
  const disconnected = [{ configId: HEX24, profileId: 1001, isActive: false, disconnectedAt: new Date() }];
  const report = await service({ ...TACOS_DATA, sellerconfigs: disconnected })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['tacos'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  assert.equal(report.status, 'unavailable');
  assert.ok(report.freshness.missingInputs.some(m => /Seller account.*connection|SP-API/i.test(m)));
});

test('ads-only per-product report is NOT gated by the seller connection', async () => {
  // "ad spend & sales by product" comes from product_ads (ads connection), so it must
  // still work even when the Seller account is disconnected.
  const report = await service({ product_ads: TACOS_DATA.product_ads, sellerconfigs: [] })(
    { ...base, category: 'products', groupBy: ['product'], metrics: ['spend', 'sales', 'orders', 'clicks'], period: { preset: 'last_7_days' }, presentation: 'bar' }, AUTH);
  validateReportResponse(report);
  assert.notEqual(report.status, 'unavailable');
  assert.ok(report.datasets.some(d => d.rows.length > 0), 'renders advertised-product rows');
});

test('end-to-end: a "TACOS" chat turn returns the headline TACOS card', async () => {
  const mockAi = {
    async requestTurn() {
      return {
        provider: 'anthropic', model: 'm', text: '',
        toolCalls: [{ id: 'c1', name: 'run_report', arguments: { category: 'products', groupBy: ['product'], metrics: ['tacos'], presentation: 'bar', period: { preset: 'last_7_days' } } }],
      };
    },
  };
  const chat = createChatService({ aiProvider: mockAi, reportService: service(TACOS_DATA) });
  const res = await chat({ message: "What's my TACOS this week?", profileIds: ['1001'] }, AUTH);
  assert.equal(res.isReport, true);
  assert.ok(res.report.cards.some(c => c.metric === 'tacos' && c.value !== null), 'TACOS card present');
});
