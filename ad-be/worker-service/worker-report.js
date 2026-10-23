const pLimit = require("p-limit").default;
const cron = require("node-cron");
const mongoose = require("mongoose");

require("../shared/connection");

const { cronListCampaignsFromAmazon, cronGenerateCampaignReport } = require("../api-server/controllers/campaign.controller");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("../api-server/controllers/adGroups.controller");
const { cronGenerateAdProductReport } = require("../api-server/controllers/productAds.controller");
const { cronGeneratePlacementReport } = require("../api-server/controllers/placement.controller");
const { cronGenerateSearchTermReport } = require("../api-server/controllers/searchTerm.controller");
const { cronListTargetingFromAmazon, cronGenerateTargetingReport } = require("../api-server/controllers/targeting.controller");
const { cronGenerateOrderListing } = require("../api-server/controllers/order.controller");
const { cronGenerateSalesReport } = require("../api-server/controllers/inventory.controller");
const { cronListCouponFromAmazon } = require("../api-server/controllers/coupon.controller");
const { cronGenerateReimbursementReport, cronGenerateShipmentQueueReport } = require("../api-server/controllers/reconciliationReimbursement.controller");
const {
    cronGenerateFcInventoryLedgerReport,
    cronGenerateFcStorageFeeReport
} = require("../api-server/controllers/fcInventory.controller");
const { pingHeartbeat, sendThrottledCronAlert } = require("../api-server/helper/heartbeat.helper");

const cronJobSchema = require("../api-server/models/cronJob.model");
const { cron_logs } = require("../winston/cronAutomation/logger");
const { shouldLegacyExecute, getAutomationExecutionMode } = require("../shared/automationMode");
const CRON_JOBS = require("./cronJobs.enum");

const jobStore = {};
let cronChangeStream;
let lastResumeToken = null;
let restarting = false;
let failureCount = 0;
const MAX_FAILURES = 5;
const GLOBAL_LIMIT = pLimit(Math.max(1, Number(process.env.WORKER_REPORT_PROCESS_LIMIT || process.env.PROCESS_LIMIT) || 3));

const taskHandlers = {
    CampaignListing: async () => { await runJobSafely(CRON_JOBS.CAMPAIGN_LISTING, cronListCampaignsFromAmazon); },
    CampaignReport: async () => { await runJobSafely(CRON_JOBS.CAMPAIGN_REPORT, cronGenerateCampaignReport); },
    AdGroupsListing: async () => { await runJobSafely(CRON_JOBS.AD_GROUPS_LISTING, cronListAdGroupsFromAmazon); },
    AdGroupReport: async () => { await runJobSafely(CRON_JOBS.AD_GROUP_REPORT, cronGenerateAdGroupReport); },
    TargetingListing: async () => { await runJobSafely(CRON_JOBS.TARGETING_LISTING, cronListTargetingFromAmazon); },
    TargetingReport: async () => { await runJobSafely(CRON_JOBS.TARGETING_REPORT, cronGenerateTargetingReport); },
    SearchTermReport: async () => { await runJobSafely(CRON_JOBS.SEARCH_TERM_REPORT, cronGenerateSearchTermReport); },
    ProductAdsReport: async () => { await runJobSafely(CRON_JOBS.PRODUCT_ADS_REPORT, cronGenerateAdProductReport); },
    PlacementReport: async () => { await runJobSafely(CRON_JOBS.PLACEMENT_REPORT, cronGeneratePlacementReport); },
    OrderListing: async () => { await runJobSafely(CRON_JOBS.ORDER_LISTING, cronGenerateOrderListing); },
    SyncCoupons: async () => { await runJobSafely(CRON_JOBS.SYNC_COUPONS, cronListCouponFromAmazon); },
    SalesReport: async () => { await runJobSafely(CRON_JOBS.SALES_REPORT, cronGenerateSalesReport); },
    ReimbursementReport: async () => { await runJobSafely(CRON_JOBS.REIMBURSEMENT_REPORT, cronGenerateReimbursementReport); },
    ShipmentQueueReport: async () => { await runJobSafely(CRON_JOBS.SHIPMENT_QUEUE_REPORT, cronGenerateShipmentQueueReport); },
    FCInventoryLedger: async () => { await runJobSafely(CRON_JOBS.FC_INVENTORY_LEDGER, cronGenerateFcInventoryLedgerReport); },
    FCStorageFee: async () => { await runJobSafely(CRON_JOBS.FC_STORAGE_FEE, cronGenerateFcStorageFeeReport); }
};

