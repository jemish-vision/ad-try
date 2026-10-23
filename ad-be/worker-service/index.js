const pLimit = require("p-limit").default;
const cron = require('node-cron');
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

require("../shared/connection");
 
const { cronListProductAdsFromAmazon, cronGenerateAdProductReport, cronListProductFromAmazon, cronProductUnavailabilityCheck } = require("../api-server/controllers/productAds.controller");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("../api-server/controllers/adGroups.controller");
const { cronListCampaignsFromAmazon, cronGenerateCampaignReport, budgetMonitor, acosMonitor, cronMonitorSQSMessageCount, processQueue, removePausedCampaignFromRules, cronMaxBidSetting, cronCampaignHealthCheck } = require("../api-server/controllers/campaign.controller");
const { cronNegativeListingFromAmazon } = require('../api-server/controllers/keyword.controller');
const { cronGeneratePlacementReport, CronPlacementRule } = require("../api-server/controllers/placement.controller");
const { cronGenerateSearchTermReport } = require('../api-server/controllers/searchTerm.controller');
const { cronGenerateTargetingReport, cronListTargetingFromAmazon, CronTargetingRule } = require("../api-server/controllers/targeting.controller");
const { cronGenerateOrderReport, SyncProductListing, cronRequestReview, cronBestSellerRank, monitorInventory, cronGenerateRefundReport, cronGenerateOrderListing } = require("../api-server/controllers/order.controller");
const { cronBudgetRulesSchedules } = require("../api-server/controllers/budgetRules.controller");
const { updateAccessToken, SyncPastData, cronDisconnectReminder } = require('../api-server/controllers/config.controller');
const { resetStuckSyncRecords } = require('../api-server/controllers/organization.controller');
const { cronBestPerformerGoogleReportGenerate, cronKeywordAnalysisReportGenerate } = require("../api-server/controllers/google.controller");
const { cronDaypartingRule } = require("../api-server/controllers/daypartingstretegy.controller");
const { cronSendSubscriptionRenewalEmail } = require("../api-server/controllers/user.controller");
const { cronHolidayReminder, cronSpecialDayReminder, cronApplyHolidayProtection } = require("../api-server/controllers/holiday.controller");
const { cronGenerateInvetoryReport, cronGenerateSalesReport, cronDetectDeadInventory, cronInventoryForecastAlerts } = require("../api-server/controllers/inventory.controller");
const { cronListCouponFromAmazon } = require("../api-server/controllers/coupon.controller");
const { cronSyncDealPerformance } = require("../api-server/controllers/deals.controller");
const { cronUnlockStuckRules } = require("../api-server/services/stuckRulesCleanup.service");

const cronJobSchema = require("../api-server/models/cronJob.model");
const budgetRulesSchema = require("../api-server/models/budgetRules.model");
const targetingRuleSchema = require("../api-server/models/targetingRuleSchema.model");
const placementRulesSchema = require("../api-server/models/placementRules.model");
const recomandationRulesSchema = require("../api-server/models/recomandationRules.model");

const { cron_logs } = require("../winston/cronAutomation/logger");
const { getDatesBetween } = require("../api-server/helper/common");
const { sendEmailHelper } = require('../api-server/helper/emailHelper');
const { buildCronErrorEmail } = require('../emailTemplate/buildCronErrorEmail');
const { cronWeeklyPerformanceEmail } = require("../api-server/controllers/dashboard.controller");
const { runRecommendationSnapshot, cronRecommendationSnapshot } = require("../api-server/controllers/recommendation.controller");
const { cronGenerateReimbursementReport, cronGenerateShipmentQueueReport, cronReminderForReimbursement } = require("../api-server/controllers/reconciliationReimbursement.controller");
const { cronGenerateTransactionsReport } = require("../api-server/controllers/transactions.controller");
const { cronFetchCompetitorsFromAmazon } = require("../api-server/controllers/products.controller");
const { cronFetchAPlusContentFromAmazon } = require("../api-server/controllers/aplusContent.controller");
const { cronDeleteExpiredAccountsData } = require("../api-server/services/accountDataCleanup.service");
const { cronBrandAnalytics } = require("../api-server/controllers/brandAnalytics.controller");
const { shouldLegacyExecute, getAutomationExecutionMode } = require("../shared/automationMode");
const { pingHeartbeat, sendThrottledCronAlert, sendStuckTaskAlert } = require("../api-server/helper/heartbeat.helper");
const CRON_JOBS = require("./cronJobs.enum");

