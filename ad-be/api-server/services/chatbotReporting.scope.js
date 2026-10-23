const { Types } = require('mongoose');
const {
  validateReportRequest,
  validateResolvedScope,
  validateReportSelection,
} = require('../contracts/chatbotReporting.contract');

function scopeError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function identity(value) {
  const text = typeof value === 'string' ? value : value?.toHexString?.();
  return typeof text === 'string' && /^[a-f\d]{24}$/i.test(text)
    ? new Types.ObjectId(text)
    : null;
}

function createAuthorizationReader(db) {
  return async function readAuthorizationRecord(collection, query, projection) {
    try {
      return await db.collection(collection).findOne(query, { projection, maxTimeMS: 5000 });
    } catch (_) {
      throw scopeError(
        503,
        'REPORT_AUTHORIZATION_UNAVAILABLE',
        'Reporting authorization is unavailable',
      );
    }
  };
}

function isSafeProfileId(profileId) {
  const numericProfileId = Number(profileId);

  return Number.isSafeInteger(numericProfileId) &&
    numericProfileId > 0 && String(numericProfileId) === profileId;
}

function groupProfilesByCurrency(profiles) {
  const currencyGroups = [];


  for (const profile of profiles) {
    let group = currencyGroups.find(group => group.currencyCode === profile.currencyCode);


    if (!group) {
      group = { currencyCode: profile.currencyCode, profileIds: [] };
      currencyGroups.push(group);
    }

    group.profileIds.push(profile.profileId);
  }



  return currencyGroups;
}

function buildProfileMetadata(profileId, profile, adTypes, summaryOnly) {
  const accountType = typeof profile.type === 'string' ? profile.type.toLowerCase() : '';



  if (!['vendor', 'seller'].includes(accountType)) {
    throw scopeError(422, 'REPORT_METADATA_UNAVAILABLE', 'Validated profile account type is required');
  }



  const dimensions = summaryOnly ? ['profile', 'campaign', 'date'] : [
    'profile', 'campaign', 'ad_group', 'keyword', 'target', 'search_term',
    'placement', 'date', 'hour', 'weekday', 'product', 'rule',
  ];
  const attributionWindows = {};
  const supportedDimensions = {};


  for (const adType of adTypes) {
    // Only SP's seller/vendor attribution is established by the importer.
    attributionWindows[adType] = adType === 'SP' ? (accountType === 'vendor' ? 14 : 7) : null;
    supportedDimensions[adType] = adType === 'SD'
      ? dimensions.filter(dimension => !['keyword', 'search_term', 'placement'].includes(dimension))
      : dimensions;
  }



  return {
    profileId,
    timezone: profile.timezone,
    currencyCode: profile.currencyCode,
    accountType,
    adTypes,
    attributionWindows,
    supportedDimensions,
  };
}



