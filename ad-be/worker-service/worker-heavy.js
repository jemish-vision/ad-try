const pLimit = require("p-limit").default;
const cron = require("node-cron");
const mongoose = require("mongoose");

require("../shared/connection");

const { cronGenerateCampaignReport } = require("../api-server/controllers/campaign.controller");
const { cronGenerateAdGroupReport } = require("../api-server/controllers/adGroups.controller");
const { cronGenerateAdProductReport, cronListProductAdsFromAmazon, cronListProductFromAmazon } = require("../api-server/controllers/productAds.controller");
const { cronGeneratePlacementReport } = require("../api-server/controllers/placement.controller");
const { cronGenerateSearchTermReport } = require("../api-server/controllers/searchTerm.controller");
const { cronGenerateTargetingReport } = require("../api-server/controllers/targeting.controller");
const { cronGenerateOrderReport, cronGenerateRefundReport, cronBestSellerRank, monitorInventory, SyncProductListing } = require("../api-server/controllers/order.controller");
const { SyncPastData } = require("../api-server/controllers/config.controller");
const { cronGenerateTransactionsReport, cronReconcileTransactions } = require("../api-server/controllers/transactions.controller");
const { cronFetchAPlusContentFromAmazon } = require("../api-server/controllers/aplusContent.controller");
const { cronDeleteExpiredAccountsData } = require("../api-server/services/accountDataCleanup.service");
const { cronDeleteOldReportFiles } = require("../api-server/services/reportCleanup.service");
const { cronBrandAnalytics } = require("../api-server/controllers/brandAnalytics.controller");
const { cronFetchCompetitorsFromAmazon } = require("../api-server/controllers/products.controller");
const { cronGenerateInvetoryReport, cronDetectDeadInventory, cronInventoryForecastAlerts } = require("../api-server/controllers/inventory.controller");
const { cronSyncDealPerformance } = require("../api-server/controllers/deals.controller");
const { cronBestPerformerGoogleReportGenerate, cronKeywordAnalysisReportGenerate } = require("../api-server/controllers/google.controller");
const { cronConsolidateHourlyData } = require("../api-server/services/hourlyDataConsolidation.service");
const { pingHeartbeat, sendThrottledCronAlert } = require("../api-server/helper/heartbeat.helper");

const cronJobSchema = require("../api-server/models/cronJob.model");
const { cron_logs } = require("../winston/cronAutomation/logger");
const { shouldLegacyExecute, getAutomationExecutionMode } = require("../shared/automationMode");
const CRON_JOBS = require("./cronJobs.enum");

const jobStore = {};
let cronChangeStream;
let lastResumeToken = null;
let restarting = false;
const GLOBAL_LIMIT = pLimit(Math.max(1, Number(process.env.WORKER_HEAVY_PROCESS_LIMIT || process.env.PROCESS_LIMIT) || 2));

