'use strict';

// Shared category configuration and labels; this module performs no reads.
const REPORT_HANDLERS = Object.freeze({
  summary: {
    dimensions: ['profile', 'date', 'campaign', 'placement', 'keyword', 'target', 'search_term', 'ad_group'],
    defaults: ['profile'],
    source: 'daily'
  },
  comparison: {
    dimensions: ['profile', 'date', 'campaign', 'placement', 'keyword', 'target', 'search_term', 'ad_group'],
    defaults: ['profile'],
    source: 'daily'
  },
  change: {
    dimensions: ['profile', 'campaign', 'keyword', 'target', 'search_term', 'placement'],
    defaults: ['campaign'],
    source: 'daily'
  },
  waste: {
    dimensions: ['campaign', 'ad_group', 'keyword', 'target', 'search_term', 'placement'],
    defaults: ['campaign'],
    source: 'daily'
  },
  growth: {
    dimensions: ['campaign', 'keyword', 'target', 'search_term'],
    defaults: ['search_term'],
    source: 'daily'
  },
  time: {
    dimensions: ['hour', 'weekday', 'date'],
    defaults: ['weekday', 'hour'],
    source: 'special'
  },
  products: {
    dimensions: ['product', 'campaign', 'date'],
    defaults: ['product'],
    source: 'special'
  },
  rules: {
    dimensions: ['rule'],
    defaults: ['rule'],
    source: 'special'
  },
  unusual: {
    dimensions: ['profile', 'campaign', 'date'],
    defaults: ['campaign'],
    source: 'daily'
  },
  definition: {
    dimensions: [],
    defaults: [],
    source: 'glossary'
  }
});
const METRIC_UNITS = {
  spend: 'currency',
  sales: 'currency',
  orders: 'count',
  clicks: 'count',
  impressions: 'count',
  acos: 'percent',
  roas: 'multiple',
  cpc: 'currency',
  cvr: 'percent',
  ctr: 'percent',
  aov: 'currency',
  tacos: 'percent',
  profit: 'currency',
  stock: 'count',
  days_of_stock: 'count'
};
const DIMENSION_FIELDS = {
  profile: 'profileId',
  campaign: 'campaignId',
  ad_group: 'adGroupId',
  keyword: 'keywordId',
  target: 'targetId',
  search_term: 'searchTerm',
  placement: 'placement',
  date: 'date',
  hour: 'hour',
  weekday: 'weekday',
  product: 'productId',
  rule: 'ruleId'
};
const DEFINITIONS = {
  spend: 'Spend is the imported advertising cost for the selected reporting scope.',
  sales: 'Sales are attributed advertising sales. They exclude organic sales and can mature within the attribution window.',
  orders: 'Orders are attributed orders, not the number of units sold.',
  clicks: 'Clicks count recorded ad clicks.',
  impressions: 'Impressions count recorded ad displays.',
  acos: 'ACOS = advertising spend / attributed advertising sales × 100. Whether an ACOS is good depends on your margin or target; no category benchmark is assumed.',
  roas: 'ROAS = attributed advertising sales / advertising spend.',
  cpc: 'CPC = advertising spend / clicks.',
  cvr: 'Conversion rate = attributed orders / clicks × 100.',
  ctr: 'Click-through rate = clicks / impressions × 100.',
  aov: 'Average order value = attributed advertising sales / attributed orders.',
  tacos: 'TACOS = advertising spend / total sales including organic sales × 100. Advertising sales alone cannot supply this denominator.',
  profit: 'Profit after ads requires sales, product costs, fees and ad spend on a consistent basis. Missing costs are unknown, not zero.',
  stock: 'Stock means the available sellable inventory from a dated inventory source. Missing inventory is unknown, not zero.',
  days_of_stock: 'Days of stock estimates how long sellable stock will last at a declared sales rate; it requires current inventory and sufficient sales history.'
};
module.exports = {
  REPORT_HANDLERS,
  METRIC_UNITS,
  DIMENSION_FIELDS,
  DEFINITIONS
};