// Fresh, narrowly projected reads intentionally do not trust the auth middleware's
// cached first-profile access, role, or a client-supplied resolved scope.
async function resolveScope(
  input,
  authContext,
  { db, checkReportPermission } = {},
  summaryOnly = false,
) {
  const userId = identity(authContext?.userId);
  const configId = identity(authContext?.configId);
  const suppliedOrg = authContext?.organizationId;
  const contextOrg = suppliedOrg == null ? null : identity(suppliedOrg);


  if (!userId || !configId || (suppliedOrg != null && !contextOrg)) {
    throw scopeError(401, 'REPORT_IDENTITY_REQUIRED', 'Authenticated report identity is required');
  }


  let request;


  try {
    request = validateReportRequest(input);
  } catch (_) {
    throw scopeError(400, 'INVALID_REPORT_REQUEST', 'Invalid reporting request');
  }


  if (summaryOnly && (
    request.category !== 'summary' || request.profileIds.length !== 1 ||
    request.adTypes.length !== 1 || request.adTypes[0] !== 'SP'
  )) {
    throw scopeError(400, 'UNSUPPORTED_SUMMARY_SCOPE', 'Summary currently supports one profile and SP only');
  }


  if (!request.profileIds.length || request.profileIds.some(profileId => !isSafeProfileId(profileId))) {
    throw scopeError(400, 'UNSAFE_PROFILE_ID', 'Profile identifier cannot be represented safely by the reporting database');
  }


  if (!db?.collection || typeof checkReportPermission !== 'function') {
    throw scopeError(503, 'REPORT_AUTHORIZATION_UNAVAILABLE', 'Reporting authorization is unavailable');
  }


  const read = createAuthorizationReader(db);
  const user = await read('users', { _id: userId, isActive: true }, { _id: 1 });


  if (!user) {
    throw scopeError(403, 'REPORT_ACCESS_DENIED', 'Reporting access denied');
  }


  const config = await read('configs', { _id: configId, isActive: true }, { _id: 1, organizationId: 1 });
  const organizationId = identity(config?.organizationId);


  if (!organizationId || (contextOrg && !organizationId.equals(contextOrg))) {
    throw scopeError(403, 'REPORT_ACCESS_DENIED', 'Reporting access denied');
  }


  const organization = await read('organizations', { _id: organizationId }, { _id: 1 });


  if (!organization) {
    throw scopeError(403, 'REPORT_ACCESS_DENIED', 'Reporting access denied');
  }


  // Each requested profile needs its own fresh grant. No partial authorization.
  for (const profileId of request.profileIds) {
    const grant = await read('profilebasedpermissions', {
      userId,
      configId,
      organizationId,
      profileId: Number(profileId),
      hasAccess: true,
    }, { _id: 1 });
    if (!grant) {
      throw scopeError(403, 'REPORT_ACCESS_DENIED', 'Reporting access denied');
    }
  }


  const requiredPages = summaryOnly ? ['Campaigns'] : reportPermissionPages(request);

  for (const pageName of requiredPages) {
    let pageAllowed;

    try {
      pageAllowed = await checkReportPermission(userId, organizationId, pageName);
    } catch (_) {
      throw scopeError(503, 'REPORT_AUTHORIZATION_UNAVAILABLE', 'Reporting authorization is unavailable');
    }


    if (pageAllowed !== true) {
      throw scopeError(403, 'REPORT_ACCESS_DENIED', 'Reporting access denied');
    }
  }


  const profiles = [];

  for (const profileId of request.profileIds) {
    const profile = await read(
      'profiles',
      { configId, profileId: Number(profileId), isActive: true },
      { _id: 0, profileId: 1, timezone: 1, currencyCode: 1, type: 1 },
    );
    if (!profile) {
      throw scopeError(403, 'REPORT_ACCESS_DENIED', 'Reporting access denied');
    }
    profiles.push(buildProfileMetadata(profileId, profile, request.adTypes, summaryOnly));
  }


  const currencyGroups = groupProfilesByCurrency(profiles);
  let scope;

  try {
    scope = validateResolvedScope({
      configId: configId.toHexString(),
      profiles,
      currencyGroups,
    });
  } catch (_) {
    throw scopeError(422, 'REPORT_METADATA_UNAVAILABLE', 'Validated profile timezone and currency are required');
  }

  try {
    validateReportSelection(request, scope);
  } catch (error) {
    if (error.code === 'REPORT_CURRENCY_MISMATCH') {
      throw Object.assign(scopeError(400, error.code, 'Use a threshold in the selected profile currency'), {
        currencyCode: error.currencyCode,
      });
    }
    throw scopeError(400, 'UNSUPPORTED_REPORT_SELECTION', 'Requested report selection is unsupported');
  }



  return scope;
}

function resolveSummaryScope(input, authContext, options) {
  return resolveScope(input, authContext, options, true);
}

function resolveReportScope(input, authContext, options) {
  return resolveScope(input, authContext, options);
}



