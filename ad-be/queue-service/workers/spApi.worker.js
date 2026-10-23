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
    console.log(`[SpApiWorker] Started job ${job.id} (${job.data?.task})`);
  });

  worker.on("completed", (job) => {
    console.log(`[SpApiWorker] Completed job ${job.id} (${job.data?.task})`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[SpApiWorker] Failed job ${job?.id} (${job?.data?.task}): ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[SpApiWorker] Worker error: ${err.message}`);
  });

  console.log(`[SpApiWorker] Running with concurrency ${concurrency} (lockDuration: ${lockDuration}ms) on PID ${process.pid}`);

  registerGracefulShutdown({
    serviceName: "sp-api-worker",
    onShutdown: async () => {
      console.log("[SpApiWorker] Closing worker...");
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
    console.error("[SpApiWorker] Fatal startup error:", err);
    process.exit(1);
  });
}

module.exports = {
  startSpApiWorker,
};
