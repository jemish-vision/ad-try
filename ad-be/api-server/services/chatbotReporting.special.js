'use strict';

const { Types: { ObjectId } } = require('mongoose');
const moment = require('moment-timezone');
const { hourlyPipeline, bucketConflict, bucketMetric } = require('./chatbotReporting/hourlySource');

const MAX_ROWS = 50000;
const BASE_METRICS = ['spend', 'sales', 'orders', 'clicks', 'impressions'];

function requestError(message, code = 'UNSUPPORTED_REPORT') {
  return Object.assign(new Error(message), {
    statusCode: 422,
    code
  });
}

function sourceResult(name) {
  return {
    rows: [],
    sourceRefs: [{
      name
    }],
    dataAsOf: null,
    verification: 'unverified',
    warnings: [],
    missingInputs: []
  };
}

function safeText(value) {
  return typeof value === 'string' ? value.slice(0, 300) : '';
}

function settingValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return safeText(value);
}

function numericIdentifier(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    return value;
  }
  return null;
}

function readMetric(value, count = false) {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || count && !Number.isSafeInteger(value)) {
    throw requestError('The source contains invalid metric values.', 'INVALID_SOURCE_DATA');
  }
  return value;
}

function validateSpecialRequest({
  profile,
  configId,
  period,
  adType
}) {
  if (
    !profile ||
    !/^[a-f\d]{24}$/i.test(String(configId)) ||
    !numericIdentifier(profile.profileId) ||
    !Number.isSafeInteger(Number(profile.profileId)) ||
    !['SP', 'SB', 'SD'].includes(adType) ||
    !profile.adTypes?.includes(adType)
  ) {
    throw requestError('The reporting profile or ad type is invalid.');
  }
  const start = moment.utc(period?.fromDate, 'YYYY-MM-DD', true);
  const end = moment.utc(period?.toDate, 'YYYY-MM-DD', true);
  if (
    !start.isValid() ||
    !end.isValid() ||
    end.diff(start, 'days') < 0 ||
    end.diff(start, 'days') >= 92
  ) {
    throw requestError('Request between 1 and 92 calendar dates.', 'INVALID_REPORT_PERIOD');
  }
}

function addEntityFilter(filter, entity, fields) {
  if (!entity) {
    return;
  }
  const field = fields[entity.dimension];
  if (!field || !Array.isArray(entity.ids) || !entity.ids.length || entity.ids.length > 100) {
    throw requestError('This entity filter is unsupported for this source.');
  }
  let ids;
  if (field === 'ruleId') {
    if (!entity.ids.every(id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id))) {
      throw requestError('Invalid rule identifier.');
    }
    ids = entity.ids.map(id => new ObjectId(id));
  } else if (field === 'asins') {
    if (!entity.ids.every(id => typeof id === 'string' && /^[A-Za-z0-9]{10}$/.test(id))) {
      throw requestError('Invalid ASIN.');
    }
    ids = entity.ids;
  } else {
    if (!entity.ids.every(id => numericIdentifier(id) && Number.isSafeInteger(Number(id)))) {
      throw requestError('Invalid entity identifier.');
    }
    ids = entity.ids.map(Number);
  }
  filter[field] = {
    $in: ids
  };
}

async function readRows(db, collection, filter, projection, maxLimit = MAX_ROWS) {
  const rows = await db.collection(collection).find(filter, {
    projection,
    maxTimeMS: 5000
  }).limit(maxLimit + 1).toArray();
  if (rows.length > maxLimit) {
    throw requestError('Narrow the reporting period or entity filter.', 'REPORT_ROW_LIMIT');
  }
  return rows;
}

function setFreshness(result, rows) {
  // updatedAt tells us when a row was ingested; it does not prove complete coverage.
  const timestamps = rows
    .filter(row => row.updatedAt !== null && row.updatedAt !== undefined)
    .map(row => new Date(row.updatedAt).getTime())
    .filter(Number.isFinite);
  if (timestamps.length) {
    result.dataAsOf = new Date(Math.max(...timestamps)).toISOString();
  }
  result.warnings.push('SOURCE_COMPLETENESS_UNVERIFIED');
  if (!rows.length) {
    result.missingInputs.push('No scoped source rows for the requested dates.');
  }
}

