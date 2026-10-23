const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Types
} = require('mongoose');
const {
  resolveSummaryScope,
  checkCampaignReportPermission
} = require('../api-server/services/chatbotReporting.scope');
const {
  resolveReportScope,
  reportPermissionPages,
  checkReportPagePermission
} = require('../api-server/services/chatbotReporting.scope');
const oid = value => new Types.ObjectId(value);
const ids = {
  userId: '100000000000000000000001',
  configId: '200000000000000000000001',
  organizationId: '300000000000000000000001'
};
const request = () => ({
  schemaVersion: '1.0',
  category: 'summary',
  profileIds: ['1001'],
  adTypes: ['SP'],
  period: {
    preset: 'yesterday'
  },
  metrics: ['spend', 'sales', 'acos']
});

function setup() {
  const docs = {
    users: {
      _id: oid(ids.userId),
      isActive: true
    },
    configs: {
      _id: oid(ids.configId),
      organizationId: oid(ids.organizationId),
      isActive: true
    },
    organizations: {
      _id: oid(ids.organizationId)
    },
    profilebasedpermissions: {
      _id: oid('400000000000000000000001'),
      ...Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, oid(v)])),
      profileId: 1001,
      hasAccess: true
    },
    profiles: {
      configId: oid(ids.configId),
      profileId: 1001,
      isActive: true,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      type: 'vendor'
    }
  };
  const reads = [],
    pageCalls = [];
  const same = (a, b) => a?.toHexString ? a.toHexString() === b?.toHexString?.() : a === b;
  const db = {
    collection: name => ({
      findOne: async (query, options) => {
        reads.push({
          name,
          query,
          options
        });
        const doc = docs[name];

        if (!doc || !Object.entries(query).every(([key, value]) => same(doc[key], value))) {
          return null;
        }

        return Object.fromEntries(Object.entries(options.projection).filter(([, included]) => included === 1).map(([key]) => [key, doc[key]]));
      }
    })
  };
  const checkReportPermission = async (...args) => {
    pageCalls.push(args);

    return true;
  };

  return {
    docs,
    reads,
    pageCalls,
    db,
    checkReportPermission
  };
}

const denied = (statusCode, code) => error => error.statusCode === statusCode && (!code || error.code === code);

test('fresh tenant-scoped projected reads yield validated vendor scope without exposing credentials', async () => {
  const state = setup();
  const scope = await resolveSummaryScope(request(), ids, state);
  assert.equal(scope.configId, ids.configId);
  assert.deepEqual(scope.profiles[0], {
    profileId: '1001',
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    accountType: 'vendor',
    adTypes: ['SP'],
    attributionWindows: {
      SP: 14
    },
    supportedDimensions: {
      SP: ['profile', 'campaign', 'date']
    }
  });
  assert.deepEqual(scope.currencyGroups, [{
    currencyCode: 'INR',
    profileIds: ['1001']
  }]);
  assert.equal(state.reads.length, 5);

  for (const read of state.reads) {
    assert.equal(read.options.maxTimeMS, 5000);
    assert.ok(read.options.projection);
    assert.ok(!Object.keys(read.options.projection).some(k => /token|secret|password|role|email/i.test(k)));
  }

  const permission = state.reads.find(r => r.name === 'profilebasedpermissions').query;
  assert.deepEqual(Object.keys(permission).sort(), ['configId', 'hasAccess', 'organizationId', 'profileId', 'userId']);

  for (const key of Object.keys(ids)) {
    assert.equal(permission[key].toHexString(), ids[key]);
  }

  assert.equal(permission.profileId, 1001);
  assert.equal(permission.hasAccess, true);
  assert.deepEqual(state.reads.find(r => r.name === 'profiles').query, {
    configId: oid(ids.configId),
    profileId: 1001,
    isActive: true
  });
  assert.equal(state.pageCalls[0][1].toHexString(), ids.organizationId);
});

