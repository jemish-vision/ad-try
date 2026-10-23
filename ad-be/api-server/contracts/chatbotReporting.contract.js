const Joi = require('joi');
const moment = require('moment-timezone');

// Shared v1 shapes for requests, authorized scope, and report responses.
// Business consistency checks complement the field-level Joi validation.
const VERSION = '1.0';
const CATEGORIES = ['summary', 'comparison', 'change', 'waste', 'growth', 'time',
  'products', 'rules', 'unusual', 'definition'];
const METRICS = ['spend', 'sales', 'orders', 'clicks', 'impressions', 'acos', 'roas', 'cpc',
  'cvr', 'ctr', 'aov', 'tacos', 'profit', 'stock', 'days_of_stock'];
const DIMENSIONS = ['profile', 'campaign', 'ad_group', 'keyword', 'target', 'search_term',
  'placement', 'date', 'hour', 'weekday', 'product', 'rule'];
const UNITS = ['currency', 'count', 'percent', 'multiple'];
const AD_TYPES = ['SP', 'SB', 'SD'];
const validationOptions = {
  abortEarly: false,
  convert: false,
  allowUnknown: false
};

const key = Joi.string()
  .pattern(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
  .invalid('constructor', 'prototype');
const profileId = Joi.string().pattern(/^[1-9]\d{0,19}$/);
const currency = Joi.string().pattern(/^[A-Z]{3}$/);
const date = Joi.string().custom((value, helpers) => {
  if (!moment(value, 'YYYY-MM-DD', true).isValid()) {
    return helpers.error('any.invalid');
  }

  return value;
});
const instant = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).isoDate();
const timezone = Joi.string().custom((value, helpers) => {
  if (!moment.tz.zone(value)) {
    return helpers.error('any.invalid');
  }

  return value;
});
const adTypes = Joi.array().items(Joi.string().valid(...AD_TYPES)).unique().min(1).max(3);
const unit = Joi.string().valid(...UNITS);
const metricStatus = Joi.string()
  .valid('available', 'missing_data', 'no_sales', 'no_spend', 'no_clicks',
    'no_impressions', 'no_orders');
const periodIntentSchema = Joi.object({
  preset: Joi.string()
    .valid('yesterday', 'today', 'last_7_days', 'last_14_days', 'last_30_days',
      'this_week', 'last_week', 'custom')
    .required(),
  fromDate: Joi.when('preset', {
    is: 'custom',
    then: date.required(),
    otherwise: Joi.forbidden()
  }),
  toDate: Joi.when('preset', {
    is: 'custom',
    then: date.required(),
    otherwise: Joi.forbidden()
  })
});

const comparisonIntentSchema = Joi.object({
  mode: Joi.string().valid('none', 'previous_period', 'previous_week', 'custom').required(),
  fromDate: Joi.when('mode', {
    is: 'custom',
    then: date.required(),
    otherwise: Joi.forbidden()
  }),
  toDate: Joi.when('mode', {
    is: 'custom',
    then: date.required(),
    otherwise: Joi.forbidden()
  })
});

const moneyMetrics = new Set(['spend', 'sales', 'cpc', 'aov', 'profit']);

function getMetricUnit(metric) {
  if (moneyMetrics.has(metric)) {
    return 'currency';
  }

  if (['acos', 'cvr', 'ctr', 'tacos'].includes(metric)) {
    return 'percent';
  }

  if (metric === 'roas') {
    return 'multiple';
  }

  return 'count';
}

const metricUnits = Object.fromEntries(
  METRICS.map(metric => [metric, getMetricUnit(metric)])
);
const denominatorStatus = {
  acos: 'no_sales',
  roas: 'no_spend',
  cpc: 'no_clicks',
  cvr: 'no_clicks',
  ctr: 'no_impressions',
  aov: 'no_orders',
  tacos: 'no_sales'
};

const filterSchema = Joi.object({
  field: Joi.string().valid(...METRICS).required(),
  operator: Joi.string().valid('eq', 'neq', 'gt', 'gte', 'lt', 'lte').required(),
  value: Joi.number().required(),
  currencyCode: currency
}).custom((filter, helpers) => {
  const requiresCurrency = moneyMetrics.has(filter.field);
  const hasCurrency = Boolean(filter.currencyCode);

  if (requiresCurrency !== hasCurrency) {
    return helpers.error('any.invalid');
  }

  return filter;
});

