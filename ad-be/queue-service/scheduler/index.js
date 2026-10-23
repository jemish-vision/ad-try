require("dotenv").config();
process.env.CUSTOM_SHUTDOWN = "true";
require("../../shared/connection");

const cron = require("node-cron");
const cronJobSchema = require("../../api-server/models/cronJob.model");
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
    console.error(`[ProducerScheduler] Invalid cron expression for ${cronDoc.cronName}: "${cronDoc.cronExpression}"`);
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
      console.error(`[ProducerScheduler] Error dispatching ${target.task} for occurrence ${scheduledFor.toISOString()}:`, err.message);
    }
  });

  activeCronJobs.set(taskKey, scheduledCron);
  console.log(`[ProducerScheduler] Scheduled ${target.task} [${cronDoc.cronExpression}] (Mongo cron: "${cronDoc.cronName}")`);
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

  console.log(`[ProducerScheduler] Running startup lookback recovery for past ${pastOccurrences.length} hour(s)...`);

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
        console.warn(`[ProducerScheduler] Lookback enqueue warning for ${task} (${occurrence.toISOString()}):`, err.message);
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
      console.warn("[ProducerScheduler] Change stream error, falling back to periodic poll:", err.message);
    });
  } catch (err) {
    console.warn("[ProducerScheduler] Could not start change stream (requires replica set), polling every 60s instead.");
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

  console.log(`[ProducerScheduler] Producer scheduler running on PID ${process.pid}`);

  registerGracefulShutdown({
    serviceName: "queue-producer",
    onShutdown: async () => {
      console.log("[ProducerScheduler] Shutting down producer...");
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
    console.error("[ProducerScheduler] Fatal startup error:", err);
    process.exit(1);
  });
}

module.exports = {
  startProducerScheduler,
  registerSchedule,
  loadSchedules,
};
