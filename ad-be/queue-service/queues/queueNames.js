const QUEUES = Object.freeze({
  RULES: "rules-queue",
  HOURLY_SYNC: "hourly-sync-queue",
  SP_API: "sp-api-queue",
});

const RULE_TASKS = Object.freeze({
  BUDGET: "budget-rules",
  TARGETING: "targeting-rules",
  PLACEMENT: "placement-rules",
  DAYPARTING: "dayparting-rules",
});

const SYNC_TASKS = Object.freeze({
  CAMPAIGN_LISTING: "campaign-listing",
  ADGROUP_LISTING: "adgroup-listing",
  TARGETING_LISTING: "targeting-listing",
  PRODUCT_ADS_LISTING: "product-ads-listing",
  CAMPAIGN_REPORT: "campaign-report",
  ADGROUP_REPORT: "adgroup-report",
  TARGETING_REPORT: "targeting-report",
  PRODUCT_ADS_REPORT: "product-ads-report",
  PLACEMENT_REPORT: "placement-report",
  SEARCH_TERM_REPORT: "search-term-report",
  BIWEEKLY_REPORT: "biweekly-report",
  WEEKLY_REPORT: "weekly-report",
  REPORT_BATCH_WRITER: "report-batch-writer",
  HOURLY_DATA_CONSOLIDATION: "hourly-data-consolidation",
});

const SP_API_TASKS = Object.freeze({
  SYNC_ORDER: "sync-order",
  ORDER_LISTING: "order-listing",
  SYNC_INVENTORY: "sync-inventory",
  DETECT_DEAD_INVENTORY: "detect-dead-inventory",
  MONITOR_INVENTORY: "monitor-inventory",
  INVENTORY_FORECAST_ALERTS: "inventory-forecast-alerts",
  BRAND_ANALYTICS_REPORT: "brand-analytics-report",
  COMPETITOR_ANALYSIS: "competitor-analysis",
  APLUS_CONTENT_SYNC: "aplus-content-sync",
  ACCOUNT_DATA_CLEANUP: "account-data-cleanup",
  REPORT_FILE_CLEANUP: "report-file-cleanup",
  TRANSACTIONS_RECONCILIATION: "transactions-reconciliation",
  SYNC_DEALS_DASHBOARD: "sync-deals-dashboard",
  SYNC_COUPONS: "sync-coupons",
  SALES_REPORT: "sales-report",
  REIMBURSEMENT_REPORT: "reimbursement-report",
  SHIPMENT_QUEUE_REPORT: "shipment-queue-report",
  REMINDER_FOR_REIMBURSEMENT: "reminder-for-reimbursement",
  BEST_PERFORMER_REPORT: "best-performer-report",
  KEYWORD_ANALYSIS_REPORT: "keyword-analysis-report",
  BEST_SELLER_RANK: "best-seller-rank",
  PRODUCTS_LISTING: "products-listing",
  PRODUCTS_META_LISTING: "products-meta-listing",
  SYNC_PAST_DATA: "sync-past-data",
});

module.exports = {
  QUEUES,
  RULE_TASKS,
  SYNC_TASKS,
  SP_API_TASKS,
};