const running = new Set();

const JOB_TIMEOUT_MS = {
    default: 180 * 60 * 1000,   // 3 Hours max safety cap for all multi-profile report & listing crons
    OrderListing: 180 * 60 * 1000,
    SyncPastData: 180 * 60 * 1000,
    WeeklyReport: 180 * 60 * 1000,
    SearchTermReport: 180 * 60 * 1000,
    TargetingReport: 180 * 60 * 1000,
    ProductAdsReport: 180 * 60 * 1000,
};

const withTimeout = (promise, ms, name) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`[worker-report] Job ${name} exceeded ${ms}ms timeout`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

function scheduleJobs(jobList) {
    jobList.forEach(job => {
        let taskName = job.cronName.replace(/\s+/g, "");
        if (!shouldLegacyExecute(taskName)) {
            cron_logs({
                message: `[worker-report] Task ${taskName} migrated to BullMQ queue (mode: ${getAutomationExecutionMode()}). Skipping legacy schedule.`,
                log_type: "info",
            });
            return;
        }
        if (!taskHandlers[taskName]) return;

        if (jobStore[taskName]) {
            jobStore[taskName].stop();
            delete jobStore[taskName];
            cron_logs({ message: `[worker-report] Restarted job schedule: ${taskName}`, log_type: "info" });
        }

        const scheduledJob = cron.schedule(
            job.cronExpression,
            async () => {
                if (running.has(taskName)) {
                    cron_logs({ message: `[worker-report] SKIP ${taskName}: previous run active`, log_type: "warn" });
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
                    cron_logs({ message: `[worker-report] ${taskName} completed in ${Date.now() - startedAt}ms`, log_type: "info" });
                }
            }
        );

        jobStore[taskName] = scheduledJob;
        cron_logs({ message: `[worker-report] Scheduled: ${taskName} → [${job.cronExpression}]`, log_type: "info" });
    });
}

const runJobSafely = async (taskName, fn) => {
    if (typeof fn !== "function") return;
    try {
        cron_logs({ message: `[worker-report] Started: ${taskName}`, log_type: "info" });
        await fn();
        cron_logs({ message: `[worker-report] Completed: ${taskName}`, log_type: "info" });
    } catch (error) {
        cron_logs({ message: `[worker-report] Failed: ${taskName}, Error:${error.message || error}`, log_type: "error" });
        await sendThrottledCronAlert(taskName, error);
    }
};

const startCronChangeStream = () => {
    if (mongoose.connection.readyState !== 1) {
        mongoose.connection.once("connected", () => startCronChangeStream());
        return;
    }

    if (failureCount >= MAX_FAILURES) return;

    cron_logs({ message: "[worker-report] starting cron ChangeStream...", log_type: "info" });

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

                cron_logs({ message: `[worker-report] ChangeStream detected schedule change, restarting job: ${updated.cronName}`, log_type: "info" });
                scheduleJobs([{ cronName: updated.cronName, cronExpression: updated.cronExpression }]);
            } catch (err) {
                cron_logs({ message: `[worker-report] change handler error: ${err.message}`, log_type: "error" });
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

    cron_logs({ message: `[worker-report] Restarting cron ChangeStream (attempt ${failureCount})...`, log_type: "warn" });

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

    cron_logs({ message: "[worker-report] Worker Report service started", log_type: "info" });

    try {
        await pingHeartbeat("worker-report");
        setInterval(async () => {
            await pingHeartbeat("worker-report");
        }, 60 * 1000);
    } catch (hbErr) {
        cron_logs({ message: `[worker-report] Heartbeat error: ${hbErr.message}`, log_type: "error" });
    }

    let jobs = await cronJobSchema.find({ isActive: true }).lean();
    cron_logs({ message: `[worker-report] Schedule Job Called with ${jobs.length} Jobs.`, log_type: "info" });
    scheduleJobs(jobs);
    startCronChangeStream();
})();

process.on("unhandledRejection", (reason) => {
    cron_logs({ message: `[worker-report] Unhandled Rejection: ${reason}`, log_type: "error" });
});

process.on("uncaughtException", (err) => {
    cron_logs({ message: `[worker-report] Uncaught Exception: ${err.message}`, log_type: "error" });
    process.exit(1);
});
