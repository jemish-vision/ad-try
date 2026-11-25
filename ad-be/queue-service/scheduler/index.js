require("dotenv").config();
process.env.CUSTOM_SHUTDOWN = "true";
require("../../shared/connection");

const cron = require("node-cron");
const cronJobSchema = require("../../api-server/models/cronJob.model");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { resolveMigratedSchedule } = require("./scheduleRegistry");
const { enqueueRulesForOccurrence } = require("../producers/rules.producer");
const { enqueueSyncForOccurrence } = require("../producers/hourlySync.producer");
const { enqueueSpApiForOccurrence } = require("../producers/spApi.producer");
const { getBoundedLookbackHours } = require("./timeBucket");
const { WorkerHeartbeat } = require("../observability/workerHeartbeat");
const { createRedisClient } = require("../config/bullmq.config");
const { closeQueues } = require("../queues/queues");
const { registerGracefulShutdown } = require("../shutdown");
const { closeMongoConnection } = require("../../shared/connection");
const { isQueueModeEnabled, isShadowModeEnabled } = require("../../shared/automationMode");
const { SP_API_TASKS } = require("../queues/queueNames");

const activeCronJobs = new Map();
let cronChangeStream = null;
let schedulePoll = null;
let snapshotRecovery = null;
let heartbeat = null;
let heartbeatRedis = null;

// The configured trigger and recovery share one BullMQ job per hour. The worker
// uses the actual observation date and only processes profiles still due today.
async function enqueueDueSnapshot(now = new Date()) {
  if (!activeCronJobs.has(SP_API_TASKS.ASIN_SNAPSHOT)) return;
  const scheduledFor = new Date(now);
  scheduledFor.setUTCMinutes(0, 0, 0);
  try {
    await enqueueSpApiForOccurrence({ task: SP_API_TASKS.ASIN_SNAPSHOT, scheduledFor });
  } catch (err) {
    cron_logs({ message: `[ProducerScheduler] ASIN snapshot dispatch failed: ${err.message}`, log_type: "error" });
  }
}

/**
 * Registers a single migrated cron schedule.
 */
function registerSchedule(cronDoc) {
  const target = resolveMigratedSchedule(cronDoc.cronName);
  if (!target) return;

  const taskKey = target.task;

  const current = activeCronJobs.get(taskKey);
  const enabled = (isQueueModeEnabled() || isShadowModeEnabled()) && cronDoc.isActive && cronDoc.cronExpression;
  if (enabled && current?.expression === cronDoc.cronExpression) return;
  if (current) {
    current.job.stop();
    activeCronJobs.delete(taskKey);
  }

  if (!enabled) return;

  if (!cron.validate(cronDoc.cronExpression)) {
    cron_logs({
      message: `[ProducerScheduler] Invalid cron expression for ${cronDoc.cronName}: "${cronDoc.cronExpression}"`,
      log_type: "error",
    });
    return;
  }

  const scheduledCron = cron.schedule(cronDoc.cronExpression, async () => {
    const scheduledFor = new Date();
    if (taskKey === SP_API_TASKS.ASIN_SNAPSHOT) return enqueueDueSnapshot(scheduledFor);
    try {
      if (target.family === "rules") {
        await enqueueRulesForOccurrence({
          task: target.task,
          scheduledFor,
        });
      } else if (target.family === "sp-api") {
        await enqueueSpApiForOccurrence({
          task: target.task,
          scheduledFor,
        });
      } else {
        await enqueueSyncForOccurrence({
          task: target.task,
          scheduledFor,
        });
      }
    } catch (err) {
      cron_logs({
        message: `[ProducerScheduler] Error dispatching ${target.task} for occurrence ${scheduledFor.toISOString()}: ${err.message || err}`,
        log_type: "error",
      });
    }
  });

  activeCronJobs.set(taskKey, { job: scheduledCron, expression: cronDoc.cronExpression });
  cron_logs({
    message: `[ProducerScheduler] Scheduled ${target.task} [${cronDoc.cronExpression}] (Mongo cron: "${cronDoc.cronName}")`,
    log_type: "info",
  });
}

/**
 * Loads all active migrated cron schedules from MongoDB.
 */
async function loadSchedules() {
  const cronDocs = await cronJobSchema.find({ isActive: true }).lean();
  const desired = new Set(cronDocs.map(doc => resolveMigratedSchedule(doc.cronName)?.task));
  for (const doc of cronDocs) {
    registerSchedule(doc);
  }

  // Ensure default schedule for HourlyDataConsolidation if not present in DB
  const hasHourlyConsolidation = cronDocs.some(
    (job) => job.cronName?.replace(/\s+/g, "").toLowerCase() === "hourlydataconsolidation"
  );
  if (!hasHourlyConsolidation) {
    const configuredDoc = await cronJobSchema.exists({
      cronName: { $in: ["HourlyDataConsolidation", "Hourly Data Consolidation"] },
    });
    // Respect explicitly disabled doc in DB. Otherwise register default 2:30 AM daily schedule
    if (!configuredDoc) {
      desired.add(resolveMigratedSchedule("HourlyDataConsolidation")?.task);
      registerSchedule({
        cronName: "HourlyDataConsolidation",
        cronExpression: process.env.HOURLY_DATA_CONSOLIDATION_CRON || "0 30 2 * * *",
        isActive: true,
      });
    }
  }

  // Ensure default hourly schedule (:15 past every hour) for AdBlackoutMonitor if not present in DB
  const hasBlackoutMonitor = cronDocs.some(
    (job) => job.cronName?.replace(/\s+/g, "").toLowerCase() === "adblackoutmonitor"
  );
  if (!hasBlackoutMonitor) {
    const configuredBlackoutDoc = await cronJobSchema.exists({
      cronName: { $in: ["AdBlackoutMonitor", "Ad Blackout Monitor"] },
    });
    if (!configuredBlackoutDoc) {
      desired.add(resolveMigratedSchedule("AdBlackoutMonitor")?.task);
      registerSchedule({
        cronName: "AdBlackoutMonitor",
        cronExpression: process.env.AD_BLACKOUT_MONITOR_CRON || "0 40 * * * *",
        isActive: true,
      });
    }
  }
  for (const [task, { job }] of activeCronJobs) {
    if (desired.has(task)) continue;
    job.stop();
    activeCronJobs.delete(task);
  }
}