const jobStore = {};
const activeJobs = new Set();
const runningTasks = new Map();
let cronChangeStream;
let lastResumeToken = null;
let restarting = false;
// Dedicated concurrency lanes to prevent heavy data syncs from blocking 1-minute real-time rules
const RULES_LIMIT = pLimit(5); // High-priority lane for rapid rule checks & monitor crons
const SYNC_LIMIT = pLimit(Math.max(1, Number(process.env.PROCESS_LIMIT) || 5)); // Data-heavy sync & report crons

const RULE_TASKS = new Set([
    "BudgetRuleSchedules",
    "TargetingRuleSchedules",
    "PlacementRuleSchedules",
    "DaypartingRuleSchedules",
    "MonitorSQSMessageCount",
    "CampaignMonitor",
    "ProductUnavailabilityCheck",
    "MonitorInventory",
    "RulesUpdate"
]);

const getConcurrencyLimiter = (taskName) => {
    return RULE_TASKS.has(taskName) ? RULES_LIMIT : SYNC_LIMIT;
};

const taskHandlers = {

    ProductAdsListing: async () => { //0 6 */1 * * *
        await runJobSafely(CRON_JOBS.PRODUCT_ADS_LISTING, cronListProductAdsFromAmazon);
    },

    ProductAdsReport: async () => { //0 16 */1 * * *
        await runJobSafely(CRON_JOBS.PRODUCT_ADS_REPORT, cronGenerateAdProductReport);
    },

    AdGroupsListing: async () => { //0 2 */1 * * *
        await runJobSafely(CRON_JOBS.AD_GROUPS_LISTING, cronListAdGroupsFromAmazon);
    },

    AdGroupReport: async () => { //0 12 */1 * * *
        await runJobSafely(CRON_JOBS.AD_GROUP_REPORT, cronGenerateAdGroupReport);
    },

    CampaignListing: async () => { //0 0 */1 * * *
        await runJobSafely(CRON_JOBS.CAMPAIGN_LISTING, cronListCampaignsFromAmazon);
    },

    CampaignReport: async () => { //0 10 */1 * * *
        await runJobSafely(CRON_JOBS.CAMPAIGN_REPORT, cronGenerateCampaignReport);
    },

    ProductsMetaListing: async () => { //0 8 */1 * * *
        await runJobSafely(CRON_JOBS.PRODUCTS_META_LISTING, cronListProductFromAmazon);
    },

    PlacementReport: async () => { //0 18 */1 * * *
        await runJobSafely(CRON_JOBS.PLACEMENT_REPORT, cronGeneratePlacementReport);
    },

    SearchTermReport: async () => { //0 20 */1 * * *
        await runJobSafely(CRON_JOBS.SEARCH_TERM_REPORT, cronGenerateSearchTermReport);
    },

    TargetingListing: async () => { //0 4 */1 * * *
        await runJobSafely(CRON_JOBS.TARGETING_LISTING, cronListTargetingFromAmazon);
    },

    TargetingReport: async () => { //0 14 */1 * * *
        await runJobSafely(CRON_JOBS.TARGETING_REPORT, cronGenerateTargetingReport);
    },

    ProductsListing: async () => { //0 40 4 * * *
        await runJobSafely(CRON_JOBS.PRODUCTS_LISTING, SyncProductListing);
    },

    ReviewRequest: async () => { //0 45 4 * * *
        await runJobSafely("Review Request", cronRequestReview);
    },

    CampaignMonitor: async () => { //0 15 4,8,12 * * *
        await runJobSafely("Campaign Monitor", async () => {
            await budgetMonitor();
            await acosMonitor();
        });
    },

    BudgetRuleSchedules: async () => { //0 */1 * * * *
        await cronBudgetRulesSchedules();
    },

    TargetingRuleSchedules: async () => { //0 */1 * * * *
        await CronTargetingRule();
    },

    DaypartingRuleSchedules: async () => { //0 */15 * * * *
        await cronDaypartingRule();
    },

    OrderListing: async () => { //0 35 */1 * * *
        await runJobSafely(CRON_JOBS.ORDER_LISTING, cronGenerateOrderListing);
    },

    SyncOrder: async () => { //0 0 2,4 * * *
        await runJobSafely(CRON_JOBS.TRANSACTION_REPORT, cronGenerateTransactionsReport);
        await runJobSafely(CRON_JOBS.SYNC_ORDER, cronGenerateOrderReport);
        await runJobSafely(CRON_JOBS.REFUND_REPORT, cronGenerateRefundReport);
    },

    SyncInventory: async () => { //0 22 */1 * * *
        await runJobSafely(CRON_JOBS.SYNC_INVENTORY, cronGenerateInvetoryReport);
    },

    SyncCoupons: async () => { //0 25 */1 * * *
        await runJobSafely(CRON_JOBS.SYNC_COUPONS, cronListCouponFromAmazon);
    },

    SalesReport: async () => { //0 24 */1 * * *
        await runJobSafely(CRON_JOBS.SALES_REPORT, cronGenerateSalesReport);
    },

    DetectDeadInventory: async () => { //0 26 */1 * * * (runs after SalesReport)
        await runJobSafely(CRON_JOBS.DETECT_DEAD_INVENTORY, cronDetectDeadInventory);
    },

    SyncDealsDashboard: async () => { //0 45 */2 * * * (Every 2 hours)
        await runJobSafely(CRON_JOBS.SYNC_DEALS_DASHBOARD, cronSyncDealPerformance);
    },

    InventoryForecastAlerts: async () => { //0 0 7 * * *
        await runJobSafely("Inventory Forecast Alerts", cronInventoryForecastAlerts);
    },

    RefreshToken: async () => {
        // Token refresh is managed distributed and on-demand via amazonAuth.service
    },

    WeeklyReport: async () => { //0 5 1,3 * * *
        await runJobSafely("Weekly Report", async () => {
            await cronGenerateCampaignReport(true);
            await cronGenerateAdGroupReport(true);
            await cronGenerateTargetingReport(true);
            await cronGenerateAdProductReport(true);
            await cronGeneratePlacementReport(true);
            await cronGenerateSearchTermReport(true);
        });
    },

    BestPerformerReport: async () => { //0 20 3 * * *
        await runJobSafely(CRON_JOBS.BEST_PERFORMER_REPORT, cronBestPerformerGoogleReportGenerate);
    },

    PlacementRuleSchedules: async () => { //0 */1 * * * *
        await CronPlacementRule();
    },

    KeywordAnalysisReport: async () => { //0 30 3 * * *
        await runJobSafely(CRON_JOBS.KEYWORD_ANALYSIS_REPORT, cronKeywordAnalysisReportGenerate);
    },

    RulesUpdate: async () => { //0 35 */1 * * *
        await runJobSafely("Rules Update", removePausedCampaignFromRules);
    },

    SyncPastData: async () => { //0 55 */1 * * *
        await runJobSafely("Sync Past Data", SyncPastData);
    },

    BestSellerRank: async () => { //0 0 5 * * *
        await runJobSafely("Best Seller Rank", cronBestSellerRank);
    },

    RecommendationSnapshot: async () => { //0 * * * *
        await runJobSafely("Recommendation Snapshot", cronRecommendationSnapshot);
    },

    MaxBidSetting: async () => { //0 20 */1 * * *
        await runJobSafely("Max Bid Setting", cronMaxBidSetting);
    },

    ProductUnavailabilityCheck: async () => { //0 30 3,9,12 * * *
        await runJobSafely("Product Unavailability Check", cronProductUnavailabilityCheck);
    },

    RenewalReminder: async () => { //0 25 1 * * *
        await runJobSafely("Renewal Reminder", cronSendSubscriptionRenewalEmail);
    },

    MonitorInventory: async () => { //0 20 2,8,11 * * *
        await runJobSafely("Monitor Inventory", monitorInventory);
    },

    // CampaignHealthCheck: async () => { //0 25 0,3,6,9 * * *
    //     await runJobSafely("Campaign Health Check", cronCampaignHealthCheck);
    // },

    NegativeListing: async () => { //0 30 3,6,9,0 * * *
        await runJobSafely(CRON_JOBS.NEGATIVE_LISTING, cronNegativeListingFromAmazon);
    },

    HolidayReminder: async () => { //0 25 4 * * *
        await runJobSafely("Holiday Reminder", cronHolidayReminder);
    },

    SpecialDayReminder: async () => { //0 28 4 * * *
        await runJobSafely("Special Day Reminder", cronSpecialDayReminder);
    },

    ApplyHolidayProtection: async () => { //0 25 1 * * *
        await runJobSafely("Apply Holiday Protection", cronApplyHolidayProtection);
    },

    MonitorSQSMessageCount: async () => { //0 */10 * * * *
        await cronMonitorSQSMessageCount();
    },

    WeeklyPerformanceEmail: async () => { //0 0 0 * * 1
        await runJobSafely("Weekly Performance Email", cronWeeklyPerformanceEmail);
    },

    ReimbursementReport: async () => { //0 55 */1 * * *
        await runJobSafely(CRON_JOBS.REIMBURSEMENT_REPORT, cronGenerateReimbursementReport);
    },

    ShipmentQueueReport: async () => { //0 58 */1 * * *
        await runJobSafely(CRON_JOBS.SHIPMENT_QUEUE_REPORT, cronGenerateShipmentQueueReport);
    },

    ReminderForReimbursement: async () => { //0 0 6 * * *
        await runJobSafely("Reminder For Reimbursement", cronReminderForReimbursement);
    },

    CompetitorAnalysis: async () => { //0 30 6 * * *
        await runJobSafely(CRON_JOBS.COMPETITOR_ANALYSIS, cronFetchCompetitorsFromAmazon);
    },

    APlusContentSync: async () => { //0 40 */1 * * *
        await runJobSafely(CRON_JOBS.APLUS_CONTENT_SYNC, cronFetchAPlusContentFromAmazon);
    },

    DisconnectReminder: async () => { //0 0 9 * * 1  (Every Monday 9:00 AM)
        await runJobSafely("Disconnect Reminder", cronDisconnectReminder);
    },

    AccountDataCleanup: async () => { //0 0 2 * * *  (Every day 2:00 AM)
        await runJobSafely("Account Data Cleanup", cronDeleteExpiredAccountsData);
    },

    BrandAnalyticsReport: async () => { //0 0 7 * * *  (Every day 7:00 AM)
        await runJobSafely(CRON_JOBS.BRAND_ANALYTICS_REPORT, cronBrandAnalytics);
    },

    StuckSyncReset: async () => { // 0 0 */1 * * *  (Every hour)
        await runJobSafely("Stuck Sync Reset", resetStuckSyncRecords);
    },
};