function markSourceConflict(result, warning) {
  result.rows = [];
  result.verification = 'conflict';
  result.warnings.push(warning);
  return result;
}

async function readTimeReport(input, filter) {
  const {
    db,
    profile,
    period,
    adType,
    dimension,
    entity
  } = input;
  const result = sourceResult('Hourly advertising traffic at targeting/placement grain');

  // Validate the requested grain before reading any hourly rows.
  if (!['hour', 'weekday', 'date', 'profile'].includes(dimension)) {
    throw requestError('Unsupported time dimension.');
  }
  if (period.isPartial) {
    result.missingInputs.push('Completed local calendar dates are required; hourly records cannot safely cut a partial hour.');
    return result;
  }
  addEntityFilter(filter, entity, {
    campaign: 'campaignId',
    ad_group: 'adGroupId',
    keyword: 'keywordId'
  });
  if (adType === 'SD' && entity?.dimension === 'keyword') {
    throw requestError('SD has targets rather than keywords.');
  }

  const scopedFilter = {
    ...filter,
    type: adType
  };
  // Hourly orders/sales are Amazon's 7-day attributed figures (the importer stores
  // attributed_units_ordered_7d in `orders`). They are usable as a PROVISIONAL
  // conversion proxy only when the profile's attribution window is 7 days; otherwise
  // the windows do not line up and conversion cannot be formed from them.
  const correctSalesWindow = profile.attributionWindows?.[adType] === 7;
  if (['orders', 'cvr', 'aov'].includes(input.metrics?.[0]) && !correctSalesWindow) {
    result.warnings.push('HOURLY_ATTRIBUTION_WINDOW_MISMATCH');
    result.missingInputs.push('Hourly conversion needs the profile attribution window to match the hourly 7-day attributed data.');
    return result;
  }

  // When database aggregation is available and no entity drilldown is requested,
  // collapse high-volume hourly traffic into (reportDate, startTime) cells directly in MongoDB.
  // This avoids exceeding MAX_ROWS (50,000) on large accounts with tens of thousands of hourly records.
  if (typeof db.collection('keywordshourlyperformances').aggregate === 'function' && !input.entity) {
    let aggregatedRows;
    try {
      const pipeline = hourlyPipeline(scopedFilter, profile.currencyCode, correctSalesWindow);
      aggregatedRows = await db.collection('keywordshourlyperformances').aggregate(pipeline, { maxTimeMS: 15000 }).toArray();
    } catch (error) {
      if (error.code === 50 || error.code === 'REPORT_ROW_LIMIT') {
        result.missingInputs.push('This time range contains too much hourly data to analyze safely. Try a shorter date range or select one campaign.');
        return result;
      }
      throw error;
    }

    setFreshness(result, aggregatedRows);
    result.warnings.push('HOURLY_ORDERS_ARE_UNITS');
    result.warnings.push('Hourly orders and conversion use Amazon 7-day attributed units, not settled order counts; treat them as provisional.');
    if (!correctSalesWindow) {
      result.warnings.push('HOURLY_ATTRIBUTION_WINDOW_MISMATCH');
      result.missingInputs.push('Hourly sales in the selected profile attribution window.');
    }

    const formsByDate = new Map();
    for (const row of aggregatedRows) {
      const conflict = bucketConflict(row);
      if (conflict) return markSourceConflict(result, conflict);
      const reportDate = row._id?.reportDate;
      const startTime = row._id?.startTime;
      if (
        !moment.utc(reportDate, 'YYYY-MM-DD', true).isValid() ||
        !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(startTime || '')
      ) {
        return markSourceConflict(result, 'INVALID_HOURLY_IDENTITY');
      }

      const forms = formsByDate.get(reportDate) || new Set();
      for (const form of (row.forms || [])) {
        forms.add(form);
      }
      formsByDate.set(reportDate, forms);
      if (forms.size > 1) {
        return markSourceConflict(result, 'OVERLAPPING_HOURLY_CONSOLIDATION');
      }

      if (row.currencies?.some(currency => currency !== undefined && currency !== profile.currencyCode)) {
        return markSourceConflict(result, 'SOURCE_CURRENCY_MISMATCH');
      }

      result.rows.push({
        profileId: profile.profileId,
        adType,
        date: reportDate,
        hour: Number(startTime.split(':')[0]),
        weekday: moment.utc(reportDate).isoWeekday(),
        campaignId: 'all',
        adGroupId: 'all',
        keywordId: null,
        placement: 'all',
        spend: readMetric(bucketMetric(row, 'spends')),
        sales: correctSalesWindow ? readMetric(bucketMetric(row, 'sales')) : null,
        orders: correctSalesWindow ? readMetric(bucketMetric(row, 'orders'), true) : null,
        clicks: readMetric(bucketMetric(row, 'clicks'), true),
        impressions: readMetric(bucketMetric(row, 'impressions'), true)
      });
    }
    return result;
  }

  let rows;
  try {
    rows = await readRows(db, 'keywordshourlyperformances', scopedFilter, {
      reportDate: 1,
      startTime: 1,
      campaignId: 1,
      adGroupId: 1,
      keywordId: 1,
      placement: 1,
      marketplaceId: 1,
      isHourlyAggregated: 1,
      spends: 1,
      sales: 1,
      orders: 1,
      clicks: 1,
      impressions: 1,
      currency: 1,
      updatedAt: 1
    }, input.maxRows || MAX_ROWS);
  } catch (error) {
    if (error.code === 50 || error.code === 'REPORT_ROW_LIMIT') {
      result.missingInputs.push('This time range contains too much hourly data to analyze safely. Try a shorter date range or select one campaign.');
      return result;
    }
    throw error;
  }

  setFreshness(result, rows);
  result.warnings.push('HOURLY_ORDERS_ARE_UNITS');
  result.warnings.push('Hourly orders and conversion use Amazon 7-day attributed units, not settled order counts; treat them as provisional.');

  if (!correctSalesWindow) {
    result.warnings.push('HOURLY_ATTRIBUTION_WINDOW_MISMATCH');
    result.missingInputs.push('Hourly sales in the selected profile attribution window.');
  }
  const formsByDate = new Map();
  const identities = new Set();

  // Reject overlapping raw/consolidated rows before normalizing their values.
  for (const row of rows) {
    const forms = formsByDate.get(row.reportDate) || new Set();
    forms.add(row.isHourlyAggregated === true ? 'consolidated' : 'raw');
    formsByDate.set(row.reportDate, forms);
    // Consolidation inserts hour totals before deleting their underlying raw rows.
    if (forms.size > 1) {
      return markSourceConflict(result, 'OVERLAPPING_HOURLY_CONSOLIDATION');
    }
    if (
      !numericIdentifier(row.campaignId) ||
      !numericIdentifier(row.adGroupId) ||
      !moment.utc(row.reportDate, 'YYYY-MM-DD', true).isValid() ||
      !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(row.startTime || '')
    ) {
      return markSourceConflict(result, 'INVALID_HOURLY_IDENTITY');
    }
    if (row.currency !== undefined && row.currency !== profile.currencyCode) {
      return markSourceConflict(result, 'SOURCE_CURRENCY_MISMATCH');
    }
    const identity = JSON.stringify([
      row.reportDate,
      row.startTime,
      row.campaignId,
      row.adGroupId,
      row.keywordId ?? null,
      row.placement ?? '',
      row.marketplaceId ?? ''
    ]);
    if (identities.has(identity)) {
      return markSourceConflict(result, 'DUPLICATE_HOURLY_IDENTITY');
    }
    identities.add(identity);
    result.rows.push({
      profileId: profile.profileId,
      adType,
      date: row.reportDate,
      hour: Number(row.startTime.split(':')[0]),
      weekday: moment.utc(row.reportDate).isoWeekday(),
      campaignId: String(row.campaignId),
      adGroupId: String(row.adGroupId),
      keywordId: numericIdentifier(row.keywordId),
      placement: safeText(row.placement),
      spend: readMetric(row.spends),
      sales: correctSalesWindow ? readMetric(row.sales) : null,
      orders: correctSalesWindow ? readMetric(row.orders, true) : null,
      clicks: readMetric(row.clicks, true),
      impressions: readMetric(row.impressions, true)
    });
  }
  return result;
}

