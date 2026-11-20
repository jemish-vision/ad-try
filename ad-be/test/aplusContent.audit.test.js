'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const configId = '444444444444444444444444';
const profile = { configId, profileId: 123, marketplaceStringId: 'market', timezone: 'Asia/Kolkata' };

test('existing A+ model accepts the submitted status', async () => {
  const Content = require('../api-server/models/asinAPlusContent.model');
  await new Content({ configId, profileId: 123, marketplaceId: 'market', asin: 'B0FIXTURE', contentReferenceKey: 'content-1', contentStatus: 'SUBMITTED' }).validate();
});

function fixture({ initialStatus = 'SUBMITTED', importedStatus = 'APPROVED', providerStatus = 202, providerError, localError = false } = {}) {
  let status = initialStatus;
  const events = [], writes = [], logs = [];
  const marketplace = { marketPlaceId: 'market', endPoint: 'https://fixture.amazon.invalid' };
  const contentModel = {
    findOneAndUpdate: (filter, update) => {
      assert.equal(filter.configId, configId); assert.equal(filter.profileId, 123);
      const previous = status && status !== filter.contentStatus.$ne ? { _id: 'stored-row', contentStatus: status } : null;
      if (previous) status = update.$set.contentStatus;
      return { select: () => ({ lean: async () => previous }) };
    },
    find: () => ({ select: () => ({ lean: async () => status ? [{ contentStatus: status }] : [] }) }),
    updateMany: async (filter, update) => { if (localError) throw new Error('sensitive failure'); writes.push({ filter, update }); status = update.$set.contentStatus; },
    deleteMany: async () => {},
  };
  const amazon = async request => {
    if (request.method === 'post') {
      if (providerError) throw { response: { status: providerError, data: { errors: [{ message: 'Provider rejected' }] } } };
      return { status: providerStatus, headers: { 'x-amzn-requestid': 'safe-provider-id' }, data: { warnings: [] } };
    }
    if (request.url.includes('contentDocuments?')) return { status: 200, data: { contentMetadataRecords: [{ contentReferenceKey: 'content-1', contentMetadata: { status: importedStatus } }] } };
    return { status: 200, data: { publishRecordList: [{ contentReferenceKey: 'content-1', marketplaceId: 'market', locale: 'en_IN', asin: 'B0FIXTURE' }] } };
  };
  const common = {
    getActivePlanProfiles: async () => [profile], getAllowedSyncProfiles: async () => [{ configId, profileId: 123 }],
    getSPAccessToken: async () => ({ spAccessToken: 'never-audit-this' }), getProfile: async () => profile,
    parallelBulkWrite: async (_model, operations) => { for (const operation of operations) status = operation.updateOne.update.$set.contentStatus; },
  };
  const mod = { exports: {} };
  const mocks = {
    moment: require('moment-timezone'), 'p-limit': { default: () => task => task() },
    '../helper/retryHelper': { retryWithBackoff: task => task() },
    '../models/productListing.model': { aggregate: async () => [{ asin: 'B0FIXTURE' }] },
    '../models/asinAPlusContent.model': contentModel,
    '../models/marketPlaceConfig.model': { findOne: () => ({ lean: async () => marketplace }) },
    '../../winston/cronAutomation/logger': { cron_logs: () => {} },
    '../../winston/utility/logger': { write_logs: item => logs.push(item) },
    '../helper/common': common, '../helper/amazonAxios': amazon,
    '../helpers/auditHelper': { writeAuditEvent: async entry => events.push(entry) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server/controllers/aplusContent.controller.js'), 'utf8'), {
    module: mod, exports: mod.exports, require: name => mocks[name] || {}, process: { env: {} }, global: {},
    setTimeout: callback => callback(), console,
  });
  const submit = async () => {
    const req = { body: { profileId: 123, contentReferenceKey: 'content-1' }, config: { configId } };
    let response;
    const res = { status(code) { this.code = code; return this; }, json(data) { response = { code: this.code, ...data }; return this; } };
    await mod.exports.submitAPlusContentForApproval(req, res);
    return { req, response };
  };
  return { api: mod.exports, events, writes, logs, submit, currentStatus: () => status };
}