test('seller attribution and omitted context org use actual configuration organization', async () => {
  const state = setup();
  state.docs.profiles.type = 'seller';
  const scope = await resolveSummaryScope(request(), {
    userId: ids.userId,
    configId: ids.configId
  }, state);
  assert.equal(scope.profiles[0].attributionWindows.SP, 7);
  assert.equal(state.pageCalls[0][1].toHexString(), ids.organizationId);
});

test('revoked profile grant is re-read; admin and cached first profile do not bypass it', async () => {
  const state = setup();
  await resolveSummaryScope(request(), ids, state);
  state.docs.profilebasedpermissions.hasAccess = false;
  await assert.rejects(resolveSummaryScope(request(), {
    ...ids,
    role: 'ADMIN',
    profileId: 1001
  }, state), denied(403));
});

test('each grant tenant/user identity must match independently', async () => {
  for (const key of Object.keys(ids)) {
    const state = setup();
    state.docs.profilebasedpermissions[key] = oid('900000000000000000000001');
    await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403));
  }

  const state = setup();
  state.docs.profilebasedpermissions.profileId = 1002;
  await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403));
});

test('missing/inactive user, configuration, profile, organization and absent grant fail closed', async () => {
  for (const name of ['users', 'configs', 'profiles', 'organizations', 'profilebasedpermissions']) {
    const state = setup();
    delete state.docs[name];
    await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403), name);
  }

  for (const name of ['users', 'configs', 'profiles']) {
    const state = setup();
    state.docs[name].isActive = false;
    await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403), name);
  }
});

test('mismatched/unavailable organization fails before report permission callback', async () => {
  const state = setup();
  await assert.rejects(resolveSummaryScope(request(), {
    ...ids,
    organizationId: '900000000000000000000001'
  }, state), denied(403));
  assert.equal(state.pageCalls.length, 0);
  state.docs.configs.organizationId = null;
  await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403));
});

test('only literal true page permission grants report access', async () => {
  for (const value of [false, undefined, {
    hasAccess: true
  }, 'true']) {
    const state = setup();
    state.checkReportPermission = async () => value;
    await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403));
  }
});

test('unknown metadata never assumes seller or fills missing currency/timezone', async () => {
  for (const [field, value] of [['type', 'unknown'], ['type', undefined], ['timezone', 'Invalid/Zone'], ['currencyCode', undefined], ['currencyCode', 'usd']]) {
    const state = setup();
    state.docs.profiles[field] = value;
    await assert.rejects(resolveSummaryScope(request(), ids, state), denied(422, 'REPORT_METADATA_UNAVAILABLE'));
  }
});

test('unsafe and noncanonical IDs, unknown input fields and unsupported selections reject', async () => {
  for (const profileId of ['9007199254740992', '001001', 1001, '1e3']) {
    const state = setup();
    await assert.rejects(resolveSummaryScope({
      ...request(),
      profileIds: [profileId]
    }, ids, state), denied(400));
    assert.equal(state.reads.length, 0);
  }

  for (const patch of [{
    configId: ids.configId
  }, {
    profileIds: ['1001', '1002']
  }, {
    adTypes: ['SB']
  }, {
    category: 'waste'
  }, {
    groupBy: ['keyword']
  }, {
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 30,
      currencyCode: 'USD'
    }]
  }]) {
    await assert.rejects(resolveSummaryScope({
      ...request(),
      ...patch
    }, ids, setup()), denied(400));
  }
});

test('missing or malformed injected identity rejects before database reads', async () => {
  for (const context of [undefined, {}, {
    ...ids,
    userId: null
  }, {
    ...ids,
    configId: 'bad'
  }, {
    ...ids,
    organizationId: 'bad'
  }]) {
    const state = setup();
    await assert.rejects(resolveSummaryScope(request(), context, state), denied(401));
    assert.equal(state.reads.length, 0);
  }
});

