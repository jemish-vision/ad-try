const pLimit = require("p-limit").default;
const cron = require("node-cron");
const mongoose = require("mongoose");

require("../shared/connection");

const { budgetMonitor, acosMonitor, removePausedCampaignFromRules, cronMaxBidSetting, cronMonitorSQSMessageCount } = require("../api-server/controllers/campaign.controller");
const { CronPlacementRule } = require("../api-server/controllers/placement.controller");
const { CronTargetingRule } = require("../api-server/controllers/targeting.controller");
const { cronBudgetRulesSchedules } = require("../api-server/controllers/budgetRules.controller");
const { updateAccessToken, cronDisconnectReminder } = require("../api-server/controllers/config.controller");
const { resetStuckSyncRecords } = require("../api-server/controllers/organization.controller");
const { cronDaypartingRule } = require("../api-server/controllers/daypartingstretegy.controller");
const { cronSendSubscriptionRenewalEmail } = require("../api-server/controllers/user.controller");
const { cronHolidayReminder, cronSpecialDayReminder, cronApplyHolidayProtection } = require("../api-server/controllers/holiday.controller");
const { cronWeeklyPerformanceEmail } = require("../api-server/controllers/dashboard.controller");
const { cronRecommendationSnapshot } = require("../api-server/controllers/recommendation.controller");
const { cronRequestReview } = require("../api-server/controllers/order.controller");
const { cronNegativeListingFromAmazon } = require("../api-server/controllers/keyword.controller");
const { cronProductUnavailabilityCheck } = require("../api-server/controllers/productAds.controller");
const { cronReminderForReimbursement } = require("../api-server/controllers/reconciliationReimbursement.controller");
const { pingHeartbeat, sendThrottledCronAlert } = require("../api-server/helper/heartbeat.helper");
const { processStagedReportBatches } = require("../api-server/services/reportBatchWriter.service");

const cronJobSchema = require("../api-server/models/cronJob.model");
const { cron_logs } = require("../winston/cronAutomation/logger");
const { shouldLegacyExecute, getAutomationExecutionMode } = require("../shared/automationMode");

const jobStore = {};
let cronChangeStream;
let lastResumeToken = null;
let restarting = false;
let failureCount = 0;
const MAX_FAILURES = 5;
const GLOBAL_LIMIT = pLimit(Math.max(1, Number(process.env.WORKER_FAST_PROCESS_LIMIT || process.env.PROCESS_LIMIT) || 5));

const taskHandlers = {
    // --- Migrated to BullMQ rules-queue (rules.worker.js) ---
    // BudgetRuleSchedules: async () => { await cronBudgetRulesSchedules(); },
    // TargetingRuleSchedules: async () => { await CronTargetingRule(); },
    // PlacementRuleSchedules: async () => { await CronPlacementRule(); },
    // DaypartingRuleSchedules: async () => { await cronDaypartingRule(); },

    CampaignMonitor: async () => {
        await runJobSafely("Campaign Monitor", async () => {
            await budgetMonitor();
            await acosMonitor();
        });
    },
    ReviewRequest: async () => { await runJobSafely("Review Request", cronRequestReview); },
    RefreshToken: async () => { /* Managed distributed and on-demand via amazonAuth.service */ },
    RulesUpdate: async () => { await runJobSafely("Rules Update", removePausedCampaignFromRules); },
    MaxBidSetting: async () => { await runJobSafely("Max Bid Setting", cronMaxBidSetting); },
    RecommendationSnapshot: async () => { await runJobSafely("Recommendation Snapshot", cronRecommendationSnapshot); },
    ProductUnavailabilityCheck: async () => { await runJobSafely("Product Unavailability Check", cronProductUnavailabilityCheck); },
    RenewalReminder: async () => { await runJobSafely("Renewal Reminder", cronSendSubscriptionRenewalEmail); },
    NegativeListing: async () => { await runJobSafely("Negative Listing", cronNegativeListingFromAmazon); },
    HolidayReminder: async () => { await runJobSafely("Holiday Reminder", cronHolidayReminder); },
    SpecialDayReminder: async () => { await runJobSafely("Special Day Reminder", cronSpecialDayReminder); },
    ApplyHolidayProtection: async () => { await runJobSafely("Apply Holiday Protection", cronApplyHolidayProtection); },
    MonitorSQSMessageCount: async () => { await cronMonitorSQSMessageCount(); },
    WeeklyPerformanceEmail: async () => { await runJobSafely("Weekly Performance Email", cronWeeklyPerformanceEmail); },

    // --- Migrated to BullMQ sp-api-queue (spApi.worker.js) ---
    // ReminderForReimbursement: async () => { await runJobSafely("Reminder For Reimbursement", cronReminderForReimbursement); },

    DisconnectReminder: async () => { await runJobSafely("Disconnect Reminder", cronDisconnectReminder); },
    StuckSyncReset: async () => { await runJobSafely("Stuck Sync Reset", resetStuckSyncRecords); },

    // --- Migrated to BullMQ hourly-sync-queue (hourlySync.worker.js) ---
    // ReportBatchWriter: async () => {
    //     await runJobSafely("Report Batch Writer", async () => {
    //         await processStagedReportBatches();
    //     });
    // },
};

