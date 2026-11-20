const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const configSource = fs.readFileSync(require.resolve('../../api-server/controllers/config.controller'), 'utf8');
function exportHandler(source, name, dependencies) {
  const start = source.indexOf(`exports.${name} =`);
  const end = source.indexOf('\nexports.', start + 1);
  const context = { exports: {}, ...dependencies };
  vm.runInNewContext(source.slice(start, end < 0 ? undefined : end), context);
  return context.exports[name];
}
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, redirect(url) { this.url = url; } });
function sellerFixture({ reconnect = false, tokenFailure = false, cacheFailure = false, delivery = true, mismatch = false } = {}) {
  const events = [];
  const saved = { _id: 'seller-config', save: async () => {} };
  const auth = { _id: 'oauth-record', type: 'SP', userId: 'user', organizationId: 'org', configId: 'ads-config', profileId: 7, sellerId: 'merchant', expiresAt: new Date(Date.now() + 60000) };
  const scope = { process: { env: { BASE_URL: 'https://api.test', FRONTEND_REDIRECT_URL: 'https://app.test' } }, URLSearchParams,
    tempStateConfigSchema: { findOne: async () => auth, updateOne: async () => ({ modifiedCount: 1 }), deleteOne: async () => ({ deletedCount: 1 }) },
    profileSchema: { findOne: () => ({ lean: async () => ({ advertiserId: mismatch ? 'other' : 'merchant' }) }) },
    configSchema: { findById: () => ({ lean: async () => ({ organizationId: 'org', isActive: true }) }) },
    sellerConfigSchema: { findOne: () => ({ sort: async () => reconnect ? saved : null }), create: async () => saved },
    sellerOwnerScope: (organizationId, userId) => ({ organizationId, userId }), sameSeller: (a,b) => a === b,
    axios: { post: async () => { if (tokenFailure) throw new Error('upstream secret'); return { data: { access_token: 'secret-access', refresh_token: 'secret-refresh', expires_in: 3600 } }; } },
    clearSPAccessTokenCache: async () => { if (cacheFailure) throw new Error('cache failure'); }, seedAccessToken: async () => {}, resumeApprovedSellerSync: async () => {},
    notifyNewSellerConnection: async () => ({ delivered: delivery }), write_logs() {}, writeAuditEvent: async event => events.push(event)
  };
  const start = configSource.indexOf('async function completeProfileSellerOAuth(');
  const end = configSource.indexOf('exports.amazonSPRefreshToken', start);
  const handler = vm.runInNewContext(configSource.slice(start, end) + '\ncompleteProfileSellerOAuth', scope);
  return { handler, events, saved, req: { query: { code: 'authorization-secret', state: 'state-secret', selling_partner_id: 'merchant' }, ip: '127.0.0.1', headers: {} } };
}
for (const reconnect of [false, true]) test(`profile Seller ${reconnect ? 'reconnect' : 'connect'} logs exact scope without credentials`, async () => {
  const { handler, events, req } = sellerFixture({ reconnect }); const res = response();
  await handler(req, res, 'amazonSPCallback');
  assert.match(res.url, /status=success/); assert.equal(events.length, 1);
  const { req: ignored, ...event } = events[0];
  assert.equal(event.event, reconnect ? 'SELLER_CONFIG_RECONNECT' : 'SELLER_CONFIG_CONNECT');
  assert.equal(event.profileId, 7); assert.equal(event.sellerConfigId, 'seller-config'); assert.equal(event.organizationId, 'org');
  assert.doesNotMatch(JSON.stringify(event), /secret-access|secret-refresh|authorization-secret|state-secret/);
});
test('saved Seller connection reports success despite failed post-connect cache or notification', async () => {
  for (const options of [{ cacheFailure: true }, { delivery: false }]) {
    const { handler, events, req, saved } = sellerFixture(options); const res = response();
    await handler(req, res, 'amazonSPCallback'); assert.match(res.url, /status=success/);
    assert.equal(events[0].outcome, 'SUCCESS'); assert.equal(events[0].metadata.postConnectFailures, 1);
    if (options.delivery === false) assert.equal(saved.newConnectionEmailSentAt, undefined);
  }
});
test('Seller profile mismatch and failed token exchange produce scoped failure, never success', async () => {
  for (const options of [{ mismatch: true }, { tokenFailure: true }]) {
    const { handler, events, req } = sellerFixture(options); const res = response();
    await handler(req, res, 'amazonSPCallback'); assert.match(res.url, /status=error/);
    assert.equal(events.length, 1); assert.equal(events[0].event, 'SELLER_CONFIG_CONNECT_FAILED'); assert.equal(events[0].outcome, 'FAILED');
    assert.equal(events[0].profileId, 7); assert.doesNotMatch(JSON.stringify(events[0].metadata), /secret/);
  }
});
test('logout records deletion scope without push token', async () => {
  const source = fs.readFileSync(require.resolve('../../api-server/controllers/device.controller'), 'utf8');
  const events = [], context = { module: { exports: {} }, require(name) {
    if (name.includes('auditHelper')) return { writeAuditEvent: async event => events.push(event) };
    if (name.includes('deviceToken')) return { deleteMany: async () => ({ deletedCount: 1 }) };
    if (name.includes('logger')) return { write_logs() {} }; throw new Error(name);
  } };
  vm.runInNewContext(source, context);
  const req = { user: { _id: 'user' }, body: { deviceToken: 'private-push-token' }, headers: {}, ip: '127.0.0.1' };
  const res = response(); await context.module.exports.deleteToken(req, res);
  assert.equal(res.code, 200); assert.equal(events[0].event, 'USER_LOGOUT');
  assert.equal(events[0].metadata.scope, 'CURRENT_DEVICE'); assert.doesNotMatch(JSON.stringify(events[0].metadata), /private-push-token|deviceToken/);
});
test('login uses server-observed IP for session creation and audit context', async () => {
  const source = fs.readFileSync(require.resolve('../../api-server/controllers/customer.controller'), 'utf8');
  const events = [], sessionIps = [];
  const user = { _id: 'user', email: 'user@example.test', password: 'hash', isActive: true, isVerify: true, roleId: { roleName: 'ADMIN' } };
  const query = { select() { return this; }, lean() { return this; }, populate: async () => user };
  const login = exportHandler(source, 'login', {
    userSchema: { findOne: () => query }, bcrypt: { compare: async () => true },
    generateAuthToken: async (id, ip) => { sessionIps.push(ip); return { authToken: 'session-token' }; },
    googleconfigSchema: { findOne: () => ({ lean: async () => null }) },
    writeAuditEvent: async event => events.push(event), write_logs() {}
  });
  const req = { body: { email: user.email, password: 'password', ip_address: 'spoofed-ip' }, ip: '10.0.0.5', headers: {} };
  const res = response(); await login(req, res);
  assert.equal(res.code, 200); assert.deepEqual(sessionIps, ['10.0.0.5']); assert.equal(events[0].req.ip, '10.0.0.5');
  assert.equal(events[0].ipAddress, '10.0.0.5'); assert.doesNotMatch(JSON.stringify(events[0].metadata), /password|spoofed/);
});
test('Seller notification records system actor and truthful email delivery outcome', async () => {
  for (const delivered of [true, false]) {
    const source = fs.readFileSync(require.resolve('../../api-server/helper/sellerNotification.helper'), 'utf8');
    const events = [], context = { module: { exports: {} }, process: { env: {} }, require(name) {
      if (name.includes('auditHelper')) return { writeAuditEvent: async event => events.push(event) };
      if (name.includes('emailHelper')) return { sendEmailHelper: async () => ({ delivered, status: delivered ? 'Success' : 'Fail' }) };
      if (name.includes('buildNewSellerConnectionEmail')) return { buildNewSellerConnectionEmail: () => '<html />' };
      if (name.includes('logger')) return { write_logs() {} };
      return {};
    } };
    vm.runInNewContext(source, context);
    await context.module.exports.notifyNewSellerConnection({ sellerId: 'merchant', profiles: [{ profileId: 7 }] });
    assert.equal(events.length, 1); assert.equal(events[0].actorType, 'system');
    assert.equal(events[0].outcome, delivered ? 'SUCCESS' : 'FAILED'); assert.equal(events[0].userId, undefined);
  }
});
test('cleanup records completed and partial actual deletion outcomes without pretending to be a user', async () => {
  for (const failCollection of [false, true]) {
    const source = fs.readFileSync(require.resolve('../../api-server/services/accountDataCleanup.service'), 'utf8');
    const events = []; let successfulDeleted = 0;
    const moment = require('moment-timezone');
    function model(name) {
      const Model = function() { this._id = 'cron'; this.save = async () => {}; };
      Model.find = () => ({ lean: async () => name.endsWith('/config.model') ? [{ _id: 'ads', organizationId: 'org' }]
        : name.endsWith('/sellerConfig.model') ? [{ _id: 'seller', configId: 'ads', profileId: 7, organizationId: 'org' }] : [] });
      Model.findById = () => ({ lean: async () => null });
      Model.findOne = () => ({ lean: async () => null });
      Model.findByIdAndUpdate = async () => {};
      Model.deleteMany = async () => {
        if (failCollection && name.endsWith('/campaign.model')) throw new Error('controlled collection failure');
        successfulDeleted++; return { deletedCount: 1 };
      };
      Model.deleteOne = async () => { successfulDeleted++; return { deletedCount: 1 }; };
      return Model;
    }
    const context = { exports: {}, require(name) {
      if (name === 'moment-timezone') return moment;
      if (name.includes('auditHelper')) return { writeAuditEvent: async event => events.push(event) };
      if (name.includes('logger')) return { cron_logs() {} };
      if (name.includes('emailHelper')) return { sendEmailHelper: async () => ({ delivered: true }) };
      if (name.includes('buildDataDeletedEmail')) return { buildDataDeletedEmail: () => '' };
      if (name.includes('reportCleanup')) return { cronDeleteOldReportFiles: async () => {} };
      return model(name);
    } };
    vm.runInNewContext(source, context); await context.exports.cronDeleteExpiredAccountsData();
    assert.equal(events.length, 2); assert.equal(events[0].actorType, 'system'); assert.equal(events[0].event, 'ACCOUNT_DATA_CLEANUP');
    assert.equal(events[0].outcome, failCollection ? 'PARTIAL' : 'SUCCESS'); assert.equal(events[1].outcome, 'SUCCESS');
    assert.equal(events.reduce((sum,event) => sum + event.metadata.deletedCount, 0), successfulDeleted);
    if (failCollection) assert.deepEqual(Array.from(events[0].metadata.failedCollections), ['campaigns']);
  }
});
test('Seller refresh audits successful persistence and upstream rejection without credentials', async () => {
  for (const rejects of [false, true]) {
    const events = [];
    const handler = exportHandler(configSource, 'amazonSPRefreshToken', {
      mongoose: { isValidObjectId: () => true }, ROLES: { SUPER_ADMIN: 'SUPER_ADMIN' },
      configSchema: { findById: () => ({ lean: async () => ({ organizationId: 'org' }) }) }, canManageAdsConfig: () => true,
      profileSchema: { findOne: () => ({ lean: async () => ({ advertiserId: 'merchant' }) }) }, sellerOwnerScope: () => ({ organizationId: 'org' }),
      sellerConfigSchema: { findOne: () => ({ sort: async () => ({ _id: 'seller', spRefreshToken: 'refresh-private', spClientId: 'client', spClientSecret: 'secret-private' }) }), updateOne: async () => ({ matchedCount: 1 }) },
      axios: { post: async () => { if (rejects) { const e = new Error('private upstream response'); e.response = { status: 401 }; throw e; } return { data: { access_token: 'access-private', expires_in: 3600 } }; } },
      URLSearchParams, process: { env: {} }, write_logs() {}, seedAccessToken: async () => {}, writeAuditEvent: async event => events.push(event)
    });
    const req = { body: { configId: 'ads', profileId: 7 }, user: { _id: 'user' }, role: { roleName: 'SUPER_ADMIN' } };
    const res = response(); await handler(req, res);
    assert.equal(res.code, rejects ? 400 : 200); assert.equal(events.length, 1);
    assert.equal(events[0].event, 'SELLER_CREDENTIAL_REFRESH'); assert.equal(events[0].profileId, 7); assert.equal(events[0].sellerConfigId, 'seller');
    assert.equal(events[0].outcome || 'SUCCESS', rejects ? 'FAILED' : 'SUCCESS');
    assert.doesNotMatch(JSON.stringify(events[0].metadata), /private|secret|token/i);
  }
});
test('profile deletion toggle distinguishes an applied target from a missing record', async () => {
  const source = fs.readFileSync(require.resolve('../../api-server/controllers/organization.controller'), 'utf8');
  for (const matchedCount of [0, 1]) {
    const events = [];
    const handler = exportHandler(source, 'toggleProfileDataDeletionBySuperAdmin', {
      profileSchema: { updateOne: async () => ({ matchedCount }) },
      sellerConfigSchema: { updateOne: async () => ({ matchedCount }) },
      writeAuditEvent: async event => events.push(event), write_logs() {}
    });
    const req = { headers: {}, ip: '127.0.0.1', user: { _id: 'admin' }, body: { organizationId: 'org', profileId: 7, configId: 'ads', isDataDeletionStopped: true } };
    const res = response(); res.send = res.json; await handler(req, res);
    assert.equal(res.code, 200); assert.equal(events[0].outcome, matchedCount ? 'SUCCESS' : 'DENIED');
    assert.equal(events[0].metadata.updates[0].profileId, 7); assert.equal(events[0].metadata.updates[0].isDataDeletionStopped, true);
  }
});
