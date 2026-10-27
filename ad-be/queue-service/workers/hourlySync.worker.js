require("dotenv").config();
process.env.CUSTOM_SHUTDOWN = "true";
require("../../shared/connection");

const { Worker } = require("bullmq");
const { QUEUES } = require("../queues/queueNames");
const { getWorkerConnection, createRedisClient, getBullMQPrefix } = require("../config/bullmq.config");
const { createHourlySyncProcessor } = require("../processors/hourlySync.processor");
const { WorkerHeartbeat } = require("../observability/workerHeartbeat");
const { registerGracefulShutdown } = require("../shutdown");
const { closeMongoConnection } = require("../../shared/connection");
const { cron_logs } = require("../../winston/cronAutomation/logger");

let worker = null;
let heartbeat = null;
let workerRedis = null;
let heartbeatRedis = null;

async function startHourlySyncWorker() {
  const concurrency = parseInt(process.env.HOURLY_SYNC_WORKER_CONCURRENCY, 10) || 2;
  const maxStalledCount = parseInt(process.env.SYNC_MAX_STALLED_COUNT, 10) || 2;
  const lockDuration = parseInt(process.env.SYNC_WORKER_LOCK_DURATION_MS, 10) || 300000;

  workerRedis = getWorkerConnection();
  heartbeatRedis = createRedisClient("worker");

  heartbeat = new WorkerHeartbeat({
    redisClient: heartbeatRedis,
    role: "sync-worker",
  });
  heartbeat.start();

  const processor = createHourlySyncProcessor();

  worker = new Worker(QUEUES.HOURLY_SYNC, processor, {
    connection: workerRedis,
    prefix: getBullMQPrefix(),
    concurrency,
    maxStalledCount,
    lockDuration,
  });

  worker.on("active", (job) => {
    cron_logs({
      message: `[HourlySyncWorker] Started job ${job.id} (${job.data?.task})`,
      log_type: "info",
    });
  });

  worker.on("completed", (job) => {
    cron_logs({
      message: `[HourlySyncWorker] Completed job ${job.id} (${job.data?.task})`,
      log_type: "info",
    });
  });

  worker.on("failed", (job, err) => {
    cron_logs({
      message: `[HourlySyncWorker] Failed job ${job?.id} (${job?.data?.task}): ${err.message || err}`,
      log_type: "error",
    });
  });

  worker.on("error", (err) => {
    cron_logs({
      message: `[HourlySyncWorker] Worker error: ${err.message || err}`,
      log_type: "error",
    });
  });

  cron_logs({
    message: `[HourlySyncWorker] Running with concurrency ${concurrency} on PID ${process.pid}`,
    log_type: "info",
  });

  registerGracefulShutdown({
    serviceName: "sync-worker",
    onShutdown: async () => {
      cron_logs({
        message: "[HourlySyncWorker] Closing worker...",
        log_type: "info",
      });
      if (heartbeat) await heartbeat.stop();
      if (worker) await worker.close();
      if (heartbeatRedis) await heartbeatRedis.quit().catch(() => {});
      if (workerRedis) await workerRedis.quit().catch(() => {});
      await closeMongoConnection();
    },
  });

  return worker;
}

if (require.main === module) {
  startHourlySyncWorker().catch((err) => {
    cron_logs({
      message: `[HourlySyncWorker] Fatal startup error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
    process.exit(1);
  });
}

module.exports = {
  startHourlySyncWorker,
};