const running = new Set();

const JOB_TIMEOUT_MS = {
    default: 10 * 60 * 1000,
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
                message: `[worker-fast] Task ${taskName} migrated to BullMQ queue (mode: ${getAutomationExecutionMode()}). Skipping legacy schedule.`,
                log_type: "info",
            });
            return;
        }
        if (!taskHandlers[taskName]) return;

        if (jobStore[taskName]) {
            jobStore[taskName].stop();
            delete jobStore[taskName];
            cron_logs({ message: `[worker-fast] Restarted job schedule: ${taskName}`, log_type: "info" });
        }

        const scheduledJob = cron.schedule(
            job.cronExpression,
            async () => {
                if (running.has(taskName)) {
                    cron_logs({ message: `[worker-fast] SKIP ${taskName}: previous run still active`, log_type: "warn" });
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
                    cron_logs({ message: `[worker-fast] ${taskName} finished in ${Date.now() - startedAt}ms`, log_type: "info" });
                }
            }
        );

        jobStore[taskName] = scheduledJob;
        cron_logs({ message: `[worker-fast] Scheduled: ${taskName} → [${job.cronExpression}]`, log_type: "info" });
    });
}

const runJobSafely = async (taskName, fn) => {
    if (typeof fn !== "function") return;
    try {
        cron_logs({ message: `[worker-fast] Started: ${taskName}`, log_type: "info" });
        await fn();
        cron_logs({ message: `[worker-fast] Ended: ${taskName}`, log_type: "info" });
    } catch (error) {
        cron_logs({ message: `[worker-fast] Failed: ${taskName}, Error:${error.message || error}`, log_type: "error" });
        await sendThrottledCronAlert(taskName, error);
    }
};

const startCronChangeStream = () => {
    if (mongoose.connection.readyState !== 1) {
        mongoose.connection.once("connected", () => startCronChangeStream());
        return;
    }

    if (failureCount >= MAX_FAILURES) return;

    cron_logs({ message: "[worker-fast] starting cron ChangeStream...", log_type: "info" });

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

                cron_logs({ message: `[worker-fast] ChangeStream detected schedule change, restarting job: ${updated.cronName}`, log_type: "info" });
                scheduleJobs([{ cronName: updated.cronName, cronExpression: updated.cronExpression }]);
            } catch (err) {
                cron_logs({ message: `[worker-fast] change handler error: ${err.message}`, log_type: "error" });
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

    cron_logs({ message: `[worker-fast] Restarting cron ChangeStream (attempt ${failureCount})...`, log_type: "warn" });

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

    cron_logs({ message: "[worker-fast] Worker Fast service started", log_type: "info" });

    try {
        await pingHeartbeat("worker-fast");
        setInterval(async () => {
            await pingHeartbeat("worker-fast");
        }, 60 * 1000);
    } catch (hbErr) {
        cron_logs({ message: `[worker-fast] Heartbeat error: ${hbErr.message}`, log_type: "error" });
    }

    let jobs = await cronJobSchema.find({ isActive: true }).lean();
    if (!jobs.some((job) => job.cronName?.replace(/\s+/g, "") === "ReportBatchWriter")) {
        const configuredWriter = await cronJobSchema.exists({
            cronName: { $in: ["ReportBatchWriter", "Report Batch Writer"] },
        });
        // Respect an explicitly disabled job. Otherwise keep Redis imports
        // retryable even when no cronJob document has been seeded yet.
        if (!configuredWriter) {
            jobs.push({ cronName: "ReportBatchWriter", cronExpression: "* * * * *" });
        }
    }
    cron_logs({ message: `[worker-fast] Schedule Job Called with ${jobs.length} Jobs.`, log_type: "info" });
    scheduleJobs(jobs);
    startCronChangeStream();
})();

process.on("unhandledRejection", (reason) => {
    cron_logs({ message: `[worker-fast] Unhandled Rejection: ${reason}`, log_type: "error" });
});

process.on("uncaughtException", (err) => {
    cron_logs({ message: `[worker-fast] Uncaught Exception: ${err.message}`, log_type: "error" });
    process.exit(1);
});