const requestSchema = Joi.object({
  schemaVersion: Joi.string().valid(VERSION).required(),
  category: Joi.string().valid(...CATEGORIES).required(),
  profileIds: Joi.when('category', {
    is: 'definition',
    then: Joi.array().items(profileId).unique().max(20).default([]),
    otherwise: Joi.array().items(profileId).unique().min(1).max(20).required()
  }),
  adTypes: adTypes.default(['SP']),
  period: Joi.when('category', {
    is: 'definition',
    then: periodIntentSchema.optional(),
    otherwise: periodIntentSchema.required()
  }),
  comparison: comparisonIntentSchema.default({
    mode: 'none'
  }),
  metrics: Joi.array().items(Joi.string().valid(...METRICS)).unique().min(1).max(METRICS.length).required(),
  groupBy: Joi.array().items(Joi.string().valid(...DIMENSIONS)).unique().max(3).default([]),
  filters: Joi.array().items(filterSchema).max(10).default([]),
  entity: Joi.object({
    dimension: Joi.string().valid(...DIMENSIONS.filter(d => !['date', 'hour',
      'weekday'].includes(d))).required(),
    ids: Joi.array().items(Joi.string().min(1).max(100)).unique().min(1).max(100).required()
  }),
  sort: Joi.object({
    field: Joi.string().valid(...METRICS, 'name').required(),
    direction: Joi.string().valid('asc', 'desc').required()
  }),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).max(100000).default(0),
  analysis: Joi.object({
    includeMovers: Joi.boolean(),
    targetAcos: Joi.number().greater(0).max(1000)
  }),
  presentation: Joi.string()
    .valid('auto', 'number_card', 'line', 'bar', 'grouped_bar', 'heatmap', 'donut', 'table')
    .default('auto')
});

const perAdTypeWindows = Joi.object(Object.fromEntries(
  AD_TYPES.map(type => [type, Joi.number().integer().min(1).max(90).allow(null)])
));
const perAdTypeDimensions = Joi.object(Object.fromEntries(
  AD_TYPES.map(type => [
    type,
    Joi.array().items(Joi.string().valid(...DIMENSIONS)).unique().min(1)
  ])
));
const profileSchema = Joi.object({
  profileId: profileId.required(),
  timezone: timezone.required(),
  currencyCode: currency.required(),
  accountType: Joi.string().valid('seller', 'vendor', 'unknown').required(),
  adTypes: adTypes.required(),
  attributionWindows: perAdTypeWindows.required(),
  supportedDimensions: perAdTypeDimensions.required()
});

function validateScopeConsistency(scope, helpers) {
  const memberships = new Set();
  for (const group of scope.currencyGroups) {
    for (const id of group.profileIds) {
      const profile = scope.profiles.find(p => p.profileId === id);
      if (!profile || profile.currencyCode !== group.currencyCode || memberships.has(id)) {
        return helpers.error('any.invalid');
      }
      memberships.add(id);
    }
  }
  if (memberships.size !== scope.profiles.length) {
    return helpers.error('any.invalid');
  }
  for (const profile of scope.profiles) {
    if ([...Object.keys(profile.attributionWindows),
      ...Object.keys(profile.supportedDimensions)].some(type => !profile.adTypes.includes(type))) {
      return helpers.error('any.invalid');
    }
    for (const type of profile.adTypes) {
      if (!Object.hasOwn(profile.attributionWindows, type) ||
        !Object.hasOwn(profile.supportedDimensions, type)) {
        return helpers.error('any.invalid');
      }
      if (type === 'SD' &&
        profile.supportedDimensions[type].some(d => ['keyword', 'search_term',
          'placement'].includes(d))) {
        return helpers.error('any.invalid');
      }
    }
  }

  return scope;
}