function scheduleJobs(jobList) {
    jobList.forEach(job => {
        let taskName = job.cronName.replace(/\s+/g, "");
        if (!shouldLegacyExecute(taskName)) {
            cron_logs({
                message: `[worker-main] Task ${taskName} is migrated to BullMQ queue (mode: ${getAutomationExecutionMode()}). Skipping legacy schedule.`,
                log_type: "info",
            });
            return;
        }
        if (!taskHandlers[taskName]) {
            cron_logs({
                message: `Handler missing for task: ${taskName}`,
                log_type: "info",
            });
            return;
        }

        // STOP OLD JOB IF EXISTS
        if (jobStore[taskName]) {
            jobStore[taskName].stop();
            delete jobStore[taskName];

        }

        // CREATE NEW CRON JOB
        const scheduledJob = cron.schedule(
            job.cronExpression,
            async () => {
                if (activeJobs.has(taskName)) {
                    cron_logs({
                        message: `Job ${taskName} is already running. Skipping execution to prevent collision.`,
                        log_type: "warn"
                    });
                    return;
                }
                activeJobs.add(taskName);
                runningTasks.set(taskName, { startedAt: Date.now(), lastProgressAt: Date.now() });
                const limiter = getConcurrencyLimiter(taskName);
                try {
                    await limiter(() => taskHandlers[taskName]());
                } catch (err) {
                    cron_logs({
                        message: `Error in ${taskName}: ${err.stack || err.message}`,
                        log_type: "error",
                    });
                } finally {
                    runningTasks.delete(taskName);
                    activeJobs.delete(taskName);
                }
            }
        );

        jobStore[taskName] = scheduledJob;

        cron_logs({
            message: `Scheduled: ${taskName} → [${job.cronExpression}]`,
            log_type: "info",
        });
    });
}