// Match the portal's existing View Only pages for every source we expose.
function reportPermissionPages(request) {
  const pages = new Set(['Campaigns']);
  const dimensions = new Set([...request.groupBy, request.entity?.dimension]);

  // Ad-group totals also come from the targeting collection in this slice.
  if (dimensions.has('keyword') || dimensions.has('target') || dimensions.has('ad_group')) {
    pages.add('Targeting');
  }


  if (dimensions.has('search_term') || request.category === 'growth') {
    pages.add('Search Term');
  }

  // Search-term growth checks compare candidates against the keyword inventory.
  if (request.category === 'growth' && dimensions.has('search_term')) {
    pages.add('Targeting');
  }


  if (dimensions.has('placement')) {
    pages.add('Placement');
  }


  if (dimensions.has('hour') || dimensions.has('weekday') || request.category === 'time') {
    pages.add('Hourly Performance Tracking');
  }


  if (dimensions.has('product') || request.category === 'products') {
    pages.add('Product Ads');
    pages.add('Product List');
    if (request.metrics.includes('tacos')) {
      pages.add('Dashboard');
    }
  }


  if (request.metrics.some(metric => ['stock', 'days_of_stock'].includes(metric))) {
    pages.add('Inventory');
  }


  if (request.metrics.includes('profit')) {
    pages.add('Profit Analysis');
  }


  if (dimensions.has('rule') || request.category === 'rules') {
    const rulePages = [
      'Targeting Rule History',
      'Placement Rule History',
      'Budget Rule History',
      'Search Term Rule History',
      'Hourly Performance Tracking History',
    ];

    for (const page of rulePages) {
      pages.add(page);
    }
  }


  return [...pages];
}



// Mirrors Campaigns / View Only entitlement without common.js's Redis cache or
// model initialization. The profile grant remains mandatory in resolveSummaryScope.
async function checkReportPagePermission(
  suppliedUserId,
  suppliedOrganizationId,
  pageName,
  { db } = {},
) {
  const userId = identity(suppliedUserId);
  const organizationId = identity(suppliedOrganizationId);


  if (!userId || !organizationId) {
    return false;
  }


  if (!db?.collection) {
    throw scopeError(503, 'REPORT_AUTHORIZATION_UNAVAILABLE', 'Reporting authorization is unavailable');
  }


  const read = createAuthorizationReader(db);
  const user = await read('users', { _id: userId, isActive: true }, { _id: 1, roleId: 1 });


  if (!user) {
    return false;
  }


  const roleId = identity(user.roleId);
  const role = roleId
    ? await read('roles', { _id: roleId }, { _id: 1, roleName: 1, organizationId: 1 })
    : null;
  const PAGE_ALIASES = {
    'Hourly Performance Tracking History': ['Dayparting Stretegy History', 'Hourly Performance Tracking', 'Dayparting Strategy History'],
  };
  let page = await read('pages', { pageName, isActive: true }, { _id: 1 });
  if (!page?._id && PAGE_ALIASES[pageName]) {
    for (const alias of PAGE_ALIASES[pageName]) {
      page = await read('pages', { pageName: alias, isActive: true }, { _id: 1 });
      if (page?._id) break;
    }
  }


  if (!page?._id) {
    return false;
  }


  const action = await read('pageactions', { pageId: page._id, actionType: 'View Only' }, { _id: 1 });


  if (!action?._id) {
    return false;
  }


  if (role?.roleName === 'SUPER_ADMIN' && role.organizationId == null) {
    return true;
  }


  const organization = await read(
    'organizations',
    { _id: organizationId },
    { _id: 1, userId: 1, planId: 1 },
  );
  const planId = identity(organization?.planId);


  if (!organization || !planId) {
    return false;
  }


  const plan = await read('packages', { _id: planId }, { _id: 1, pages: 1 });
  const matchesId = (a, b) => {
    const left = identity(a);
    const right = identity(b);
    return Boolean(left && right && left.equals(right));
  };
  const allows = pages => Array.isArray(pages) && pages.some(entry => {
    if (!matchesId(entry?.pageId, page._id) || !Array.isArray(entry.allocatedActions)) {
      return false;
    }



    return entry.allocatedActions.some(allocated =>
      allocated?.status === true && matchesId(allocated.actionId, action._id));
  });
  if (!allows(plan?.pages)) {
    return false;
  }


  if (matchesId(organization.userId, userId)) {
    return true;
  }


  const membership = await read('rolebasedpermissions', { userId, organizationId }, { _id: 1, roleId: 1 });
  const memberRoleId = identity(membership?.roleId);


  if (!memberRoleId) {
    return false;
  }


  const permission = await read('permissions', { roleId: memberRoleId }, { _id: 1, pages: 1 });
  return allows(permission?.pages);
}

function checkCampaignReportPermission(userId, organizationId, options) {
  return checkReportPagePermission(userId, organizationId, 'Campaigns', options);
}

module.exports = {
  resolveSummaryScope,
  resolveReportScope,
  reportPermissionPages,
  checkCampaignReportPermission,
  checkReportPagePermission,
};