const taskHandlers = {
    SyncOrder: async () => {
        await runJobSafely(CRON_JOBS.TRANSACTION_REPORT, cronGenerateTransactionsReport);
        await runJobSafely(CRON_JOBS.SYNC_ORDER, cronGenerateOrderReport);
        await runJobSafely(CRON_JOBS.REFUND_REPORT, cronGenerateRefundReport);
    },
    SyncPastData: async () => { await runJobSafely("Sync Past Data", SyncPastData); },
    WeeklyReport: async () => {
        await runJobSafely("Weekly Report", async () => {
            await cronGenerateCampaignReport(true);
            await cronGenerateAdGroupReport(true);
            await cronGenerateTargetingReport(true);
            await cronGenerateAdProductReport(true);
            await cronGeneratePlacementReport(true);
            await cronGenerateSearchTermReport(true);
        });
    },
    BiWeeklyReport: async () => {
        await runJobSafely("BiWeekly Report", async () => {
            await cronGenerateCampaignReport(false, true);
            await cronGenerateAdGroupReport(false, true);
            await cronGenerateTargetingReport(false, true);
            await cronGenerateAdProductReport(false, true);
            await cronGeneratePlacementReport(false, true);
            await cronGenerateSearchTermReport(false, true);
        });
    },
    APlusContentSync: async () => { await runJobSafely(CRON_JOBS.APLUS_CONTENT_SYNC, cronFetchAPlusContentFromAmazon); },
    AccountDataCleanup: async () => { await runJobSafely("Account Data Cleanup", cronDeleteExpiredAccountsData); },
    ReportFileCleanup: async () => { await runJobSafely("Report File Cleanup", async () => { await cronDeleteOldReportFiles(15); }); },
    BrandAnalyticsReport: async () => { await runJobSafely(CRON_JOBS.BRAND_ANALYTICS_REPORT, cronBrandAnalytics); },
    TransactionsReconciliation: async () => { await runJobSafely("Transactions Reconciliation", cronReconcileTransactions); },
    CompetitorAnalysis: async () => { await runJobSafely(CRON_JOBS.COMPETITOR_ANALYSIS, cronFetchCompetitorsFromAmazon); },
    SyncInventory: async () => { await runJobSafely(CRON_JOBS.SYNC_INVENTORY, cronGenerateInvetoryReport); },
    DetectDeadInventory: async () => { await runJobSafely(CRON_JOBS.DETECT_DEAD_INVENTORY, cronDetectDeadInventory); },
    SyncDealsDashboard: async () => { await runJobSafely(CRON_JOBS.SYNC_DEALS_DASHBOARD, cronSyncDealPerformance); },
    InventoryForecastAlerts: async () => { await runJobSafely("Inventory Forecast Alerts", cronInventoryForecastAlerts); },
    BestPerformerReport: async () => { await runJobSafely(CRON_JOBS.BEST_PERFORMER_REPORT, cronBestPerformerGoogleReportGenerate); },
    KeywordAnalysisReport: async () => { await runJobSafely(CRON_JOBS.KEYWORD_ANALYSIS_REPORT, cronKeywordAnalysisReportGenerate); },
    BestSellerRank: async () => { await runJobSafely("Best Seller Rank", cronBestSellerRank); },
    MonitorInventory: async () => { await runJobSafely("Monitor Inventory", monitorInventory); },
    ProductAdsListing: async () => { await runJobSafely(CRON_JOBS.PRODUCT_ADS_LISTING, cronListProductAdsFromAmazon); },
    ProductsListing: async () => { await runJobSafely(CRON_JOBS.PRODUCTS_LISTING, SyncProductListing); },
    ProductsMetaListing: async () => { await runJobSafely(CRON_JOBS.PRODUCTS_META_LISTING, cronListProductFromAmazon); },
    HourlyDataConsolidation: async () => { await runJobSafely(CRON_JOBS.HOURLY_DATA_CONSOLIDATION, cronConsolidateHourlyData); },
};

const running = new Set();

const JOB_TIMEOUT_MS = {
    default: 2 * 60 * 60 * 1000,
    BrandAnalyticsReport: 6 * 60 * 60 * 1000,
    SyncPastData: 4 * 60 * 60 * 1000,
    SyncOrder: 3 * 60 * 60 * 1000,
    WeeklyReport: 3 * 60 * 60 * 1000,
    BiWeeklyReport: 4 * 60 * 60 * 1000,
    TransactionsReconciliation: 3 * 60 * 60 * 1000,
    HourlyDataConsolidation: 3 * 60 * 60 * 1000,
};