const runJobSafely = async (taskName, fn) => {
    try {
        cron_logs({ message: `Cron started : ${taskName}`, log_type: "info" });
        await fn();
        cron_logs({ message: `Cron ended : ${taskName}`, log_type: "info" });
    } catch (error) {
        cron_logs({ message: `Cron Failed : ${taskName}, Error:${error}`, log_type: "error" });
        await sendThrottledCronAlert(taskName, error);
    }
};

const startCronChangeStream = () => {
    cron_logs({
        message: "Starting Cron ChangeStream...",
        log_type: "info",
    });

    const options = {
        fullDocument: "updateLookup",
    };

    if (lastResumeToken) {
        options.resumeAfter = lastResumeToken;
    }

    cronChangeStream = cronJobSchema.watch([], options);


    cronChangeStream.on("change", async (data) => {
        try {
            lastResumeToken = data._id; // 👈 SAVE TOKEN

            if (!data?.documentKey?._id) return;

            const updated = data.fullDocument;
            if (!updated) return;

            const fields = Object.keys(data.updateDescription?.updatedFields || {});
            const allowed = ["cronExpression", "isActive"];
            const isScheduleChange = fields.some(f => allowed.includes(f));

            if (!isScheduleChange) return;

            scheduleJobs([{
                cronName: updated.cronName,
                cronExpression: updated.cronExpression,
            }]);

        } catch (err) {
            cron_logs({
                message: `Change handler error: ${err.message}`,
                log_type: "error",
            });
        }
    });

    // 🔴 REQUIRED
    cronChangeStream.on("error", handleStreamFailure);
    cronChangeStream.on("close", handleStreamFailure);
};