/**
 * Bounded lookback recovery on startup.
 */
async function runStartupLookbackRecovery() {
  const lookbackHours = parseInt(process.env.QUEUE_STARTUP_LOOKBACK_HOURS, 10) || 2;
  const pastOccurrences = getBoundedLookbackHours(lookbackHours);

  cron_logs({
    message: `[ProducerScheduler] Running startup lookback recovery for past ${pastOccurrences.length} hour(s)...`,
    log_type: "info",
  });

  const syncTasks = [
    "campaign-listing",
    "adgroup-listing",
    "targeting-listing",
    "product-ads-listing",
    "campaign-report",
    "adgroup-report",
    "targeting-report",
    "product-ads-report",
    "placement-report",
    "search-term-report",
  ];

  for (const occurrence of pastOccurrences) {
    for (const task of syncTasks) {
      try {
        await enqueueSyncForOccurrence({
          task,
          scheduledFor: occurrence,
          trigger: "scheduled",
        });
      } catch (err) {
        cron_logs({
          message: `[ProducerScheduler] Lookback enqueue warning for ${task} (${occurrence.toISOString()}): ${err.message || err}`,
          log_type: "warn",
        });
      }
    }
  }
}

/**
 * Monitors cronJob collection for real-time schedule modifications.
 */
function startSchedulePolling() {
  if (schedulePoll) return;
  let polling = false;
  schedulePoll = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      await loadSchedules();
    } catch (err) {
      cron_logs({ message: `[ProducerScheduler] Schedule poll failed: ${err.message}`, log_type: "warn" });
    } finally {
      polling = false;
    }
  }, 60000);
}

function setupChangeStream() {
  try {
    cronChangeStream = cronJobSchema.watch();
    cronChangeStream.on("change", async (change) => {
      if (["insert", "update", "replace", "delete"].includes(change.operationType)) {
        try {
        await loadSchedules();
        } catch (err) {
          cron_logs({ message: `[ProducerScheduler] Schedule reload failed: ${err.message}`, log_type: "warn" });
          startSchedulePolling();
        }
      }
    });
    cronChangeStream.on("error", (err) => {
      cron_logs({
        message: `[ProducerScheduler] Change stream error, falling back to periodic poll: ${err.message || err}`,
        log_type: "warn",
      });
      startSchedulePolling();
    });
  } catch (err) {
    cron_logs({
      message: "[ProducerScheduler] Could not start change stream (requires replica set), polling every 60s instead.",
      log_type: "warn",
    });
    startSchedulePolling();
  }
}

async function startProducerScheduler() {
  if (!isQueueModeEnabled() && !isShadowModeEnabled()) {
    throw new Error("Queue producer requires AUTOMATION_EXECUTION_MODE=queue or shadow.");
  }
  heartbeatRedis = createRedisClient("producer");
  heartbeat = new WorkerHeartbeat({
    redisClient: heartbeatRedis,
    role: "queue-producer",
  });
  heartbeat.start();

  await loadSchedules();
  setupChangeStream();
  snapshotRecovery = cron.schedule("0 20 * * * *", () => enqueueDueSnapshot());
  await enqueueDueSnapshot();
  await runStartupLookbackRecovery();

  cron_logs({
    message: `[ProducerScheduler] Producer scheduler running on PID ${process.pid}`,
    log_type: "info",
  });

  registerGracefulShutdown({
    serviceName: "queue-producer",
    onShutdown: async () => {
      cron_logs({
        message: "[ProducerScheduler] Shutting down producer...",
        log_type: "info",
      });
      snapshotRecovery?.stop();
      if (schedulePoll) clearInterval(schedulePoll);
      schedulePoll = null;
      for (const { job } of activeCronJobs.values()) {
        job.stop();
      }
      activeCronJobs.clear();
      if (cronChangeStream) {
        await cronChangeStream.close().catch(() => {});
      }
      if (heartbeat) await heartbeat.stop();
      await closeQueues();
      if (heartbeatRedis) await heartbeatRedis.quit().catch(() => {});
      await closeMongoConnection();
    },
  });
}

if (require.main === module) {
  startProducerScheduler().catch((err) => {
    cron_logs({
      message: `[ProducerScheduler] Fatal startup error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
    process.exit(1);
  });
}

module.exports = {
  startProducerScheduler,
  registerSchedule,
  loadSchedules,
};
