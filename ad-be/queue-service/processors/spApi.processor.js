const { validateJobPayload } = require("../contracts/jobPayload");
const { SP_API_TASKS } = require("../queues/queueNames");
const { isShadowModeEnabled } = require("../../shared/automationMode");
const { cron_logs } = require("../../winston/cronAutomation/logger");

function createSpApiProcessor() {
  return async function spApiProcessor(job) {
    const validated = validateJobPayload(job.data);
    const { task, scheduledFor, timeBlock } = validated;

    if (isShadowModeEnabled()) {
      return {
        success: true,
        task,
        dryRun: true,
        message: `Shadow mode enabled: skipped ${task}`,
      };
    }

    const startTime = Date.now();
    cron_logs({
      message: `[SpApiProcessor] Started task "${task}" (jobId: ${job.id}, timeBlock: ${timeBlock})`,
      log_type: "info",
    });

    try {
      let result = null;

      switch (task) {
        case SP_API_TASKS.SYNC_ORDER: {
          const { cronGenerateTransactionsReport } = require("../../api-server/controllers/transactions.controller");
          const { cronGenerateOrderReport, cronGenerateRefundReport } = require("../../api-server/controllers/order.controller");
          result = {
            transactions: await cronGenerateTransactionsReport(),
            orders: await cronGenerateOrderReport(),
            refunds: await cronGenerateRefundReport(),
          };
          break;
        }

        case SP_API_TASKS.ORDER_LISTING: {
          const { cronGenerateOrderListing } = require("../../api-server/controllers/order.controller");
          result = await cronGenerateOrderListing();
          break;
        }

        case SP_API_TASKS.SYNC_INVENTORY: {
          const { cronGenerateInvetoryReport } = require("../../api-server/controllers/inventory.controller");
          result = await cronGenerateInvetoryReport();
          break;
        }

        case SP_API_TASKS.DETECT_DEAD_INVENTORY: {
          const { cronDetectDeadInventory } = require("../../api-server/controllers/inventory.controller");
          result = await cronDetectDeadInventory();
          break;
        }

        case SP_API_TASKS.MONITOR_INVENTORY: {
          const { monitorInventory } = require("../../api-server/controllers/order.controller");
          result = await monitorInventory();
          break;
        }

        case SP_API_TASKS.INVENTORY_FORECAST_ALERTS: {
          const { cronInventoryForecastAlerts } = require("../../api-server/controllers/inventory.controller");
          result = await cronInventoryForecastAlerts();
          break;
        }

        case SP_API_TASKS.BRAND_ANALYTICS_REPORT: {
          const { cronBrandAnalytics } = require("../../api-server/controllers/brandAnalytics.controller");
          result = await cronBrandAnalytics();
          break;
        }

        case SP_API_TASKS.COMPETITOR_ANALYSIS: {
          const { cronFetchCompetitorsFromAmazon } = require("../../api-server/controllers/products.controller");
          result = await cronFetchCompetitorsFromAmazon();
          break;
        }

        case SP_API_TASKS.APLUS_CONTENT_SYNC: {
          const { cronFetchAPlusContentFromAmazon } = require("../../api-server/controllers/aplusContent.controller");
          result = await cronFetchAPlusContentFromAmazon();
          break;
        }

        case SP_API_TASKS.ACCOUNT_DATA_CLEANUP: {
          const { cronDeleteExpiredAccountsData } = require("../../api-server/services/accountDataCleanup.service");
          result = await cronDeleteExpiredAccountsData();
          break;
        }

        case SP_API_TASKS.REPORT_FILE_CLEANUP: {
          const { cronDeleteOldReportFiles } = require("../../api-server/services/reportCleanup.service");
          result = await cronDeleteOldReportFiles(15);
          break;
        }

        case SP_API_TASKS.TRANSACTIONS_RECONCILIATION: {
          const txController = require("../../api-server/controllers/transactions.controller");
          if (typeof txController.cronReconcileTransactions === "function") {
            result = await txController.cronReconcileTransactions();
          } else {
            result = { skipped: true, reason: "No handler registered" };
          }
          break;
        }

        case SP_API_TASKS.SYNC_DEALS_DASHBOARD: {
          const { cronSyncDealPerformance } = require("../../api-server/controllers/deals.controller");
          result = await cronSyncDealPerformance();
          break;
        }

        case SP_API_TASKS.SYNC_COUPONS: {
          const { cronListCouponFromAmazon } = require("../../api-server/controllers/coupon.controller");
          result = await cronListCouponFromAmazon();
          break;
        }

        case SP_API_TASKS.SALES_REPORT: {
          const { cronGenerateSalesReport } = require("../../api-server/controllers/inventory.controller");
          result = await cronGenerateSalesReport();
          break;
        }

        case SP_API_TASKS.REIMBURSEMENT_REPORT: {
          const { cronGenerateReimbursementReport } = require("../../api-server/controllers/reconciliationReimbursement.controller");
          result = await cronGenerateReimbursementReport();
          break;
        }

        case SP_API_TASKS.SHIPMENT_QUEUE_REPORT: {
          const { cronGenerateShipmentQueueReport } = require("../../api-server/controllers/reconciliationReimbursement.controller");
          result = await cronGenerateShipmentQueueReport();
          break;
        }

        case SP_API_TASKS.REMINDER_FOR_REIMBURSEMENT: {
          const { cronReminderForReimbursement } = require("../../api-server/controllers/reconciliationReimbursement.controller");
          result = await cronReminderForReimbursement();
          break;
        }

        case SP_API_TASKS.BEST_PERFORMER_REPORT: {
          const { cronBestPerformerGoogleReportGenerate } = require("../../api-server/controllers/google.controller");
          result = await cronBestPerformerGoogleReportGenerate();
          break;
        }

        case SP_API_TASKS.KEYWORD_ANALYSIS_REPORT: {
          const { cronKeywordAnalysisReportGenerate } = require("../../api-server/controllers/google.controller");
          result = await cronKeywordAnalysisReportGenerate();
          break;
        }

        case SP_API_TASKS.BEST_SELLER_RANK: {
          const { cronBestSellerRank } = require("../../api-server/controllers/order.controller");
          result = await cronBestSellerRank();
          break;
        }

        case SP_API_TASKS.PRODUCTS_LISTING: {
          const { SyncProductListing } = require("../../api-server/controllers/order.controller");
          result = await SyncProductListing();
          break;
        }

        case SP_API_TASKS.PRODUCTS_META_LISTING: {
          const { cronListProductFromAmazon } = require("../../api-server/controllers/productAds.controller");
          result = await cronListProductFromAmazon();
          break;
        }

        case SP_API_TASKS.SYNC_PAST_DATA: {
          const { SyncPastData } = require("../../api-server/controllers/config.controller");
          result = await SyncPastData();
          break;
        }

        default:
          throw new Error(`Unsupported SP-API task: "${task}"`);
      }

      const durationMs = Date.now() - startTime;
      cron_logs({
        message: `[SpApiProcessor] Completed task "${task}" in ${durationMs}ms`,
        log_type: "info",
      });

      return {
        success: true,
        task,
        durationMs,
        result,
      };
    } catch (err) {
      cron_logs({
        message: `[SpApiProcessor] Failed task "${task}": ${err.message}`,
        log_type: "error",
      });
      throw err;
    }
  };
}

module.exports = {
  createSpApiProcessor,
};
