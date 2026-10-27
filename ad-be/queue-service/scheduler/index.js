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

const activeCronJobs = new Map();
let cronChangeStream = null;
let heartbeat = null;
let heartbeatRedis = null;

/**
 * Registers a single migrated cron schedule.
 */
function registerSchedule(cronDoc) {
  const target = resolveMigratedSchedule(cronDoc.cronName);
  if (!target) return;

  const taskKey = target.task;

  // Stop existing schedule if already running
  if (activeCronJobs.has(taskKey)) {
    activeCronJobs.get(taskKey).stop();
    activeCronJobs.delete(taskKey);
  }

  if (!cronDoc.isActive || !cronDoc.cronExpression) {
    return;
  }

  if (!cron.validate(cronDoc.cronExpression)) {
    cron_logs({
      message: `[ProducerScheduler] Invalid cron expression for ${cronDoc.cronName}: "${cronDoc.cronExpression}"`,
      log_type: "error",
    });
    return;
  }

  const scheduledCron = cron.schedule(cronDoc.cronExpression, async () => {
    const scheduledFor = new Date();
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

  activeCronJobs.set(taskKey, scheduledCron);
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
      registerSchedule({
        cronName: "HourlyDataConsolidation",
        cronExpression: process.env.HOURLY_DATA_CONSOLIDATION_CRON || "0 30 2 * * *",
        isActive: true,
      });
    }
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
function setupChangeStream() {
  try {
    cronChangeStream = cronJobSchema.watch();
    cronChangeStream.on("change", async (change) => {
      if (["insert", "update", "replace"].includes(change.operationType)) {
        const updated = await cronJobSchema.findById(change.documentKey._id).lean();
        if (updated) {
          registerSchedule(updated);
        }
      } else if (change.operationType === "delete") {
        await loadSchedules();
      }
    });
    cronChangeStream.on("error", (err) => {
      cron_logs({
        message: `[ProducerScheduler] Change stream error, falling back to periodic poll: ${err.message || err}`,
        log_type: "warn",
      });
    });
  } catch (err) {
    cron_logs({
      message: "[ProducerScheduler] Could not start change stream (requires replica set), polling every 60s instead.",
      log_type: "warn",
    });
    setInterval(() => loadSchedules(), 60000);
  }
}

async function startProducerScheduler() {
  heartbeatRedis = createRedisClient("producer");
  heartbeat = new WorkerHeartbeat({
    redisClient: heartbeatRedis,
    role: "queue-producer",
  });
  heartbeat.start();

  await loadSchedules();
  setupChangeStream();
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
      for (const [name, job] of activeCronJobs.entries()) {
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
