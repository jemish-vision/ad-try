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
const { cron_logs } = require("../../winston/cronAutomation/logger");

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
    const task = job.data?.task || "UNKNOWN_RULE_TASK";
    const profile = job.data?.profileId ? ` | Profile: ${job.data.profileId}` : "";
    const config = job.data?.configId ? ` | Config: ${job.data.configId}` : "";
    const attempt = `(Attempt ${job.attemptsMade + 1}/${job.opts?.attempts || 1})`;
    cron_logs({
      message: `[RulesWorker] >>> STARTING Job ${job.id} | Rule: ${task}${profile}${config} ${attempt}`,
      log_type: "info",
    });
  });

  worker.on("completed", (job, result) => {
    const duration = job.processedOn ? `${Date.now() - job.processedOn}ms` : "N/A";
    const task = job.data?.task || "UNKNOWN_RULE_TASK";
    const profile = job.data?.profileId ? ` | Profile: ${job.data.profileId}` : "";
    let detail = "";
    if (result?.skipped) {
      detail = ` | Skipped: ${result.reason || "PROFILE_INACTIVE"}`;
    } else if (result?.executedRules !== undefined || result?.totalActiveRules !== undefined) {
      detail = ` | Rules: ${result.executedRules ?? result.totalActiveRules ?? 0}`;
    }
    cron_logs({
      message: `[RulesWorker] <<< COMPLETED Job ${job.id} | Rule: ${task}${profile} | Duration: ${duration}${detail}`,
      log_type: "info",
    });
  });

  worker.on("failed", (job, err) => {
    const duration = job?.processedOn ? `${Date.now() - job.processedOn}ms` : "N/A";
    const task = job?.data?.task || "UNKNOWN_RULE_TASK";
    const profile = job?.data?.profileId ? ` | Profile: ${job.data.profileId}` : "";
    const attempt = `(Attempt ${job?.attemptsMade || 1}/${job?.opts?.attempts || 1})`;
    cron_logs({
      message: `[RulesWorker] !!! FAILED Job ${job?.id} | Rule: ${task}${profile} | Duration: ${duration} ${attempt} | Error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
  });

  worker.on("error", (err) => {
    cron_logs({
      message: `[RulesWorker] Worker Error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
  });

  cron_logs({
    message: `[RulesWorker] Running with concurrency ${concurrency} on PID ${process.pid}`,
    log_type: "info",
  });

  registerGracefulShutdown({
    serviceName: "rules-worker",
    onShutdown: async () => {
      cron_logs({
        message: "[RulesWorker] Closing worker...",
        log_type: "info",
      });
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
    cron_logs({
      message: `[RulesWorker] Fatal startup error: ${err?.stack || err?.message || err}`,
      log_type: "error",
    });
    process.exit(1);
  });
}

module.exports = {
  startRulesWorker,
};
