require("dotenv").config();
process.env.CUSTOM_SHUTDOWN = "true";
require("../../shared/connection");

const { Worker } = require("bullmq");
const { QUEUES } = require("../queues/queueNames");
const { getWorkerConnection, createRedisClient, getBullMQPrefix } = require("../config/bullmq.config");
const { createSpApiProcessor } = require("../processors/spApi.processor");
const { WorkerHeartbeat } = require("../observability/workerHeartbeat");
const { registerGracefulShutdown } = require("../shutdown");
const { closeMongoConnection } = require("../../shared/connection");
const { cron_logs } = require("../../winston/cronAutomation/logger");

let worker = null;
let heartbeat = null;
let workerRedis = null;
let heartbeatRedis = null;

async function startSpApiWorker() {
  const concurrency = parseInt(process.env.SP_API_WORKER_CONCURRENCY, 10) || 2;
  const maxStalledCount = parseInt(process.env.SP_API_MAX_STALLED_COUNT, 10) || 2;
  const lockDuration = parseInt(process.env.SP_API_WORKER_LOCK_DURATION_MS, 10) || 1800000; // 30 minutes

  workerRedis = getWorkerConnection();
  heartbeatRedis = createRedisClient("worker");

  heartbeat = new WorkerHeartbeat({
    redisClient: heartbeatRedis,
    role: "sp-api-worker",
  });
  heartbeat.start();

  const processor = createSpApiProcessor();

  worker = new Worker(QUEUES.SP_API, processor, {
    connection: workerRedis,
    prefix: getBullMQPrefix(),
    concurrency,
    maxStalledCount,
    lockDuration,
  });

  worker.on("active", (job) => {
    const task = job.data?.task || "UNKNOWN_TASK";
    const attempt = job.attemptsMade ? job.attemptsMade + 1 : 1;
    const maxAttempts = job.opts?.attempts || 1;
    const timeBlock = job.data?.timeBlock || "N/A";
    cron_logs({
      message: `[SpApiWorker] >>> STARTING Job ${job.id} | Task: ${task} [TimeBlock: ${timeBlock}] (Attempt ${attempt}/${maxAttempts})`,
      log_type: "info",
    });
  });

  worker.on("completed", (job, result) => {
    const task = job.data?.task || "UNKNOWN_TASK";
    const duration = job.processedOn ? `${Date.now() - job.processedOn}` : "unknown";
    let detail = "";
    if (result?.dryRun) {
      detail = " (DryRun - Shadow Mode)";
    }
    cron_logs({
      message: `[SpApiWorker] <<< COMPLETED Job ${job.id} | Task: ${task} | Duration: ${duration}ms${detail}`,
      log_type: "info",
    });
  });

  worker.on("failed", (job, err) => {
    const task = job?.data?.task || "UNKNOWN_TASK";
    const attempt = job?.attemptsMade || 0;
    const maxAttempts = job?.opts?.attempts || 1;
    const duration = job?.processedOn ? `${Date.now() - job.processedOn}` : "unknown";
    cron_logs({
      message: `[SpApiWorker] !!! FAILED Job ${job?.id} | Task: ${task} | Duration: ${duration}ms | Attempt ${attempt}/${maxAttempts} | Error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
  });

  worker.on("error", (err) => {
    cron_logs({
      message: `[SpApiWorker] Worker Error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
  });

  cron_logs({
    message: `[SpApiWorker] Running with concurrency ${concurrency} (lockDuration: ${lockDuration}ms) on PID ${process.pid}`,
    log_type: "info",
  });

  registerGracefulShutdown({
    serviceName: "sp-api-worker",
    onShutdown: async () => {
      cron_logs({
        message: "[SpApiWorker] Closing worker...",
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
  startSpApiWorker().catch((err) => {
    cron_logs({
      message: `[SpApiWorker] Fatal startup error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
    process.exit(1);
  });
}

module.exports = {
  startSpApiWorker,
};
