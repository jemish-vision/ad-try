'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { createReportService } = require('../api-server/services/chatbotReporting.handlers');

const HEX24 = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-22T18:00:00Z');
const OID = new Types.ObjectId(HEX24);

const SCOPE = {
  configId: HEX24,
  profiles: [{
    profileId: '1001', timezone: 'America/Los_Angeles', currencyCode: 'USD', accountType: 'seller',
    adTypes: ['SP'], attributionWindows: { SP: 7 },
    supportedDimensions: { SP: ['profile', 'campaign', 'date', 'hour', 'weekday'] },
  }],
  currencyGroups: [{ currencyCode: 'USD', profileIds: ['1001'] }],
};

const campaigns = [{ configId: OID, profileId: 1001, name: 'A-2073-Men-Raincoat-Fri', campaignId: 777, reportDate: '2026-10-20' }];
const hourly = ['09', '14'].map(hh => ({
  configId: OID, profileId: 1001, type: 'SP', reportDate: '2026-10-20', startTime: `${hh}:00`,
  campaignId: 777, adGroupId: 22, keywordId: 5, placement: 'top',
  spends: 5, sales: 60, orders: 4, clicks: 25, impressions: 300, currency: 'USD', isHourlyAggregated: false,
  updatedAt: new Date(`2026-10-20T${hh}:30:00Z`),
}));

function match(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value._bsontype === 'ObjectId' || typeof value.toHexString === 'function') return String(row[key]) === String(value);
      if ('$in' in value) return value.$in.some(item => String(item) === String(row[key]));
      if ('$gte' in value || '$lte' in value) {
        const d = row[key];
        if (value.$gte && d < value.$gte) return false;
        if (value.$lte && d > value.$lte) return false;
        return true;
      }
    }
    return String(row[key]) === String(value);
  });
}

function fakeDb() {
  return { collection(name) {
    const all = name === 'campaigns' ? campaigns : (name === 'keywordshourlyperformances' ? hourly : []);
    return {
      find(filter = {}) {
        const out = all.filter(row => match(row, filter));
        return { limit() { return { toArray: async () => out }; }, sort() { return this; }, toArray: async () => out };
      },
      findOne: async (filter = {}) => all.find(row => match(row, filter)) || null,
      countDocuments: async () => all.length,
    };
  } };
}

function service() {
  return createReportService({
    db: fakeDb(), resolveScope: async () => SCOPE, checkReportPermission: async () => true,
    readKeywords: async () => ({ existingKeywords: new Set() }), now: () => NOW, makeReportId: () => 'rep_test',
  });
}

const AUTH = { userId: HEX24, configId: HEX24, organizationId: HEX24, currencyCode: 'USD', profileIds: ['1001'] };
const timeByCampaign = ids => ({
  schemaVersion: '1.0', category: 'time', adTypes: ['SP'], profileIds: ['1001'], comparison: { mode: 'none' },
  groupBy: ['hour', 'weekday'], filters: [], metrics: ['clicks', 'spend', 'cpc'], limit: 25, offset: 0,
  presentation: 'heatmap', period: { preset: 'last_7_days' }, sort: { field: 'clicks', direction: 'desc' },
  entity: { dimension: 'campaign', ids },
});

test('a campaign referenced by name resolves to its id and renders', async () => {
  const report = await service()(timeByCampaign(['A-2073-Men-Raincoat-Fri']), AUTH);
  assert.equal(report.status, 'partial');
  assert.ok(report.blocks.some(block => block.type === 'heatmap'), 'renders the heatmap');
});

test('an unknown campaign name fails with a clear, specific error', async () => {
  await assert.rejects(
    service()(timeByCampaign(['Totally-Made-Up-Campaign']), AUTH),
    error => error.code === 'CAMPAIGN_NOT_FOUND' && /Totally-Made-Up-Campaign/.test(error.message),
  );
});

test('a numeric campaign id passes through without a name lookup', async () => {
  const report = await service()(timeByCampaign(['777']), AUTH);
  assert.equal(report.status, 'partial');
  assert.ok(report.blocks.some(block => block.type === 'heatmap'));
});
