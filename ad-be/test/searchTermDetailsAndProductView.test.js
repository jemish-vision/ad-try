const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const source = fs.readFileSync(path.join(__dirname, '../api-server/controllers/searchTerm.controller.js'), 'utf8');

const detailsStart = source.lastIndexOf('\nexports.getSearchTermDetailsData =', source.indexOf('exports.getAllSearchTerms ='));
const detailsEnd = source.indexOf('exports.getAllSearchTerms =');
const detailsHandlerSource = source.slice(detailsStart, detailsEnd);

test('getSearchTermDetailsData: returns 203 if profileId is missing', async () => {
    const context = {
        exports: {},
        require,
        searchTermSchema: {},
        mongoose: { Types: mongoose.Types },
        write_logs: () => {},
    };
    vm.runInNewContext(detailsHandlerSource, context);
    const req = { params: { id: '123' }, body: {}, models: {} };
    const res = {
        status(code) { this.code = code; return this; },
        send(data) { this.data = data; return this; },
    };
    await context.exports.getSearchTermDetailsData(req, res);
    assert.equal(res.code, 203);
    assert.equal(res.data.isSuccess, false);
    assert.equal(res.data.message, 'Profile id required!');
});

test('getSearchTermDetailsData: executes single facet aggregate and enriches products', async () => {
    const pipelines = [];
    const productQueries = [];
    const targetSchema = {
        aggregate(pipeline) {
            pipelines.push(pipeline);
            return {
                allowDiskUse() { return this; },
                then(resolve) {
                    return resolve([{
                        data: [{
                            adGroupId: 10,
                            campaignId: 20,
                            searchTerm: 'B0TESTASIN1',
                            totalSpend: 50,
                            totalSales: 150,
                            totalImpressions: 1000,
                            totalOrders: 5,
                            totalClicks: 20,
                            totalCpc: 2.5,
                            totalCtr: 2,
                            totalCvr: 25,
                            totalAcos: 33.33,
                            totalRoas: 3
                        }],
                        totalCount: [{ count: 1 }],
                        totalRow: [{
                            productName: 'Total',
                            totalSpend: 50,
                            totalSales: 150,
                            totalImpressions: 1000,
                            totalClicks: 20,
                            totalOrders: 5,
                            totalCpc: 2.5,
                            totalCtr: 2,
                            totalCvr: 25,
                            totalAcos: 33.33,
                            totalRoas: 3
                        }]
                    }]);
                }
            };
        }
    };
    const context = {
        exports: {},
        require,
        searchTermSchema: targetSchema,
        mongoose: {
            Types: mongoose.Types,
            connection: {
                collection(name) {
                    assert.equal(name, 'products');
                    return {
                        find(q, opts) {
                            productQueries.push({ q, opts });
                            return {
                                toArray: async () => [{ asin: 'B0TESTASIN1', title: 'Test Product Title', mainImage: { link: 'https://img.jpg' } }]
                            };
                        }
                    };
                }
            }
        },
        write_logs: () => {},
    };
    vm.runInNewContext(detailsHandlerSource, context);
    const req = {
        params: { id: '20' },
        body: { profileId: 12345, searchTermPageNo: 1, searchTermPerPage: 10, fromDate: '2026-10-01', toDate: '2026-10-26' },
        models: { adTypeSearchTermSchema: targetSchema }
    };
    const res = {
        status(code) { this.code = code; return this; },
        send(data) { this.data = data; return this; },
    };
    await context.exports.getSearchTermDetailsData(req, res);
    assert.equal(res.code, 200);
    assert.equal(res.data.isSuccess, true);
    assert.equal(pipelines.length, 1, 'Only one aggregation pipeline should be executed');
    assert.equal(res.data.totalSearchTermData, 1);
    assert.equal(res.data.getSearchTermData[0].productName, 'Test Product Title');
    assert.equal(res.data.getSearchTermData[0].imageUrl, 'https://img.jpg');
    assert.equal(res.data.totalRow.productName, 'Total');
    assert.equal(productQueries.length, 1);
    assert.deepEqual(productQueries[0].q.asin.$in, ['B0TESTASIN1']);
});

test('getSearchTermsProductView: returns 203 if profileId is missing', async () => {
    const handlerSource = source.slice(source.indexOf('exports.getSearchTermsProductView ='), source.indexOf('exports.addToNegative ='));
    const context = {
        exports: {},
        require,
        mockTestingDataService: {},
        moment,
        sanitizeQueryObject: v => v,
        safeJSON: v => v ? JSON.parse(v) : {},
        mongoose: { Types: mongoose.Types },
        write_logs: () => {},
    };
    vm.runInNewContext(handlerSource, context);
    const req = { body: {}, models: {} };
    const res = {
        status(code) { this.code = code; return this; },
        send(data) { this.data = data; return this; },
    };
    await context.exports.getSearchTermsProductView(req, res);
    assert.equal(res.code, 203);
    assert.equal(res.data.isSuccess, false);
    assert.equal(res.data.message, 'Profile id required.');
});

