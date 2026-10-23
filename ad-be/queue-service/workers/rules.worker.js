require("dotenv").config();
process.env.CUSTOM_SHUTDOWN = "true"; // Prevent shared/connection from prematurely exiting on SIGINT
require("../../shared/connection");

const { Worker } = require("bullmq");
const { QUEUES } = require("../queues/queueNames");
const { getWorkerConnection, createRedisClient, getBullMQPrefix } = require("../config/bullmq.config");
const { createRulesProcessor } = require("../processors/rules.processor");
const { WorkerHeartbeat } = require("../observability/workerHeartbeat");
const { registerGracefulShutdown } = require("../shutdown");
const { closeMongoConnection } = require("../../shared/connection");

let worker = null;
let heartbeat = null;
let workerRedis = null;
let leaseRedis = null;

async function startRulesWorker() {
  const concurrency = parseInt(process.env.RULES_WORKER_CONCURRENCY, 10) || 3;
  const maxStalledCount = parseInt(process.env.RULES_MAX_STALLED_COUNT, 10) || 2;

  workerRedis = getWorkerConnection();
  leaseRedis = createRedisClient("worker");

  heartbeat = new WorkerHeartbeat({
    redisClient: leaseRedis,
    role: "rules-worker",
  });
  heartbeat.start();

  const processor = createRulesProcessor(leaseRedis);

  worker = new Worker(QUEUES.RULES, processor, {
    connection: workerRedis,
    prefix: getBullMQPrefix(),
    concurrency,
    maxStalledCount,
  });

  worker.on("active", (job) => {
    console.log(`[RulesWorker] Started job ${job.id} (${job.data?.task})`);
  });

  worker.on("completed", (job) => {
    console.log(`[RulesWorker] Completed job ${job.id} (${job.data?.task})`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[RulesWorker] Failed job ${job?.id} (${job?.data?.task}): ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[RulesWorker] Worker error: ${err.message}`);
  });

  console.log(`[RulesWorker] Running with concurrency ${concurrency} on PID ${process.pid}`);

  registerGracefulShutdown({
    serviceName: "rules-worker",
    onShutdown: async () => {
      console.log("[RulesWorker] Closing worker...");
      if (heartbeat) await heartbeat.stop();
      if (worker) await worker.close();
      if (leaseRedis) await leaseRedis.quit().catch(() => {});
      if (workerRedis) await workerRedis.quit().catch(() => {});
      await closeMongoConnection();
    },
  });

  return worker;
}

if (require.main === module) {
  startRulesWorker().catch((err) => {
    console.error("[RulesWorker] Fatal startup error:", err);
    process.exit(1);
  });
}

module.exports = {
  startRulesWorker,
};
