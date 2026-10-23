const { QUEUES, RULE_TASKS, SYNC_TASKS, SP_API_TASKS } = require("../queues/queueNames");

const CRON_NAME_MAP = Object.freeze({
  // Rule families
  "budgetruleschedules": { queue: QUEUES.RULES, task: RULE_TASKS.BUDGET, family: "rules" },
  "targetingruleschedules": { queue: QUEUES.RULES, task: RULE_TASKS.TARGETING, family: "rules" },
  "placementruleschedules": { queue: QUEUES.RULES, task: RULE_TASKS.PLACEMENT, family: "rules" },
  "daypartingruleschedules": { queue: QUEUES.RULES, task: RULE_TASKS.DAYPARTING, family: "rules" },

  // Hourly sync chain
  "campaignlisting": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.CAMPAIGN_LISTING, family: "sync" },
  "adgroupslisting": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.ADGROUP_LISTING, family: "sync" },
  "adgrouplisting": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.ADGROUP_LISTING, family: "sync" },
  "targetinglisting": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.TARGETING_LISTING, family: "sync" },
  "productadslisting": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.PRODUCT_ADS_LISTING, family: "sync" },
  "campaignreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.CAMPAIGN_REPORT, family: "sync" },
  "adgroupreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.ADGROUP_REPORT, family: "sync" },
  "targetingreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.TARGETING_REPORT, family: "sync" },
  "productadsreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.PRODUCT_ADS_REPORT, family: "sync" },
  "placementreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.PLACEMENT_REPORT, family: "sync" },
  "searchtermreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.SEARCH_TERM_REPORT, family: "sync" },
  "biweeklyreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.BIWEEKLY_REPORT, family: "sync" },
  "weeklyreport": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.WEEKLY_REPORT, family: "sync" },
  "reportbatchwriter": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.REPORT_BATCH_WRITER, family: "sync" },
  "hourlydataconsolidation": { queue: QUEUES.HOURLY_SYNC, task: SYNC_TASKS.HOURLY_DATA_CONSOLIDATION, family: "sync" },

  // SP-API tasks (heavy / periodic)
  "syncorder": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_ORDER, family: "sp-api" },
  "orderlisting": { queue: QUEUES.SP_API, task: SP_API_TASKS.ORDER_LISTING, family: "sp-api" },
  "syncinventory": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_INVENTORY, family: "sp-api" },
  "detectdeadinventory": { queue: QUEUES.SP_API, task: SP_API_TASKS.DETECT_DEAD_INVENTORY, family: "sp-api" },
  "monitorinventory": { queue: QUEUES.SP_API, task: SP_API_TASKS.MONITOR_INVENTORY, family: "sp-api" },
  "inventoryforecastalerts": { queue: QUEUES.SP_API, task: SP_API_TASKS.INVENTORY_FORECAST_ALERTS, family: "sp-api" },
  "brandanalyticsreport": { queue: QUEUES.SP_API, task: SP_API_TASKS.BRAND_ANALYTICS_REPORT, family: "sp-api" },
  "brandanalytics": { queue: QUEUES.SP_API, task: SP_API_TASKS.BRAND_ANALYTICS_REPORT, family: "sp-api" },
  "competitoranalysis": { queue: QUEUES.SP_API, task: SP_API_TASKS.COMPETITOR_ANALYSIS, family: "sp-api" },
  "apluscontentsync": { queue: QUEUES.SP_API, task: SP_API_TASKS.APLUS_CONTENT_SYNC, family: "sp-api" },
  "accountdatacleanup": { queue: QUEUES.SP_API, task: SP_API_TASKS.ACCOUNT_DATA_CLEANUP, family: "sp-api" },
  "reportfilecleanup": { queue: QUEUES.SP_API, task: SP_API_TASKS.REPORT_FILE_CLEANUP, family: "sp-api" },
  "transactionsreconciliation": { queue: QUEUES.SP_API, task: SP_API_TASKS.TRANSACTIONS_RECONCILIATION, family: "sp-api" },
  "syncdealsdashboard": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_DEALS_DASHBOARD, family: "sp-api" },
  "dealsdashboard": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_DEALS_DASHBOARD, family: "sp-api" },
  "synccoupons": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_COUPONS, family: "sp-api" },
  "coupons": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_COUPONS, family: "sp-api" },
  "salesreport": { queue: QUEUES.SP_API, task: SP_API_TASKS.SALES_REPORT, family: "sp-api" },
  "reimbursementreport": { queue: QUEUES.SP_API, task: SP_API_TASKS.REIMBURSEMENT_REPORT, family: "sp-api" },
  "shipmentqueuereport": { queue: QUEUES.SP_API, task: SP_API_TASKS.SHIPMENT_QUEUE_REPORT, family: "sp-api" },
  "reminderforreimbursement": { queue: QUEUES.SP_API, task: SP_API_TASKS.REMINDER_FOR_REIMBURSEMENT, family: "sp-api" },
  "bestperformerreport": { queue: QUEUES.SP_API, task: SP_API_TASKS.BEST_PERFORMER_REPORT, family: "sp-api" },
  "keywordanalysisreport": { queue: QUEUES.SP_API, task: SP_API_TASKS.KEYWORD_ANALYSIS_REPORT, family: "sp-api" },
  "bestsellerrank": { queue: QUEUES.SP_API, task: SP_API_TASKS.BEST_SELLER_RANK, family: "sp-api" },
  "productslisting": { queue: QUEUES.SP_API, task: SP_API_TASKS.PRODUCTS_LISTING, family: "sp-api" },
  "productsmetalisting": { queue: QUEUES.SP_API, task: SP_API_TASKS.PRODUCTS_META_LISTING, family: "sp-api" },
  "syncpastdata": { queue: QUEUES.SP_API, task: SP_API_TASKS.SYNC_PAST_DATA, family: "sp-api" },
});

/**
 * Resolves a Mongo cronJob record to its BullMQ queue and task target.
 * Returns null if the cronJob is not part of the migrated set.
 *
 * @param {string} cronName
 * @returns {{ queue: string, task: string, family: 'rules'|'sync'|'sp-api' } | null}
 */
function resolveMigratedSchedule(cronName) {
  if (!cronName) return null;
  const normalized = cronName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return CRON_NAME_MAP[normalized] || null;
}

module.exports = {
  resolveMigratedSchedule,
  CRON_NAME_MAP,
};