test('import audits an existing Amazon approval transition with scoped safe before/after fields', async () => {
  const f = fixture(); await f.api.cronFetchAPlusContentFromAmazon();
  assert.equal(f.events.length, 1);
  const event = f.events[0];
  assert.equal(event.event, 'APLUS_APPROVAL_STATUS_CHANGED');
  assert.equal(event.actorType, 'system'); assert.equal(event.configId, configId); assert.equal(event.profileId, 123);
  assert.equal(event.resourceId, 'content-1');
  assert.equal(event.previousValue.contentStatus, 'SUBMITTED'); assert.equal(event.newValue.contentStatus, 'APPROVED');
  assert.equal(JSON.stringify(event).includes('never-audit-this'), false);
  assert.equal(f.currentStatus(), 'APPROVED');
});

test('unchanged polling and first import baselines do not emit approval changes', async () => {
  for (const initialStatus of ['APPROVED', null]) {
    const f = fixture({ initialStatus }); await f.api.cronFetchAPlusContentFromAmazon();
    assert.equal(f.events.length, 0); assert.equal(f.currentStatus(), 'APPROVED');
  }
});

test('repeat and overlapping import runs claim an approval change only once', async () => {
  const f = fixture();
  await Promise.all([f.api.cronFetchAPlusContentFromAmazon(), f.api.cronFetchAPlusContentFromAmazon()]);
  await f.api.cronFetchAPlusContentFromAmazon();
  assert.equal(f.events.length, 1);
});

test('accepted submission records pending request result and SUBMITTED, not approval', async () => {
  const f = fixture({ initialStatus: 'DRAFT' }); const { req, response } = await f.submit();
  assert.equal(response.isSuccess, true); assert.equal(f.currentStatus(), 'SUBMITTED');
  assert.equal(req.auditChange.outcome, 'PENDING'); assert.equal(req.auditChange.resourceId, 'content-1');
  assert.equal(req.auditChange.configId, configId); assert.equal(req.auditChange.profileId, 123);
  assert.equal(req.auditChange.previousValue.contentStatuses[0], 'DRAFT');
  assert.equal(req.auditChange.newValue.contentStatus, 'SUBMITTED');
  assert.equal(req.auditChange.metadata.providerStatus, 202);
  assert.equal(req.auditChange.metadata.providerRequestId, 'safe-provider-id');
  assert.equal(JSON.stringify(req.auditChange).includes('never-audit-this'), false);
});

test('provider HTTP rejection and thrown rejection never set submitted or approved', async () => {
  for (const options of [{ providerStatus: 400 }, { providerError: 403 }]) {
    const f = fixture({ initialStatus: 'DRAFT', ...options }); const { req, response } = await f.submit();
    assert.equal(response.isSuccess, false); assert.equal(f.writes.length, 0); assert.equal(f.currentStatus(), 'DRAFT');
    assert.equal(req.auditChange.outcome, 'FAILURE'); assert.equal(req.auditChange.newValue, undefined);
  }
});

test('provider acceptance followed by local failure remains a partial result with safe diagnostics', async () => {
  const f = fixture({ initialStatus: 'DRAFT', localError: true }); const { req, response } = await f.submit();
  assert.equal(response.isSuccess, false); assert.equal(req.auditChange.outcome, 'PARTIAL');
  assert.equal(req.auditChange.metadata.providerAccepted, true); assert.equal(req.auditChange.metadata.providerStatus, 202);
  assert.equal(req.auditChange.newValue.approvalSubmission, 'ACCEPTED');
  assert.equal(JSON.stringify(f.logs).includes('sensitive failure'), false);
});