test('getSearchTermsProductView: pipelines without expensive campaign/productlistings lookups', async () => {
    const handlerSource = source.slice(source.indexOf('exports.getSearchTermsProductView ='), source.indexOf('exports.addToNegative ='));
    const pipelines = [];
    const targetingQueries = [];
    const productlistingQueries = [];
    const adTypeSearchTermSchema = {
        findOne() { return { sort() { return { lean: async () => ({ reportDate: '2026-10-26' }) }; } }; },
        aggregate(pipeline) {
            pipelines.push(pipeline);
            return {
                allowDiskUse() { return this; },
                then(resolve) {
                    return resolve([{
                        data: [{
                            asin: 'B0MOCK1234',
                            sku: 'TEST-SKU',
                            totalImpressions: 500,
                            totalClicks: 25,
                            totalOrders: 3,
                            totalSpend: 15.5,
                            totalSales: 90,
                            acos: 17.22,
                            roas: 5.81,
                            cpc: 0.62,
                            ctr: 5,
                            campaigns: [{
                                campaignId: 101,
                                totalImpressions: 500,
                                totalClicks: 25,
                                totalOrders: 3,
                                totalSpend: 15.5,
                                totalSales: 90,
                                acos: 17.22,
                                roas: 5.81,
                                cpc: 0.62,
                                ctr: 5,
                                searchTerms: [{
                                    searchTerm: 'test keyword',
                                    adGroupId: 201,
                                    impressions: 500,
                                    clicks: 25,
                                    orders: 3,
                                    spend: 15.5,
                                    sales: 90
                                }]
                            }]
                        }],
                        totalRecords: [{ count: 1 }]
                    }]);
                }
            };
        }
    };
    const adTypeTargetingSchema = {
        find(query) {
            targetingQueries.push(query);
            return {
                select() {
                    return {
                        lean: async () => [{
                            campaignId: 101,
                            adGroupId: 201,
                            targeting: 'test keyword',
                            matchType: 'EXACT',
                            status: 'ENABLED',
                            keywordType: 'KEYWORD'
                        }]
                    };
                }
            };
        }
    };
    const context = {
        exports: {},
        require,
        mockTestingDataService: {},
        moment,
        RegExp,
        AD_TYPE_COLLECTIONS: { SP: { campaign: 'campaigns', productAds: 'productads' } },
        getProfile: async () => ({ timezone: 'Asia/Kolkata' }),
        sanitizeQueryObject: v => v,
        safeJSON: v => v ? JSON.parse(v) : {},
        buildFieldFilter: () => ({}),
        mongoose: {
            Types: mongoose.Types,
            connection: {
                collection(name) {
                    if (name === 'campaigns') {
                        return { find: () => ({ toArray: async () => [{ campaignId: 101, name: 'Campaign 101', status: 'ENABLED' }] }) };
                    }
                    if (name === 'productlistings') {
                        return {
                            find: (q, opts) => {
                                productlistingQueries.push({ q, opts });
                                return { toArray: async () => [{ asin: 'B0MOCK1234', itemName: 'Mock Product', imageURL: 'https://img2.jpg', sku: 'TEST-SKU' }] };
                            }
                        };
                    }
                    return { find: () => ({ toArray: async () => [] }) };
                }
            }
        },
        write_logs: () => {},
    };
    vm.runInNewContext(handlerSource, context);
    const req = {
        body: { profileId: 12345, pageNo: 1, perPage: 10, fromDate: '2026-10-01', toDate: '2026-10-26' },
        models: { adTypeSearchTermSchema, adTypeTargetingSchema },
        adType: 'SP',
    };
    const res = {
        status(code) { this.code = code; return this; },
        send(data) { this.data = data; return this; },
    };
    await context.exports.getSearchTermsProductView(req, res);
    assert.equal(res.code, 200);
    assert.equal(res.data.isSuccess, true);
    assert.equal(res.data.totalRecords, 1);
    assert.equal(res.data.products.length, 1);
    const prod = res.data.products[0];
    assert.equal(prod.productName, 'Mock Product');
    assert.equal(prod.imageUrl, 'https://img2.jpg');
    assert.equal(prod.campaigns[0].campaignName, 'Campaign 101');
    assert.equal(prod.campaigns[0].campaignStatus, 'ENABLED');
    assert.equal(prod.campaigns[0].searchTerms[0].existTargeting.isExist, true);

    // Verify pipeline stages: no lookup to campaigns or productlistings inside aggregation
    const pipeline = pipelines[0];
    const lookups = pipeline.filter(s => s.$lookup).map(s => s.$lookup.from);
    assert.ok(!lookups.includes('campaigns'), 'Aggregation must not contain $lookup to campaigns');
    assert.ok(!lookups.includes('productlistings'), 'Aggregation must not contain $lookup to productlistings');
    assert.ok(lookups.includes('productads'), 'Aggregation retains productads lookup');
});
