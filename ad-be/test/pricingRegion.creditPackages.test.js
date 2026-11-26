const assert = require('node:assert/strict');
const path = require('node:path');
const { test, describe, beforeEach } = require('node:test');
const mongoose = require('mongoose');

/**
 * Pricing Regions (Plans page) and AI credit packages share the same regions: the regions list
 * includes each credit package's region prices, and deleting a region removes those prices.
 */
const root = path.join(__dirname, '..');
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};
const chain = (rows) => {
  const q = { select: () => q, sort: () => q, skip: () => q, limit: () => q, lean: async () => rows, then: (a, b) => Promise.resolve(rows).then(a, b) };
  return q;
};

const calls = [];
const state = { regions: [], plans: [], creditPackages: [], settings: null };
stub('api-server/models/pricingRegion.model.js', {
  find: () => chain(state.regions),
  countDocuments: async () => state.regions.length,
  deleteOne: async (filter) => calls.push(['region.deleteOne', filter]),
});
stub('api-server/models/packages.model.js', { find: () => chain(state.plans) });
stub('api-server/models/organization.model.js', {});
stub('api-server/models/aiCreditPackage.model.js', {
  find: (filter) => (calls.push(['creditPackage.find', filter]), chain(state.creditPackages)),
  updateMany: async (filter, update) => calls.push(['creditPackage.updateMany', filter, update]),
});
stub('api-server/models/aiCreditSetting.model.js', {
  findOne: () => chain(state.settings),
  updateOne: async (filter, update) => calls.push(['setting.updateOne', filter, update]),
});
stub('winston/utility/logger.js', { write_logs: () => {} });

const controller = require('../api-server/controllers/pricingRegion.controller');
const res = () => {
  const r = { statusCode: 200, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
};

beforeEach(() => {
  calls.length = 0;
  const india = new mongoose.Types.ObjectId();
  state.regions = [{ _id: india, name: 'India', currency: 'INR', countries: ['IN'], prices: [] }];
  state.plans = [{ _id: new mongoose.Types.ObjectId(), name: 'Pro', price: 49 }];
  state.creditPackages = [{ _id: new mongoose.Types.ObjectId(), name: 'Starter', credits: 50, price: 30, currency: 'USD', regionalPrices: [{ regionId: india, price: 2499 }] }];
  state.settings = { customPurchase: { enabled: true, ratePer1K: 19, currency: 'USD', regionalRates: [{ regionId: india, ratePer1K: 1600 }] } };
});

describe('Pricing Regions list and AI credit packages', () => {
  test('the regions list also returns credit packages (not deleted) with their region prices', async () => {
    const r = res();
    await controller.getRegions({ body: { pageNo: 1, perPage: 10 } }, r);
    assert.equal(r.body.isSuccess, true);
    assert.equal(r.body.creditPackages.length, 1);
    assert.deepEqual(r.body.creditPackages[0].regionalPrices.map((p) => p.price), [2499]);
    const [, filter] = calls.find(([name]) => name === 'creditPackage.find');
    assert.deepEqual(filter, { isDeleted: { $ne: true } });
    assert.deepEqual([r.body.creditCustomPricing.ratePer1K, r.body.creditCustomPricing.regionalRates[0].ratePer1K], [19, 1600]);
  });

  test('custom amount pricing is only listed when it is switched on', async () => {
    state.settings.customPurchase.enabled = false;
    const r = res();
    await controller.getRegions({ body: {} }, r);
    assert.equal(r.body.creditCustomPricing, null);
  });

  test('deleting a region removes it from every credit package and the custom amount rates', async () => {
    const regionId = String(state.regions[0]._id);
    const r = res();
    await controller.deleteRegion({ body: { regionId } }, r);
    assert.equal(r.body.isSuccess, true);
    const [, filter, update] = calls.find(([name]) => name === 'creditPackage.updateMany');
    assert.deepEqual(filter, { 'regionalPrices.regionId': regionId });
    assert.equal(String(update.$pull.regionalPrices.regionId), regionId);
    assert.ok(update.$pull.regionalPrices.regionId instanceof mongoose.Types.ObjectId);
    const [, sFilter, sUpdate] = calls.find(([name]) => name === 'setting.updateOne');
    assert.deepEqual(sFilter, { key: 'global' });
    assert.equal(String(sUpdate.$pull['customPurchase.regionalRates'].regionId), regionId);
  });
});
