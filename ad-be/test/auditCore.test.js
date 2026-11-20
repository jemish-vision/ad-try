'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Audit = require('../api-server/models/auditLog.model');
const catalog = require('../api-server/constants/auditEvents');
const realScope = require('../api-server/helpers/auditScope');
const userId = '111111111111111111111111';
const orgId = '222222222222222222222222';
const otherOrg = '333333333333333333333333';
const configId = '444444444444444444444444';
const otherUser = '555555555555555555555555';

function runModule(file, mocks) {
  const mod = { exports: {} };
  const context = { module: mod, exports: mod.exports, Set, Map, WeakSet, WeakMap, Date, console: { error: (...args) => mocks.errors?.push(args) }, require: name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected require ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api-server', file), 'utf8'), context);
  return mod.exports;
}
function helper({ access, target, fail } = {}) {
  const writes = [], errors = [], batches = [];
  let lookups = 0;
  class Model { constructor(entry) { this.entry = entry; this._id = 'audit-id'; } async save() { if (fail) throw new Error('raw-password-secret'); writes.push(this.entry); } }
  Model.insertMany = async (entries, options) => { if (fail) throw new Error('raw-password-secret'); batches.push({ entries, options }); };
  const model = { findOne: () => { lookups++; return { select: () => ({ lean: async () => target }) }; } };
  return {
    api: runModule('helpers/auditHelper.js', {
      'node:async_hooks': require('node:async_hooks'), '../models/auditLog.model': Model,
      '../constants/auditEvents': catalog,
      './auditScope': { validId: realScope.validId, getAuditAccess: access || (async req => ({ allowed: true, userId: req.user._id, organizationId: req.organizationId || null })) },
      '../models/config.model': model, '../models/sellerConfig.model': model, errors,
    }), writes, errors, batches, lookupCount: () => lookups,
  };
}

test('five previously rejected events and every route catalog event validate', async () => {
  const required = ['CONFIRM_DEACTIVATE_PROFILE', 'DATA_DELETION_PROCESS_TOGGLE', 'PROFILE_DATA_DELETION_TOGGLE', 'RECOMMENDATION_RULE_BULK_DATE_FILTER_UPDATE', 'RECOMMENDATION_RULE_COPY_TO_PROFILES'];
  for (const event of required) assert(catalog.events.includes(event));
  for (const event of catalog.events) await new Audit({ event, userId, actorType: 'user', organizationId: orgId }).validate();
  assert.equal(new Set(catalog.events).size, catalog.events.length);
  assert.equal(catalog.catalog.length, catalog.events.length);
});

test('system/integration/anonymous actors permit missing users; user actor requires one', async () => {
  for (const actorType of ['system', 'integration', 'anonymous']) await new Audit({ event: 'USER_LOGIN', actorType }).validate();
  await assert.rejects(new Audit({ event: 'USER_LOGIN', actorType: 'user' }).validate());
  const legacy = new Audit({ event: 'CONFIG_DISCONNECT' });
  await legacy.validate();
  assert.equal(legacy.actorType, 'system');
});

test('model rejects unknown events and malformed high-value fields', async () => {
  for (const fields of [{ event: 'NOT_REGISTERED' }, { actorType: 'admin' }, { outcome: 'UNKNOWN' }, { profileId: 'not-an-amazon-profile' }, { resourceId: 'x'.repeat(201) }]) {
    await assert.rejects(new Audit({ event: 'USER_LOGIN', actorType: 'system', ...fields }).validate());
  }
});

test('recursive sanitization removes sensitive fields and preserves IDs and zero/null/false diffs', async () => {
  const { api, writes } = helper();
  const metadata = { configLabel: 'safe', userId, password: 'bad', state: 'raw-oauth', nested: { push_token: 'bad', spRefreshToken: 'bad', otp: '123', clientSecret: 'bad', state: 'PAUSED', count: 0, enabled: false, unset: null }, old: [{ rawState: 'bad', profileId: '123' }] };
  const result = await api.writeAuditEvent({ event: 'USER_LOGIN', userId, metadata, previousValue: null, newValue: { amount: 0, enabled: false } });
  assert.equal(result.success, true);
  const row = JSON.parse(JSON.stringify(writes[0]));
  assert.deepEqual(row.metadata, { configLabel: 'safe', userId, nested: { state: 'PAUSED', count: 0, enabled: false, unset: null }, old: [{ profileId: '123' }] });
  assert.equal(row.previousValue, null);
  assert.deepEqual(row.newValue, { amount: 0, enabled: false });
});

test('direct model writes are sanitized before validation', async () => {
  const doc = new Audit({ event: 'USER_LOGIN', userId, metadata: { deviceToken: 'bad', nested: { password: 'bad', userId } } });
  await doc.validate();
  assert.equal(doc.metadata.deviceToken, undefined);
  assert.deepEqual(doc.metadata.nested, { userId });
});

test('ALS legacy writer observes server actor/request context, promotes diff, and marks successful event', async () => {
  const { api, writes } = helper();
  const req = { user: { _id: userId }, organizationId: orgId, ip: '127.0.0.9', headers: { 'user-agent': 'Fixture browser' }, auditOperationId: 'operation-1' };
  await api.runWithAuditRequest(req, () => api.logAudit('USER_LOGIN', 'Login', { ipAddress: 'spoofed', previousValue: { count: 0 }, newValue: { count: 1 }, resourceType: 'user', resourceId: userId }, otherUser));
  assert.equal(writes[0].userId, userId);
  assert.equal(writes[0].organizationId, orgId);
  assert.equal(writes[0].ipAddress, '127.0.0.9');
  assert.equal(writes[0].userAgent, 'Fixture browser');
  assert.equal(writes[0].operationId, 'operation-1');
  assert.equal(writes[0].resourceId, userId);
  assert.equal(writes[0].previousValue.count, 0);
  assert(req.auditEvents.has('USER_LOGIN'));
});

test('ALS isolates concurrent requests and never borrows a different actor', async () => {
  const { api, writes } = helper();
  await Promise.all([userId, otherUser].map(id => api.runWithAuditRequest({ user: { _id: id } }, async () => {
    await new Promise(resolve => setImmediate(resolve));
    return api.logAudit('USER_LOGIN', id, {}, userId);
  })));
  assert.deepEqual(writes.map(row => row.userId).sort(), [userId, otherUser].sort());
});

test('OAuth callback resolved actor is retained without trusting body-supplied IP', async () => {
  const { api, writes } = helper();
  await api.writeAuditEvent({ event: 'USER_LOGIN', userId, req: { ip: '127.0.0.8', body: { ipAddress: 'spoofed' } } });
  assert.equal(writes[0].userId, userId);
  assert.equal(writes[0].ipAddress, '127.0.0.8');
});

test('mismatched stored target tenant fails safely without raw errors or duplicate suppression', async () => {
  const { api, errors, writes } = helper({ target: { _id: configId, organizationId: otherOrg } });
  const req = { user: { _id: userId }, organizationId: orgId };
  const result = await api.writeAuditEvent({ event: 'CONFIG_CONNECT', req, configId });
  assert.equal(result.success, false); assert.equal(writes.length, 0);
  assert.equal(req.auditEvents, undefined);
  assert.equal(errors[0][1].code, 'AUDIT_WRITE_FAILED');
});

test('explicit destination organization uses independently verified access and does not inherit old config/profile', async () => {
  let checkedOrganization;
  const { api, writes, lookupCount } = helper({ access: async (req, id) => { checkedOrganization = id; return { allowed: true, organizationId: id, userId }; } });
  await api.writeAuditEvent({ event: 'ORGANIZATION_SELECTED', userId, organizationId: otherOrg,
    req: { user: { _id: userId }, organizationId: orgId, config: { configId, profileId: '999' } } });
  assert.equal(checkedOrganization, otherOrg);
  assert.equal(writes[0].organizationId, otherOrg);
  assert.equal(writes[0].configId, undefined);
  assert.equal(writes[0].profileId, undefined);
  assert.equal(lookupCount(), 0);
});

test('system cleanup retains trusted deleted-resource IDs and recognized failure outcome', async () => {
  const { api, writes } = helper({ target: null });
  await api.writeAuditEvent({ event: 'CONFIG_DISCONNECT', actorType: 'system', configId, organizationId: orgId, metadata: { status: 'FAILED' } });
  assert.equal(writes[0].configId, configId);
  assert.equal(writes[0].organizationId, orgId);
  assert.equal(writes[0].outcome, 'FAILURE');
  assert.equal(writes[0].userId, undefined);
});

test('batch caches shared stored target lookup, retains unordered awaited insert, strips secrets', async () => {
  const { api, batches, lookupCount } = helper({ target: { _id: configId, organizationId: orgId } });
  await api.logAuditBatch(Array.from({ length: 100 }, (_, i) => ({ event: 'RECOMMENDATION_DISMISSED', actorType: 'system', configId, metadata: { count: i, password: 'secret' } })));
  assert.equal(lookupCount(), 1); assert.equal(batches.length, 1);
  assert.equal(batches[0].entries.length, 100); assert.equal(batches[0].options.ordered, false);
  assert.equal(batches[0].entries[0].metadata.count, 0);
  assert.equal(batches[0].entries[0].metadata.password, undefined);
});

function scope({ owner = otherUser, member = true, role = 'MEMBER', roleOrg = orgId } = {}) {
  const lean = value => ({ select: () => ({ lean: async () => value }) });
  return runModule('helpers/auditScope.js', {
    '../models/organization.model': { findOne: () => lean({ _id: orgId, userId: owner }) },
    '../models/roleBasedPermission.model': { findOne: () => lean(member ? { roleId: 'role' } : null) },
    '../models/superAdmin/role.model': { findOne: () => lean({ roleName: role, organizationId: roleOrg }) },
  });
}

test('organization visibility verifies ownership or organization membership and admin role', async () => {
  assert.equal((await scope({ owner: userId }).getAuditAccess({ user: { _id: userId } }, orgId)).canViewOrganization, true);
  assert.equal((await scope({ member: false }).getAuditAccess({ user: { _id: userId }, role: { roleName: 'ADMIN' } }, orgId)).allowed, false);
  assert.equal((await scope({ role: 'ADMIN' }).getAuditAccess({ user: { _id: userId } }, orgId)).canViewOrganization, true);
  assert.equal((await scope({ role: 'ADMIN', roleOrg: otherOrg }).getAuditAccess({ user: { _id: userId } }, orgId)).canViewOrganization, false);
  assert.equal((await scope().getAuditAccess({ user: { _id: userId } }, orgId)).canViewOrganization, false);
});

function controller(access = { allowed: true, userId, organizationId: orgId, canViewOrganization: false }) {
  const pipelines = [], logs = [];
  const api = runModule('controllers/auditLog.controller.js', {
    mongoose, '../../winston/utility/logger': { write_logs: entry => logs.push(entry) },
    '../models/auditLog.model': { aggregate: async pipeline => { pipelines.push(pipeline); return [{ data: [{ event: 'USER_LOGIN', metadata: { password: 'bad', userId }, organizationId: new mongoose.Types.ObjectId(orgId) }], totalCount: [{ count: 1 }] }]; } },
    '../constants/auditEvents': catalog, '../helpers/auditScope': { validId: realScope.validId, getAuditAccess: async () => access },
    '../helpers/auditHelper': { sanitizeAuditValue: require('../api-server/helpers/auditHelper').sanitizeAuditValue },
  });
  const call = async body => {
    let status, data;
    const res = { status(code) { status = code; return this; }, json(value) { data = value; return this; } };
    await api.getAuditLog({ user: { _id: userId }, organizationId: access.organizationId, body }, res);
    return { status, data };
  };
  return { call, pipelines, api, logs };
}

test('mine is constrained to exact user and organization; legacy missing tenant is not inferred', async () => {
  const { call, pipelines } = controller();
  const result = await call({ search: 'a.*[b]' });
  assert.equal(result.status, 200); assert.equal(result.data.canViewOrganization, false);
  assert.equal(String(pipelines[0][0].$match.userId), userId);
  assert.equal(String(pipelines[0][0].$match.organizationId), orgId);
  assert.equal(pipelines[0][0].$match.$or[0].message.$regex.source, 'a\\.\\*\\[b\\]');
  assert.equal(result.data.data[0].metadata.password, undefined);
});

test('ordinary members cannot read teammates or organization history, even via actorId alias', async () => {
  const { call, pipelines } = controller();
  for (const body of [{ scope: 'organization' }, { userId: otherUser }, { actorId: otherUser }, { organizationId: otherOrg }]) assert.equal((await call(body)).status, 403);
  assert.equal(pipelines.length, 0);
});

test('authorized org admin can filter actor/outcome without escaping tenant', async () => {
  const { call, pipelines } = controller({ allowed: true, userId, organizationId: orgId, canViewOrganization: true });
  assert.equal((await call({ scope: 'organization', actorId: otherUser, outcome: 'failure', profileId: '123' })).status, 200);
  assert.equal(String(pipelines[0][0].$match.organizationId), orgId);
  assert.equal(String(pipelines[0][0].$match.userId), otherUser);
  assert.equal(pipelines[0][0].$match.outcome.$in[0], 'FAILURE');
});

test('legacy no-organization view stays actor-only and rejects organization scope', async () => {
  const { call, pipelines } = controller({ allowed: true, userId, organizationId: null, canViewOrganization: false });
  assert.equal((await call({})).status, 200);
  assert.equal(pipelines[0][0].$match.organizationId, null);
  assert.equal(String(pipelines[0][0].$match.userId), userId);
  assert.equal((await call({ scope: 'organization' })).status, 403);
});

test('API validates pagination, dates, IDs, enum fields and oversized search before query', async () => {
  const { call, pipelines } = controller();
  for (const body of [{ pageNo: 0 }, { perPage: 0 }, { perPage: 201 }, { pageNo: 1.2 }, { userId: 'bad' }, { actorId: 'bad' }, { fromDate: '2026-02-30' }, { fromDate: '2026-11-20', toDate: '2026-11-19' }, { event: ['UNKNOWN'] }, { outcome: 'UNKNOWN' }, { actorType: 'ADMIN' }, { search: 'x'.repeat(201) }, { profileId: '123x' }]) assert.equal((await call(body)).status, 400, JSON.stringify(body));
  assert.equal(pipelines.length, 0);
});

test('event filter endpoint exposes shared complete labeled catalog', () => {
  const { api } = controller(); let response;
  api.getAuditEvents({}, { status: () => ({ json: value => { response = value; } }) });
  assert.equal(response.isSuccess, true); assert.equal(response.data.length, catalog.events.length);
  assert(response.data.every(row => row.event && row.label && row.category));
});