test('database and permission failures return sanitized service errors', async () => {
  await assert.rejects(resolveSummaryScope(request(), ids, {}), denied(503));
  const state = setup();
  state.db.collection = () => ({
    findOne: async () => {
      throw new Error('secret connection');
    }
  });
  await assert.rejects(resolveSummaryScope(request(), ids, state), error => error.statusCode === 503 && !error.message.includes('secret'));
  const callbackState = setup();
  callbackState.checkReportPermission = async () => {
    throw new Error('secret');
  };
  await assert.rejects(resolveSummaryScope(request(), ids, callbackState), denied(503));
});

function pageSetup() {
  const state = setup();
  const roleId = oid('500000000000000000000001'),
    pageId = oid('600000000000000000000001');
  const actionId = oid('700000000000000000000001'),
    planId = oid('800000000000000000000001');
  const memberRoleId = oid('500000000000000000000002');
  const pages = [{
    pageId,
    allocatedActions: [{
      actionId,
      status: true
    }]
  }];
  Object.assign(state.docs.users, {
    roleId
  });
  state.docs.roles = {
    _id: roleId,
    roleName: 'USER',
    organizationId: null
  };
  state.docs.pages = {
    _id: pageId,
    pageName: 'Campaigns',
    isActive: true
  };
  state.docs.pageactions = {
    _id: actionId,
    pageId,
    actionType: 'View Only'
  };
  Object.assign(state.docs.organizations, {
    userId: oid(ids.userId),
    planId
  });
  state.docs.packages = {
    _id: planId,
    pages
  };
  state.docs.rolebasedpermissions = {
    userId: oid(ids.userId),
    organizationId: oid(ids.organizationId),
    roleId: memberRoleId
  };
  state.docs.permissions = {
    roleId: memberRoleId,
    pages: [{
      pageId,
      allocatedActions: [{
        actionId,
        status: true
      }]
    }]
  };

  return state;
}

test('fresh owner access requires active Campaigns action and allocated plan grant', async () => {
  const state = pageSetup();
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), true);
  assert.ok(!state.reads.some(r => r.name === 'permissions'));

  for (const read of state.reads) {
    assert.equal(read.options.maxTimeMS, 5000);
    assert.ok(!Object.keys(read.options.projection).some(k => /token|secret|password|email/i.test(k)));
  }

  state.docs.packages.pages[0].allocatedActions[0].status = false;
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
});

test('member requires organization-scoped membership AND permission AND plan grants', async () => {
  const state = pageSetup();
  state.docs.organizations.userId = oid('900000000000000000000001');
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), true);
  const query = state.reads.find(r => r.name === 'rolebasedpermissions').query;
  assert.equal(query.userId.toHexString(), ids.userId);
  assert.equal(query.organizationId.toHexString(), ids.organizationId);
  state.docs.permissions.pages[0].allocatedActions[0].status = false;
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
  state.docs.permissions.pages[0].allocatedActions[0].status = true;
  state.docs.rolebasedpermissions.organizationId = oid('900000000000000000000001');
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
});

test('only actual global SUPER_ADMIN role bypasses plan, never inactive user or profile grant', async () => {
  const state = pageSetup();
  state.docs.roles.roleName = 'SUPER_ADMIN';
  delete state.docs.packages;
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), true);
  state.docs.roles.organizationId = oid(ids.organizationId);
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
  state.docs.roles.organizationId = null;
  state.docs.users.isActive = false;
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
  state.docs.users.isActive = true;
  state.docs.profilebasedpermissions.hasAccess = false;
  state.checkReportPermission = (u, o) => checkCampaignReportPermission(u, o, state);
  await assert.rejects(resolveSummaryScope(request(), ids, state), denied(403));
});

test('missing page/action/plan and mismatched allocated identities fail closed', async () => {
  for (const name of ['pages', 'pageactions', 'organizations', 'packages']) {
    const state = pageSetup();
    delete state.docs[name];
    assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false, name);
  }

  for (const mutate of [s => {
    s.docs.pages.isActive = false;
  }, s => {
    s.docs.pageactions.actionType = 'Edit';
  }, s => {
    s.docs.packages.pages[0].pageId = oid('900000000000000000000001');
  }, s => {
    s.docs.packages.pages[0].allocatedActions[0].actionId = oid('900000000000000000000001');
  }, s => {
    s.docs.packages.pages[0].allocatedActions[0].status = 'true';
  }]) {
    const state = pageSetup();
    mutate(state);
    assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
  }
});

