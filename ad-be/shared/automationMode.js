/**
 * Helper to coordinate migration between legacy node-cron schedulers and BullMQ queues.
 * Execution modes:
 * - "legacy": Legacy worker crons execute migrated tasks directly (default).
 * - "queue": BullMQ producer & workers execute migrated tasks. Legacy workers skip them.
 * - "shadow": Shadow evaluation / dry-run mode.
 */

const MIGRATED_TASKS = new Set([
  // Rule families
  "BudgetRuleSchedules",
  "TargetingRuleSchedules",
  "PlacementRuleSchedules",
  "DaypartingRuleSchedules",
  // Hourly sync chain
  "CampaignListing",
  "AdGroupsListing",
  "TargetingListing",
  "ProductAdsListing",
  "CampaignReport",
  "AdGroupReport",
  "TargetingReport",
  "ProductAdsReport",
  "PlacementReport",
  "SearchTermReport",
  // Periodic report suites & batch writer
  "BiWeeklyReport",
  "WeeklyReport",
  "ReportBatchWriter",
  // Nightly data consolidation
  "HourlyDataConsolidation",
  // SP-API tasks migrated to sp-api-queue
  "SyncOrder",
  "OrderListing",
  "SyncInventory",
  "DetectDeadInventory",
  "MonitorInventory",
  "InventoryForecastAlerts",
  "BrandAnalyticsReport",
  "CompetitorAnalysis",
  "APlusContentSync",
  "AccountDataCleanup",
  "ReportFileCleanup",
  "TransactionsReconciliation",
  "SyncDealsDashboard",
  "SyncCoupons",
  "SalesReport",
  "ReimbursementReport",
  "ShipmentQueueReport",
  "ReminderForReimbursement",
  "BestPerformerReport",
  "KeywordAnalysisReport",
  "BestSellerRank",
  "ProductsListing",
  "ProductsMetaListing",
  "SyncPastData",
]);

function getAutomationExecutionMode() {
  return (process.env.AUTOMATION_EXECUTION_MODE || "legacy").toLowerCase().trim();
}

function isQueueModeEnabled() {
  return getAutomationExecutionMode() === "queue";
}

function isShadowModeEnabled() {
  return getAutomationExecutionMode() === "shadow";
}

function isMigratedTask(taskName) {
  if (!taskName) return false;
  const cleanName = taskName.replace(/\s+/g, "");
  return MIGRATED_TASKS.has(cleanName);
}

/**
 * Checks whether a legacy worker should execute a task.
 * If AUTOMATION_EXECUTION_MODE is 'queue' and the task has been migrated, legacy should NOT run it.
 */
function shouldLegacyExecute(taskName) {
  if (isQueueModeEnabled() && isMigratedTask(taskName)) {
    return false;
  }
  return true;
}

module.exports = {
  MIGRATED_TASKS,
  getAutomationExecutionMode,
  isQueueModeEnabled,
  isShadowModeEnabled,
  isMigratedTask,
  shouldLegacyExecute,
};
