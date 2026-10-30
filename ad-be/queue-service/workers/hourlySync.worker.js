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
    const task = job.data?.task || "UNKNOWN_TASK";
    const profile = job.data?.profileId ? ` | Profile: ${job.data.profileId}` : "";
    const config = job.data?.configId ? ` | Config: ${job.data.configId}` : "";
    const block = job.data?.timeBlock ? ` | TimeBlock: ${job.data.timeBlock}` : "";
    const attempt = `(Attempt ${job.attemptsMade + 1}/${job.opts?.attempts || 1})`;
    cron_logs({
      message: `[HourlySyncWorker] >>> STARTING Job ${job.id} | Task: ${task}${profile}${config}${block} ${attempt}`,
      log_type: "info",
    });
  });

  worker.on("completed", (job, result) => {
    const duration = job.processedOn ? `${Date.now() - job.processedOn}ms` : "N/A";
    const task = job.data?.task || "UNKNOWN_TASK";
    const profile = job.data?.profileId ? ` | Profile: ${job.data.profileId}` : "";
    let detail = "";
    if (result?.result?.totalBatchesProcessed !== undefined) {
      detail = ` | Batches Written: ${result.result.totalBatchesProcessed}`;
    } else if (result?.skipped) {
      detail = ` | Skipped: ${result.reason || "SKIPPED"}`;
    } else if (result?.dryRun) {
      detail = ` | Mode: Shadow (dry-run)`;
    } else if (result?.state) {
      detail = ` | State: ${result.state}`;
    }
    cron_logs({
      message: `[HourlySyncWorker] <<< COMPLETED Job ${job.id} | Task: ${task}${profile} | Duration: ${duration}${detail}`,
      log_type: "info",
    });
  });

  worker.on("failed", (job, err) => {
    const duration = job?.processedOn ? `${Date.now() - job.processedOn}ms` : "N/A";
    const task = job?.data?.task || "UNKNOWN_TASK";
    const profile = job?.data?.profileId ? ` | Profile: ${job.data.profileId}` : "";
    const attempt = `(Attempt ${job?.attemptsMade || 1}/${job?.opts?.attempts || 1})`;
    cron_logs({
      message: `[HourlySyncWorker] !!! FAILED Job ${job?.id} | Task: ${task}${profile} | Duration: ${duration} ${attempt} | Error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
  });

  worker.on("error", (err) => {
    cron_logs({
      message: `[HourlySyncWorker] Worker Error: ${err?.stack || err?.message || err}`,
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