test('missing member role grant and revoked plan deny even valid member permission', async () => {
  for (const name of ['rolebasedpermissions', 'permissions']) {
    const state = pageSetup();
    state.docs.organizations.userId = oid('900000000000000000000001');
    delete state.docs[name];
    assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
  }

  const state = pageSetup();
  state.docs.organizations.userId = oid('900000000000000000000001');
  state.docs.packages.pages = [];
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
});

test('fresh entitlement check handles invalid identity and sanitized DB errors', async () => {
  assert.equal(await checkCampaignReportPermission('bad', ids.organizationId, {}), false);
  await assert.rejects(checkCampaignReportPermission(ids.userId, ids.organizationId, {}), denied(503));
  const state = pageSetup();
  state.db.collection = () => ({
    findOne: async () => {
      throw new Error('secret');
    }
  });
  await assert.rejects(checkCampaignReportPermission(ids.userId, ids.organizationId, state), e => e.statusCode === 503 && !e.message.includes('secret'));
});

function multiProfileSetup() {
  const state = setup();
  state.docs.profilebasedpermissions = [state.docs.profilebasedpermissions, {
    ...state.docs.profilebasedpermissions,
    _id: oid('400000000000000000000002'),
    profileId: 1002
  }];
  state.docs.profiles = [state.docs.profiles, {
    ...state.docs.profiles,
    profileId: 1002,
    currencyCode: 'USD',
    timezone: 'America/New_York',
    type: 'seller'
  }];
  const same = (left, right) => left?.toHexString ? left.toHexString() === right?.toHexString?.() : left === right;
  state.db = {
    collection: name => ({
      findOne: async (query, options) => {
        state.reads.push({
          name,
          query,
          options
        });
        const documents = Array.isArray(state.docs[name]) ? state.docs[name] : [state.docs[name]];
        const doc = documents.find(doc => doc && Object.entries(query).every(([key, value]) => same(doc[key], value)));

        if (!doc) {
          return null;
        }

        return Object.fromEntries(Object.entries(options.projection).filter(([, included]) => included === 1).map(([key]) => [key, doc[key]]));
      }
    })
  };

  return state;
}

test('general scope authorizes each profile and preserves independent currency/timezone/window metadata', async () => {
  const state = multiProfileSetup();
  const scope = await resolveReportScope({
    ...request(),
    profileIds: ['1001', '1002'],
    adTypes: ['SP', 'SB', 'SD'],
    groupBy: ['campaign']
  }, ids, state);
  assert.deepEqual(scope.currencyGroups, [{
    currencyCode: 'INR',
    profileIds: ['1001']
  }, {
    currencyCode: 'USD',
    profileIds: ['1002']
  }]);
  assert.deepEqual(scope.profiles[0].attributionWindows, {
    SP: 14,
    SB: null,
    SD: null
  });
  assert.deepEqual(scope.profiles[1].attributionWindows, {
    SP: 7,
    SB: null,
    SD: null
  });
  assert.equal(scope.profiles[1].timezone, 'America/New_York');
  assert.equal(scope.profiles[0].supportedDimensions.SD.includes('keyword'), false);
  assert.equal(state.reads.filter(read => read.name === 'profilebasedpermissions').length, 2);
  assert.equal(state.reads.filter(read => read.name === 'profiles').length, 2);
  assert.deepEqual(state.pageCalls.map(call => call[2]), ['Campaigns']);
});

test('general scope denies the entire request when any selected profile grant is revoked or cross-tenant', async () => {
  for (const mutate of [state => {
    state.docs.profilebasedpermissions[1].hasAccess = false;
  }, state => {
    state.docs.profilebasedpermissions[1].configId = oid('900000000000000000000001');
  }, state => {
    state.docs.profiles[1].isActive = false;
  }]) {
    const state = multiProfileSetup();
    mutate(state);
    await assert.rejects(resolveReportScope({
      ...request(),
      profileIds: ['1001', '1002']
    }, ids, state), denied(403));
  }
});