const resolvedScopeSchema = Joi.object({
  configId: Joi.string().hex().length(24).required(),
  profiles: Joi.array().items(profileSchema).unique('profileId').min(1).max(20).required(),
  currencyGroups: Joi.array().items(Joi.object({
    currencyCode: currency.required(),
    profileIds: Joi.array().items(profileId).unique().min(1).required()
  })).unique('currencyCode').min(1).max(20).required()
}).custom(validateScopeConsistency);

function validateWindowBounds(window, helpers) {
  const datesAreOrdered = window.fromDate <= window.toDate;
  const durationIsPositive = Date.parse(window.startAt) < Date.parse(window.endBefore);

  if (!datesAreOrdered || !durationIsPositive) {
    return helpers.error('any.invalid');
  }

  return window;
}

const windowSchema = Joi.object({
  fromDate: date.required(),
  toDate: date.required(),
  startAt: instant.required(),
  endBefore: instant.required(),
  isPartial: Joi.boolean().required()
}).custom(validateWindowBounds);
const comparisonSchema = Joi.object({
  previousValue: Joi.number().allow(null).required(),
  absoluteChange: Joi.number().allow(null).required(),
  relativeChangePercent: Joi.number().allow(null).required(),
  percentagePointChange: Joi.number().allow(null).required(),
  status: Joi.string().valid('comparable', 'new_activity', 'both_zero', 'unavailable').required()
});

function validateCardConsistency(card, helpers) {
  if ((card.status === 'available') !== (card.value !== null)) {
    return helpers.error('any.invalid');
  }
  if (card.unit !== metricUnits[card.metric]) {
    return helpers.error('any.invalid');
  }
  if (card.status !== 'available' && card.status !== 'missing_data' &&
    card.status !== denominatorStatus[card.metric]) {
    return helpers.error('any.invalid');
  }
  if (card.value !== null && (card.metric !== 'profit' && card.value < 0 ||
    ['orders', 'clicks', 'impressions', 'stock'].includes(card.metric) &&
    !Number.isSafeInteger(card.value))) {
    return helpers.error('any.invalid');
  }
  if (card.unit === 'currency' && !card.currencyCode) {
    return helpers.error('any.invalid');
  }
  if (card.comparison) {
    const comparison = card.comparison;
    const previous = comparison.previousValue;
    if (previous !== null && card.metric !== 'profit' && previous < 0) {
      return helpers.error('any.invalid');
    }
    if (previous !== null &&
      ['orders', 'clicks', 'impressions', 'stock'].includes(card.metric) &&
      !Number.isSafeInteger(previous)) {
      return helpers.error('any.invalid');
    }
    const comparable = card.value !== null && previous !== null;
    const change = comparable ? card.value - previous : null;
    const expected = {
      absoluteChange: change,
      relativeChangePercent: comparable &&
        previous !== 0 ? change / Math.abs(previous) * 100 : null,
      percentagePointChange: comparable && card.unit === 'percent' ? change : null
    };
    let status = 'unavailable';
    if (comparable) {
      status = 'comparable';
      if (previous === 0) {
        status = card.value === 0 ? 'both_zero' : 'new_activity';
      }
    }
    if (comparison.status !== status) {
      return helpers.error('any.invalid');
    }
    for (const [name, value] of Object.entries(expected)) {
      const actual = comparison[name];
      if (value === null ? actual !== null : actual === null || !Number.isFinite(value) ||
        Math.abs(actual - value) > 1e-9 * Math.max(1, Math.abs(value))) {
        return helpers.error('any.invalid');
      }
    }
  }

  return card;
}

const cardSchema = Joi.object({
  id: key.required(),
  metric: Joi.string().valid(...METRICS).required(),
  title: Joi.string().min(1).max(150).required(),
  value: Joi.number().allow(null).required(),
  unit: unit.required(),
  currencyCode: currency,
  status: metricStatus.required(),
  comparison: comparisonSchema
}).custom(validateCardConsistency);