let isPollingFallback = false;
let currentKnownSchedules = new Map();

const pollScheduleChanges = async () => {
    try {
        const activeDbJobs = await cronJobSchema.find({ isActive: true }).lean();
        const jobsToReschedule = [];

        for (const job of activeDbJobs) {
            const taskName = job.cronName.replace(/\s+/g, "");
            const currentExpr = currentKnownSchedules.get(taskName);

            if (currentExpr !== job.cronExpression) {
                currentKnownSchedules.set(taskName, job.cronExpression);
                jobsToReschedule.push(job);
            }
        }

        if (jobsToReschedule.length > 0) {
            cron_logs({
                message: `Dynamic schedule update detected for ${jobsToReschedule.length} jobs via fallback poller.`,
                log_type: "info",
            });
            scheduleJobs(jobsToReschedule);
        }
    } catch (_) { }
};

let streamFailureCount = 0;
const handleStreamFailure = async (err) => {
    if (restarting) return;

    restarting = true;
    streamFailureCount++;

    try {
        if (cronChangeStream) {
            await cronChangeStream.close().catch(() => { });
            cronChangeStream.removeAllListeners();
            cronChangeStream = null;
        }
    } catch (_) { }

    // If change stream fails 3 consecutive times (e.g. standalone MongoDB without replica set), fallback to polling
    if (streamFailureCount >= 3) {
        if (!isPollingFallback) {
            isPollingFallback = true;
            cron_logs({
                message: "MongoDB ChangeStream is not supported on this deployment (standalone mode). Switched to dynamic schedule polling (every 60s).",
                log_type: "info",
            });
            setInterval(pollScheduleChanges, 60 * 1000);
        }
        restarting = false;
        return;
    }

    const delay = 5000 * streamFailureCount;
    cron_logs({
        message: `Cron ChangeStream failed: ${err?.message || "closed"}. Retrying in ${delay / 1000}s...`,
        log_type: "warn",
    });

    setTimeout(() => {
        restarting = false;
        startCronChangeStream();
    }, delay);
};

// Automatic activity hook called whenever any cron outputs a log via cron_logs
global.onCronActivity = () => {
    const now = Date.now();
    for (const task of runningTasks.values()) {
        task.lastProgressAt = now;
    }
};

// Explicit progress updater for specific tasks
global.updateTaskProgress = (taskName) => {
    const task = runningTasks.get(taskName);
    if (task) {
        task.lastProgressAt = Date.now();
    }
};

const LONG_RUNNING_TASKS = new Set([
    "OrderListing",
    "SyncOrder",
    "SyncPastData",
    "CampaignListing",
    "CampaignReport",
    "ProductAdsListing",
    "ProductAdsReport",
    "AdGroupsListing",
    "AdGroupReport",
    "TargetingListing",
    "TargetingReport",
    "PlacementReport",
    "SearchTermReport",
    "SalesReport",
    "SyncInventory",
    "APlusContentSync",
    "ReimbursementReport",
    "ShipmentQueueReport",
    "BrandAnalyticsReport",
    "CompetitorAnalysis",
    "WeeklyReport"
]);

const getTaskTimeout = (taskName) => {
    // 45 minutes progress inactivity threshold for long-running batch jobs, 30 minutes for standard tasks
    if (LONG_RUNNING_TASKS.has(taskName)) {
        return 45 * 60 * 1000;
    }
    return 30 * 60 * 1000;
};

const stuckTaskAlertThrottle = new Map();