test('general scope rejects unsafe profile IDs and more than twenty profiles before any read', async () => {
  for (const profileIds of [['1001', '9007199254740992'], Array.from({
    length: 21
  }, (_, index) => String(index + 1))]) {
    const state = multiProfileSetup();
    await assert.rejects(resolveReportScope({
      ...request(),
      profileIds
    }, ids, state), denied(400));
    assert.equal(state.reads.length, 0);
  }
});

test('general scope rejects unsupported SD dimensions and mixed-currency money thresholds', async () => {
  await assert.rejects(resolveReportScope({
    ...request(),
    adTypes: ['SD'],
    groupBy: ['placement']
  }, ids, setup()), denied(400, 'UNSUPPORTED_REPORT_SELECTION'));
  await assert.rejects(resolveReportScope({
    ...request(),
    profileIds: ['1001', '1002'],
    filters: [{
      field: 'spend',
      operator: 'gt',
      value: 30,
      currencyCode: 'USD'
    }]
  }, ids, multiProfileSetup()), error => denied(400, 'REPORT_CURRENCY_MISMATCH')(error)
    && error.currencyCode === 'INR');
});

test('source-specific page requirements prevent Campaigns-only access to other report sources', async () => {
  const cases = [[{
    category: 'waste',
    groupBy: ['keyword']
  }, ['Campaigns', 'Targeting']], [{
    category: 'waste',
    groupBy: ['ad_group']
  }, ['Campaigns', 'Targeting']], [{
    category: 'growth',
    groupBy: ['search_term']
  }, ['Campaigns', 'Search Term', 'Targeting']], [{
    groupBy: ['placement']
  }, ['Campaigns', 'Placement']], [{
    category: 'time',
    groupBy: []
  }, ['Campaigns', 'Hourly Performance Tracking']], [{
    category: 'products',
    metrics: ['tacos', 'stock', 'profit']
  }, ['Campaigns', 'Product Ads', 'Product List', 'Dashboard', 'Inventory', 'Profit Analysis']], [{
    category: 'rules'
  }, ['Campaigns', 'Targeting Rule History', 'Placement Rule History', 'Budget Rule History', 'Search Term Rule History', 'Hourly Performance Tracking History']]];

  for (const [patch, requiredPages] of cases) {
    const input = {
      ...request(),
      groupBy: [],
      ...patch
    };
    assert.deepEqual(reportPermissionPages(input), requiredPages);
    const state = setup();
    state.checkReportPermission = async (_user, _organization, pageName) => pageName === 'Campaigns';
    await assert.rejects(resolveReportScope(input, ids, state), denied(403));
  }
});

test('generic page evaluator queries the actual requested page rather than Campaigns', async () => {
  const state = pageSetup();
  state.docs.pages.pageName = 'Inventory';
  assert.equal(await checkReportPagePermission(ids.userId, ids.organizationId, 'Inventory', state), true);
  assert.equal(await checkCampaignReportPermission(ids.userId, ids.organizationId, state), false);
  state.docs.packages.pages[0].allocatedActions[0].status = false;
  assert.equal(await checkReportPagePermission(ids.userId, ids.organizationId, 'Inventory', state), false);
});

test('general scope rejects nonliteral source permissions and sanitizes permission failures', async () => {
  for (const result of ['true', {
    hasAccess: true
  }, false]) {
    const state = setup();
    state.checkReportPermission = async () => result;
    await assert.rejects(resolveReportScope(request(), ids, state), denied(403));
  }

  const state = setup();
  state.checkReportPermission = async () => {
    throw new Error('private source');
  };
  await assert.rejects(resolveReportScope(request(), ids, state), error => error.statusCode === 503 && !error.message.includes('private'));
});