async function readProductsReport(input, filter) {
  const {
    db,
    profile,
    adType,
    dimension,
    entity,
    metrics = []
  } = input;
  const result = sourceResult(`${adType} daily advertised product report`);

  if (dimension !== 'product') {
    throw requestError('Products require the product dimension.');
  }
  // These metrics need additional reconciled sources before they can be reported.
  const needed = {
    profit: 'Product profit requires product costs, selling fees, product revenue and advertising spend for the same dates.',
    tacos: 'Reconciled total product sales including organic and complete advertising spend.',
    stock: 'Fresh sellable inventory joined to advertised ASIN/SKU identities.',
    days_of_stock: 'Fresh sellable inventory and validated product sales velocity.'
  };
  result.missingInputs.push(
    ...metrics.filter(metric => needed[metric]).map(metric => needed[metric])
  );
  if (result.missingInputs.length) {
    return result;
  }
  if (adType === 'SB') {
    result.missingInputs.push('A reconciled Sponsored Brands per-product allocation is not established.');
    return result;
  }
  addEntityFilter(filter, entity, {
    campaign: 'campaignId',
    ad_group: 'adGroupId',
    product: 'asins'
  });
  const rows = await readRows(db, adType === 'SP' ? 'product_ads' : 'sdproductads', filter, {
    reportDate: 1,
    adId: 1,
    asins: 1,
    sku: 1,
    name: 1,
    campaignId: 1,
    spend: 1,
    sales: 1,
    orders: 1,
    clicks: 1,
    impressions: 1,
    currencyCode: 1,
    updatedAt: 1
  });
  setFreshness(result, rows);
  // SP explicitly selects seller 7-day/vendor 14-day fields. SD falls back from
  // purchases/sales to seven-day fields without retaining which source was used.
  if (adType === 'SD') {
    result.warnings.push('PRODUCT_ATTRIBUTION_WINDOW_UNVERIFIED');
    result.missingInputs.push('Verified SD sales/orders attribution window; importer does not retain the selected field.');
  }
  const identities = new Set();

  for (const row of rows) {
    if (
      !numericIdentifier(row.adId) ||
      !numericIdentifier(row.campaignId) ||
      !row.asins ||
      !moment.utc(row.reportDate, 'YYYY-MM-DD', true).isValid()
    ) {
      return markSourceConflict(result, 'INVALID_PRODUCT_IDENTITY');
    }
    if (row.currencyCode !== undefined && row.currencyCode !== profile.currencyCode) {
      return markSourceConflict(result, 'SOURCE_CURRENCY_MISMATCH');
    }
    const key = `${row.adId}#${row.reportDate}`;
    if (identities.has(key)) {
      return markSourceConflict(result, 'DUPLICATE_PRODUCT_AD_IDENTITY');
    }
    identities.add(key);
    const normalized = {
      profileId: profile.profileId,
      adType,
      date: row.reportDate,
      productId: safeText(row.asins),
      sku: safeText(row.sku),
      name: safeText(row.name) || safeText(row.asins),
      campaignId: String(row.campaignId)
    };
    for (const metric of BASE_METRICS) {
      normalized[metric] = readMetric(
        row[metric],
        ['orders', 'clicks', 'impressions'].includes(metric)
      );
    }
    if (adType === 'SD') {
      normalized.sales = null;
      normalized.orders = null;
    }
    result.rows.push(normalized);
  }
  return result;
}