setInterval(async () => {
    const now = Date.now();
    for (const [taskName, task] of runningTasks.entries()) {
        const timeoutMs = getTaskTimeout(taskName);
        const timeSinceLastProgress = now - task.lastProgressAt;
        if (timeSinceLastProgress > timeoutMs) {
            const minutesInactive = Math.round(timeSinceLastProgress / (60 * 1000));
            const thresholdMinutes = Math.round(timeoutMs / (60 * 1000));

            cron_logs({
                message: `CRITICAL: Task "${taskName}" has not reported progress for ${minutesInactive} minutes (exceeded threshold of ${thresholdMinutes}m)!`,
                log_type: "error"
            });

            const lastAlert = stuckTaskAlertThrottle.get(taskName) || 0;
            // Throttle stuck task alert email to at most once per 60 minutes per task
            if (now - lastAlert > 60 * 60 * 1000) {
                stuckTaskAlertThrottle.set(taskName, now);
                try {
                    await sendStuckTaskAlert(
                        taskName,
                        `Task "${taskName}" has not reported progress for ${minutesInactive} minutes (threshold: ${thresholdMinutes}m). Please investigate.`
                    );
                } catch (err) {
                    cron_logs({ message: `Failed to send stuck task alert email: ${err.message}`, log_type: "error" });
                }
            }
        }
    }
}, 2 * 60 * 1000);

(async () => {

    // Start heartbeat ping loop immediately on startup (avoids being blocked by processQueue or db lookups)
    try {
        await pingHeartbeat("worker-service");
        setInterval(async () => {
            await pingHeartbeat("worker-service");
        }, 60 * 1000);
    } catch (hbErr) {
        cron_logs({ message: `Failed to initialize heartbeat ping: ${hbErr.message}`, log_type: "error" });
    }

    // Clean up stuck running rules flags from previous crash/restart
    try {
        await Promise.all([
            budgetRulesSchema.updateMany({ isRunning: true }, { $set: { isRunning: false } }),
            targetingRuleSchema.updateMany({ isRunning: true }, { $set: { isRunning: false } }),
            placementRulesSchema.updateMany({ isRunning: true }, { $set: { isRunning: false } }),
            recomandationRulesSchema.updateMany({ isRunning: true }, { $set: { isRunning: false } })
        ]);
        cron_logs({ message: "Cleaned up stuck running rules flags successfully.", log_type: "info" });
    } catch (cleanErr) {
        cron_logs({ message: `Failed to clean up stuck running rules flags: ${cleanErr.message}`, log_type: "error" });
    }

    let jobs = await cronJobSchema.find({ isActive: true }).lean();
    // jobs.forEach(jb => jb.cronExpression = "0 30 11 * * *");

    jobs.push({
        cronName: "MonitorSQSMessageCount",
        cronExpression: "0 */10 * * * *"
    })

    jobs.push({
        cronName: "BusinessAnalyticsReport",
        cronExpression: "0 0 3 * * 0" // Every Sunday at 3:00 AM
    })

    cron_logs({
        message: `Schedule Job Called with ${jobs.length} Jobs.`,
        log_type: "info",
    });

    scheduleJobs(jobs);

    setTimeout(startCronChangeStream, 5000);

    // Failsafe Janitor for stuck rules
    cron.schedule("*/5 * * * *", async () => {
        await cronUnlockStuckRules();
    });

    await processQueue();

})();


process.on("unhandledRejection", async (reason) => {
    cron_logs({
        message: `Unhandled Rejection: ${reason}`,
        log_type: "error",
    });

    await sendEmailHelper(
        process.env.RECEIVER_EMAIL,
        "Cron Worker Unhandled Rejection",
        buildCronErrorEmail({
            type: "UNHANDLED_REJECTION",
            error: reason?.stack || reason,
        })
    );
});

process.on("uncaughtException", async (err) => {
    cron_logs({
        message: `Uncaught Exception: ${err.message}`,
        log_type: "error",
    });

    await sendEmailHelper(
        process.env.RECEIVER_EMAIL,
        "Cron Worker Crashed",
        buildCronErrorEmail({
            type: "UNCAUGHT_EXCEPTION",
            error: err.stack || err.message,
        })
    );

    process.exit(1); // let PM2 / supervisor restart
});

process.on("exit", (code) => {
    cron_logs({
        message: `Cron Worker exited with code ${code}`,
        log_type: "error",
    });

    sendEmailHelper(
        process.env.RECEIVER_EMAIL,
        "Cron Worker Stopped",
        buildCronErrorEmail({
            type: "PROCESS_EXIT",
            error: `Exit code: ${code}`,
        })
    ).catch(() => { });
});