function validateDatasetRows(dataset, helpers) {
  for (const row of dataset.rows) {
    if (Object.keys(row).some(k => !dataset.columns.some(c => c.key === k))) {
      return helpers.error('any.invalid');
    }
    for (const column of dataset.columns) {
      if (!Object.hasOwn(row, column.key)) {
        return helpers.error('any.invalid');
      }
      const value = row[column.key];
      if (value === null) {
        if (!column.nullable) {
          return helpers.error('any.invalid');
        }
        continue;
      }
      if (column.type === 'date') {
        if (typeof value !== 'string' || !moment(value, 'YYYY-MM-DD', true).isValid()) {
          return helpers.error('any.invalid');
        }
      } else if (typeof value !== column.type) {
        return helpers.error('any.invalid');
      }
    }
  }
  // An offset beyond the last result is a valid empty page, not an invented total.
  if (dataset.page && (dataset.rows.length > dataset.page.limit ||
    dataset.page.total !== null && dataset.rows.length > 0 &&
    dataset.page.offset + dataset.rows.length > dataset.page.total)) {
    return helpers.error('any.invalid');
  }

  return dataset;
}

const datasetSchema = Joi.object({
  id: key.required(),
  currencyCode: currency,
  columns: Joi.array().items(Joi.object({
    key: key.required(),
    label: Joi.string().min(1).max(150).required(),
    type: Joi.string().valid('string', 'number', 'date', 'boolean').required(),
    unit: Joi.when('type', {
      is: 'number',
      then: unit.required(),
      otherwise: Joi.forbidden()
    }),
    nullable: Joi.boolean().default(false)
  })).unique('key').min(1).max(30).required(),
  rows: Joi.array().items(Joi.object().pattern(key,
    Joi.alternatives().try(Joi.string().max(500), Joi.number(), Joi.boolean(),
    Joi.valid(null)))).max(1000).required(),
  page: Joi.object({
    offset: Joi.number().integer().min(0).required(),
    limit: Joi.number().integer().min(1).max(100).required(),
    total: Joi.number().integer().min(0).allow(null).required(),
    hasMore: Joi.boolean().required()
  })
}).custom(validateDatasetRows);
const blockSchema = Joi.alternatives().try(Joi.object({
  type: Joi.valid('text').required(),
  text: Joi.string().max(10000).required()
}), Joi.object({
  type: Joi.valid('number_card').required(),
  metricId: key.required()
}), Joi.object({
  type: Joi.valid('table').required(),
  title: Joi.string().max(150).required(),
  datasetId: key.required(),
  sortable: Joi.boolean().required()
}), Joi.object({
  type: Joi.string().valid('line', 'bar', 'grouped_bar', 'heatmap', 'donut').required(),
  title: Joi.string().max(150).required(),
  datasetId: key.required(),
  xKey: key.required(),
  yKeys: Joi.array().items(key).unique().min(1).max(5).required(),
  seriesKey: key,
  valueKey: key
}));