async function readRulesReport(input, filter) {
  const {
    db,
    profile,
    adType,
    dimension,
    entity,
    userId
  } = input;
  const ownerId = typeof userId === 'string' ? userId : userId?.toHexString?.();

  if (!/^[a-f\d]{24}$/i.test(ownerId || '')) {
    throw Object.assign(new Error('Authenticated rule history owner is required.'), {
      statusCode: 401,
      code: 'REPORT_IDENTITY_REQUIRED'
    });
  }
  if (dimension !== 'rule') {
    throw requestError('Rules require the rule dimension.');
  }
  addEntityFilter(filter, entity, {
    rule: 'ruleId',
    campaign: 'campaignId'
  });
  filter.ruleDate = filter.reportDate;
  delete filter.reportDate;
  // The service passes this owner from authenticated context, never report JSON.
  const rows = await readRows(db, 'affectedcampaignbyrules', {
    ...filter,
    type: adType,
    userId: new ObjectId(ownerId)
  }, {
    ruleDate: 1,
    ruleTime: 1,
    ruleId: 1,
    ruleSchema: 1,
    campaignId: 1,
    name: 1,
    changed: 1,
    oldValue: 1,
    newValue: 1,
    updatedAt: 1
  });
  const result = sourceResult('Affected rule entity history snapshots');
  setFreshness(result, rows);
  if (input.period.isPartial) {
    result.warnings.push('Today\'s rule history is still updating; these are the records available so far.');
  }
  if (!rows.length) {
    result.missingInputs = ['No matching rule-history records found for this period. History coverage is not verified, so this does not establish that no changes occurred.'];
  }
  result.warnings.push('RULE_HISTORY_IS_NOT_APPLIED_EXECUTION_PROOF');
  result.missingInputs.push('Confirmed applied execution status/timestamp is required for rule effectiveness analysis.');
  if (rows.some(row => (
    !/^[a-f\d]{24}$/i.test(String(row.ruleId || '')) ||
    !numericIdentifier(row.campaignId) ||
    !moment.utc(row.ruleDate, 'YYYY-MM-DD', true).isValid()
  ))) {
    return markSourceConflict(result, 'INVALID_RULE_HISTORY_IDENTITY');
  }
  result.rows = rows.map(row => ({
    profileId: profile.profileId,
    adType,
    date: safeText(row.ruleDate),
    ruleTime: safeText(row.ruleTime),
    ruleId: String(row.ruleId || ''),
    ruleType: safeText(row.ruleSchema),
    entityId: numericIdentifier(row.campaignId) || '',
    name: safeText(row.name),
    changeType: safeText(row.changed),
    oldValue: settingValue(row.oldValue),
    newValue: settingValue(row.newValue),
    status: 'history_snapshot'
  }));
  return result;
}

async function readSpecialReport(input) {
  validateSpecialRequest(input);

  if (!['time', 'products', 'rules'].includes(input.category)) {
    throw requestError('No specialized source exists for this category.');
  }
  const filter = {
    configId: new ObjectId(String(input.configId)),
    profileId: Number(input.profile.profileId),
    reportDate: {
      $gte: input.period.fromDate,
      $lte: input.period.toDate
    }
  };
  if (input.category === 'time') {
    return readTimeReport(input, filter);
  }
  // History snapshots already record individual events/settings. They can be
  // read through today without treating today as a completed advertising day.
  if (input.category === 'rules') {
    return readRulesReport(input, filter);
  }
  if (input.period.isPartial) {
    const result = sourceResult(`${input.category} reporting`);
    result.missingInputs.push('Completed local calendar dates are required for this source.');
    return result;
  }
  if (input.category === 'products') {
    return readProductsReport(input, filter);
  }
  throw requestError('No specialized source exists for this category.');
}

module.exports = {
  readSpecialReport
};