const withTimeout = (promise, ms, name) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job ${name} exceeded ${ms}ms timeout`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

function scheduleJobs(jobList) {
    jobList.forEach(job => {
        let taskName = job.cronName.replace(/\s+/g, "");
        if (!shouldLegacyExecute(taskName)) {
            cron_logs({
                message: `[worker-heavy] Task ${taskName} migrated to BullMQ queue (mode: ${getAutomationExecutionMode()}). Skipping legacy schedule.`,
                log_type: "info",
            });
            return;
        }
        if (!taskHandlers[taskName]) return;

        if (jobStore[taskName]) {
            jobStore[taskName].stop();
            delete jobStore[taskName];
            cron_logs({ message: `[worker-heavy] Restarted job schedule: ${taskName}`, log_type: "info" });
        }

        const scheduledJob = cron.schedule(
            job.cronExpression,
            async () => {
                if (running.has(taskName)) {
                    cron_logs({ message: `[worker-heavy] SKIP ${taskName}: previous heavy run still active`, log_type: "warn" });
                    return;
                }

                running.add(taskName);
                const startedAt = Date.now();
                const timeoutMs = JOB_TIMEOUT_MS[taskName] ?? JOB_TIMEOUT_MS.default;

                try {
                    await GLOBAL_LIMIT(() =>
                        runJobSafely(taskName, () => withTimeout(Promise.resolve(taskHandlers[taskName]()), timeoutMs, taskName))
                    );
                } finally {
                    running.delete(taskName);
                    cron_logs({ message: `[worker-heavy] ${taskName} finished in ${Date.now() - startedAt}ms`, log_type: "info" });
                }
            }
        );

        jobStore[taskName] = scheduledJob;
        cron_logs({ message: `[worker-heavy] Scheduled: ${taskName} → [${job.cronExpression}]`, log_type: "info" });
    });
}

const runJobSafely = async (taskName, fn) => {
    if (typeof fn !== "function") {
        const error = new Error(`Handler for "${taskName}" is not callable.`);
        cron_logs({ message: `[worker-heavy] Failed: ${taskName}, Error:${error}`, log_type: "error" });
        await sendThrottledCronAlert(taskName, error);
        return;
    }
    try {
        cron_logs({ message: `[worker-heavy] Started: ${taskName}`, log_type: "info" });
        await fn();
        cron_logs({ message: `[worker-heavy] Completed: ${taskName}`, log_type: "info" });
    } catch (error) {
        cron_logs({ message: `[worker-heavy] Failed: ${taskName}, Error:${error}`, log_type: "error" });
        await sendThrottledCronAlert(taskName, error);
    }
};

let failureCount = 0;
const MAX_FAILURES = 5;

const startCronChangeStream = () => {
    if (mongoose.connection.readyState !== 1) {
        mongoose.connection.once("connected", () => startCronChangeStream());
        return;
    }

    if (failureCount >= MAX_FAILURES) return;

    cron_logs({ message: "[worker-heavy] starting cron ChangeStream...", log_type: "info" });

    try {
        const options = { fullDocument: "updateLookup" };
        if (lastResumeToken) options.resumeAfter = lastResumeToken;

        cronChangeStream = cronJobSchema.watch([], options);

        cronChangeStream.on("change", async (data) => {
            failureCount = 0;
            try {
                lastResumeToken = data._id;
                if (!data?.documentKey?._id) return;
                const updated = data.fullDocument;
                if (!updated) return;

                const fields = Object.keys(data.updateDescription?.updatedFields || {});
                const isScheduleChange = fields.some((f) => ["cronExpression", "isActive"].includes(f));
                if (!isScheduleChange) return;

                cron_logs({ message: `[worker-heavy] ChangeStream detected schedule change, restarting job: ${updated.cronName}`, log_type: "info" });
                scheduleJobs([{ cronName: updated.cronName, cronExpression: updated.cronExpression }]);
            } catch (err) {
                cron_logs({ message: `[worker-heavy] change handler error: ${err.message}`, log_type: "error" });
            }
        });

        cronChangeStream.on("error", handleStreamFailure);
        cronChangeStream.on("close", handleStreamFailure);
    } catch (err) {
        handleStreamFailure(err);
    }
};

const handleStreamFailure = async (err) => {
    if (restarting) return;
    restarting = true;
    failureCount++;

    cron_logs({ message: `[worker-heavy] Restarting cron ChangeStream (attempt ${failureCount})...`, log_type: "warn" });

    try {
        if (cronChangeStream) {
            await cronChangeStream.close().catch(() => { });
            cronChangeStream.removeAllListeners();
            cronChangeStream = null;
        }
    } catch (_) { }

    if (failureCount < MAX_FAILURES) {
        setTimeout(() => {
            restarting = false;
            startCronChangeStream();
        }, 10000);
    }
};

const waitForDbConnection = () => {
    return new Promise((resolve) => {
        if (mongoose.connection.readyState === 1) return resolve();
        mongoose.connection.once("connected", resolve);
    });
};

(async () => {
    await waitForDbConnection();

    cron_logs({ message: "[worker-heavy] Worker Heavy service started", log_type: "info" });

    try {
        await pingHeartbeat("worker-heavy");
        setInterval(() => pingHeartbeat("worker-heavy"), 60 * 1000);
    } catch (hbErr) {
        cron_logs({ message: `[worker-heavy] Heartbeat error: ${hbErr.message}`, log_type: "error" });
    }

    let jobs = await cronJobSchema.find({ isActive: true }).lean();
    jobs.push({ cronName: "TransactionsReconciliation", cronExpression: "0 0 4 1 * *" });
    jobs.push({ cronName: "HourlyDataConsolidation", cronExpression: "0 30 2 * * *" }); // Night job at 2:30 AM

    cron_logs({ message: `[worker-heavy] Schedule Heavy Job Called with ${jobs.length} Jobs.`, log_type: "info" });

    scheduleJobs(jobs);
    startCronChangeStream();
})();

process.on("unhandledRejection", (reason) => {
    cron_logs({ message: `[worker-heavy] Unhandled Rejection: ${reason}`, log_type: "error" });
});

process.on("uncaughtException", (err) => {
    cron_logs({ message: `[worker-heavy] Uncaught Exception: ${err.message}`, log_type: "error" });
    process.exit(1);
});