function validateReportConsistency(report, helpers) {
  if (!report.scope && report.category !== 'definition') {
    return helpers.error('any.invalid');
  }
  if (report.scope && report.category !== 'definition') {
    if (report.periods.length !== report.scope.profiles.length) {
      return helpers.error('any.invalid');
    }
    for (const profile of report.scope.profiles) {
      const periods = report.periods.find(p => p.profileId === profile.profileId);
      if (!periods || periods.timezone !== profile.timezone) {
        return helpers.error('any.invalid');
      }
      for (const window of [periods.current, periods.comparison].filter(Boolean)) {
        const start = moment(window.startAt).tz(profile.timezone);
        const end = moment(window.endBefore).tz(profile.timezone);
        const localStart = moment.tz(window.fromDate, 'YYYY-MM-DD', true, profile.timezone);
        if (start.valueOf() !== localStart.valueOf()) {
          return helpers.error('any.invalid');
        }
        const lastDate = window.isPartial ? end.format('YYYY-MM-DD') : end.clone().subtract(1, 'millisecond').format('YYYY-MM-DD');
        const localEnd = moment.tz(window.toDate, 'YYYY-MM-DD', true,
          profile.timezone).add(1, 'day').startOf('day');
        if (lastDate !== window.toDate || !window.isPartial &&
          end.valueOf() !== localEnd.valueOf()) {
          return helpers.error('any.invalid');
        }
        if (moment.utc(window.toDate).diff(moment.utc(window.fromDate), 'days') >= 366) {
          return helpers.error('any.invalid');
        }
      }
      if (periods.comparison) {
        const currentDays = moment.utc(periods.current.toDate).diff(moment.utc(periods.current.fromDate), 'days');
        const comparisonDays = moment.utc(periods.comparison.toDate).diff(moment.utc(periods.comparison.fromDate), 'days');
        if (Date.parse(periods.comparison.endBefore) > Date.parse(periods.current.startAt) || currentDays !== comparisonDays || periods.current.isPartial !== periods.comparison.isPartial) {
          return helpers.error('any.invalid');
        }
      }
    }
  }

  const currencies = report.scope?.currencyGroups.map(g => g.currencyCode) || [];
  for (const card of report.cards) {
    if (card.currencyCode && !currencies.includes(card.currencyCode)) {
      return helpers.error('any.invalid');
    }
    if (currencies.length > 1 && !card.currencyCode) {
      return helpers.error('any.invalid');
    }
  }
  for (const dataset of report.datasets) {
    if (dataset.currencyCode && !currencies.includes(dataset.currencyCode)) {
      return helpers.error('any.invalid');
    }
    if (currencies.length > 1 && dataset.columns.some(c => c.unit && c.unit !== 'count') &&
      !dataset.currencyCode) {
      return helpers.error('any.invalid');
    }
    if (dataset.columns.some(c => c.unit === 'currency') && !dataset.currencyCode) {
      return helpers.error('any.invalid');
    }
  }
  for (const block of report.blocks) {
    if (block.type === 'text') {
      continue;
    }
    if (block.type === 'number_card') {
      if (!report.cards.some(c => c.id === block.metricId)) {
        return helpers.error('any.invalid');
      }
      continue;
    }
    const dataset = report.datasets.find(d => d.id === block.datasetId);
    if (!dataset) {
      return helpers.error('any.invalid');
    }
    if (block.type === 'table') {
      if (dataset.rows.length > 100) {
        return helpers.error('any.invalid');
      }
      continue;
    }
    const names = [block.xKey, ...block.yKeys, block.seriesKey, block.valueKey].filter(Boolean);
    if (names.some(name => !dataset.columns.some(c => c.key === name))) {
      return helpers.error('any.invalid');
    }
    if (block.type === 'heatmap') {
      if (block.yKeys.length !== 1 || !block.valueKey ||
        dataset.columns.find(c => c.key === block.valueKey).type !== 'number') {
        return helpers.error('any.invalid');
      }
    } else {
      if (block.yKeys.some(name => dataset.columns.find(c => c.key === name).type !== 'number')) {
        return helpers.error('any.invalid');
      }
      const units = new Set(block.yKeys.map(name => dataset.columns.find(c => c.key === name).unit || 'unspecified'));
      if (units.size > 1) {
        return helpers.error('any.invalid');
      }
    }
    if (block.type === 'donut' && (block.yKeys.length !== 1 || dataset.rows.length > 5 ||
      dataset.rows.some(row => row[block.yKeys[0]] === null || row[block.yKeys[0]] < 0))) {
      return helpers.error('any.invalid');
    }
  }
  if (report.status === 'ok' && (report.freshness.status !== 'complete' ||
    report.freshness.missingInputs.length)) {
    return helpers.error('any.invalid');
  }
  if (report.status === 'ok' && report.cards.some(c => c.status === 'missing_data')) {
    return helpers.error('any.invalid');
  }
  if (report.status === 'ok' && report.category !== 'definition' &&
    (!report.freshness.dataAsOf || !report.freshness.sourceRefs.length)) {
    return helpers.error('any.invalid');
  }
  if (report.status === 'empty' && (report.freshness.status !== 'complete' ||
    !report.freshness.dataAsOf || !report.freshness.sourceRefs.length ||
    report.freshness.missingInputs.length)) {
    return helpers.error('any.invalid');
  }
  if (report.status === 'empty' && (report.cards.some(c => c.value !== null &&
    c.value !== 0) || report.datasets.some(d => d.rows.length))) {
    return helpers.error('any.invalid');
  }
  if (['unavailable', 'error'].includes(report.status) &&
    (report.cards.some(c => c.value !== null) || report.datasets.some(d => d.rows.length))) {
    return helpers.error('any.invalid');
  }
  for (const followUp of report.followUps) {
    if (followUp.request.profileIds.some(id => !report.scope?.profiles.some(profile => profile.profileId === id))) {
      return helpers.error('any.invalid');
    }
  }

  return report;
}

const responseSchema = Joi.object({
  schemaVersion: Joi.valid(VERSION).required(),
  reportId: Joi.string().min(1).max(120).required(),
  category: Joi.string().valid(...CATEGORIES).required(),
  dataOrigin: Joi.string().valid('synthetic', 'reporting').required(),
  fixtureLabel: Joi.when('dataOrigin', {
    is: 'synthetic',
    then: Joi.string().min(1).required(),
    otherwise: Joi.forbidden()
  }),
  status: Joi.string().valid('ok', 'empty', 'partial', 'unavailable', 'error').required(),
  scope: resolvedScopeSchema.allow(null).required(),
  periods: Joi.array().items(Joi.object({
    profileId: profileId.required(),
    timezone: timezone.required(),
    current: windowSchema.required(),
    comparison: windowSchema.allow(null).required()
  })).unique('profileId').max(20).required(),
  freshness: Joi.object({
    status: Joi.string().valid('complete', 'partial', 'stale', 'unknown',
      'unavailable').required(),
    dataAsOf: instant.allow(null).required(),
    sourceRefs: Joi.array().items(Joi.object({
      name: Joi.string().max(150).required(),
      importRunId: Joi.string().max(150),
      completedAt: instant.allow(null)
    })).max(50).required(),
    missingInputs: Joi.array().items(Joi.string().max(200)).max(50).required()
  }).required(),
  text: Joi.string().max(10000).required(),
  cards: Joi.array().items(cardSchema).unique('id').max(100).required(),
  datasets: Joi.array().items(datasetSchema).unique('id').max(20).required(),
  blocks: Joi.array().items(blockSchema).max(100).required(),
  warnings: Joi.array().items(Joi.string().max(500)).max(50).required(),
  followUps: Joi.array().items(Joi.object({
    label: Joi.string().max(150).required(),
    request: requestSchema.required()
  })).max(10).required()
}).custom(validateReportConsistency);

function validate(schema, input) {
  const {
    value,
    error
  } = schema.validate(input, validationOptions);
  if (error) {
    throw error;
  }

  return value;
}

// This checks consistency with supplied server-resolved metadata, not identity or
// database authorization. The scope service owns authenticated access checks.

function validateReportSelection(input, suppliedScope) {
  const request = validate(requestSchema, input);
  const scope = validate(resolvedScopeSchema, suppliedScope);
  for (const id of request.profileIds) {
    const profile = scope.profiles.find(p => p.profileId === id);
    if (!profile) {
      throw new RangeError('Requested profile is outside resolved report scope');
    }
    for (const type of request.adTypes) {
      if (!profile.adTypes.includes(type)) {
        throw new RangeError('Requested ad type is unavailable in resolved scope');
      }
      const dimensions = [...request.groupBy, request.entity?.dimension].filter(Boolean);
      if (dimensions.some(d => !profile.supportedDimensions[type].includes(d))) {
        throw new RangeError('Requested dimension is unavailable in resolved scope');
      }
    }
    if (request.filters.some(f => f.currencyCode && f.currencyCode !== profile.currencyCode)) {
      throw Object.assign(new RangeError('Money filter currency must match the profile; no implicit FX conversion'), {
        code: 'REPORT_CURRENCY_MISMATCH',
        currencyCode: profile.currencyCode,
      });
    }
  }
  if (request.entity?.dimension === 'profile' &&
    request.entity.ids.some(id => !request.profileIds.includes(id))) {
    throw new RangeError('Profile entity must belong to requested profile scope');
  }

  return {
    request,
    scope
  };
}

module.exports = {
  VERSION,
  CATEGORIES,
  METRICS,
  DIMENSIONS,
  UNITS,
  requestSchema,
  resolvedScopeSchema,
  responseSchema,
  validateReportRequest: input => validate(requestSchema, input),
  validateResolvedScope: input => validate(resolvedScopeSchema, input),
  validateReportResponse: input => validate(responseSchema, input),
  validateReportSelection
};
