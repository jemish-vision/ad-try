/**
 * AdvertiseIQ BullMQ & Worker Monitoring CLI
 *
 * Displays live cluster health, active worker heartbeats, and queue statistics:
 * - Active Workers (Role, Hostname, PID, Uptime, Memory)
 * - Queue Statistics (waiting, active, completed, failed, delayed)
 * - Recent failed job audit (if any)
 *
 * Usage:
 *   node scripts/monitor-queues.js          # Single snapshot
 *   node scripts/monitor-queues.js --watch  # Live auto-refresh every 5 seconds
 */

require("dotenv").config();
const { getQueues, closeQueues } = require("../queue-service/queues/queues");
const { createRedisClient, getBullMQPrefix } = require("../queue-service/config/bullmq.config");

const isWatch = process.argv.includes("--watch");
let redisClient = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatUptime(seconds) {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function printStatus() {
  if (isWatch) {
    console.clear();
  }

  const { rulesQueue, hourlySyncQueue, spApiQueue } = getQueues();
  if (!redisClient) {
    redisClient = createRedisClient("producer");
  }

  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

  console.log("=========================================================================================");
  console.log(`                     ADVERTISEIQ WORKER & QUEUE HEALTH MONITOR                         `);
  console.log(`                     Time: ${timestamp} UTC | Prefix: ${getBullMQPrefix()}             `);
  console.log("=========================================================================================");

  // 1. Worker Heartbeats
  console.log("\n--- ACTIVE WORKERS (Heartbeats) ---");
  const heartbeatKeys = await redisClient.keys("advertiseiq:heartbeat:*");
  if (heartbeatKeys.length === 0) {
    console.log("  ⚠️  No active worker heartbeats found in Redis.");
    console.log("     (Workers register heartbeats every 15s when running: rules-worker, sync-worker, sp-api-worker)");
  } else {
    console.log("  ROLE               PID     HOSTNAME             UPTIME       MEMORY (RSS/HEAP)   UPDATED");
    console.log("  -----------------------------------------------------------------------------------------");
    for (const key of heartbeatKeys) {
      try {
        const raw = await redisClient.get(key);
        if (!raw) continue;
        const hb = JSON.parse(raw);
        const role = (hb.role || "unknown").padEnd(18);
        const pid = String(hb.pid || "-").padEnd(7);
        const host = (hb.hostname || "-").substring(0, 20).padEnd(20);
        const uptime = formatUptime(hb.uptimeSec).padEnd(12);
        const memRss = formatBytes(hb.memoryUsage?.rss);
        const memHeap = formatBytes(hb.memoryUsage?.heapUsed);
        const mem = `${memRss} / ${memHeap}`.padEnd(19);
        const updated = hb.updatedAt ? hb.updatedAt.substring(11, 19) : "-";

        console.log(`  ${role} ${pid} ${host} ${uptime} ${mem} ${updated}`);
      } catch (_) {}
    }
  }

  // 2. Queue Job Counts
  console.log("\n--- QUEUE STATISTICS ---");
  console.log("  QUEUE NAME            WAITING   ACTIVE   COMPLETED   FAILED   DELAYED   TOTAL ACTIVE/PENDING");
  console.log("  -----------------------------------------------------------------------------------------");

  const queues = [
    { name: "rules-queue", queue: rulesQueue },
    { name: "hourly-sync-queue", queue: hourlySyncQueue },
    { name: "sp-api-queue", queue: spApiQueue },
  ];

  let totalFailedAllQueues = 0;
  const failedJobsSummary = [];

  for (const { name, queue } of queues) {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    const totalPending = counts.waiting + counts.active + counts.delayed;
    totalFailedAllQueues += counts.failed;

    const qName = name.padEnd(21);
    const waiting = String(counts.waiting).padEnd(9);
    const active = String(counts.active).padEnd(8);
    const completed = String(counts.completed).padEnd(11);
    const failed = String(counts.failed).padEnd(8);
    const delayed = String(counts.delayed).padEnd(9);
    const pending = String(totalPending);

    console.log(`  ${qName} ${waiting} ${active} ${completed} ${failed} ${delayed} ${pending}`);

    // If there are failed jobs, inspect the most recent ones
    if (counts.failed > 0) {
      const failedList = await queue.getFailed(0, 4);
      for (const j of failedList) {
        failedJobsSummary.push({
          queue: name,
          id: j.id,
          task: j.data?.task || "unknown",
          failedReason: j.failedReason || "unknown",
        });
      }
    }
  }

  // 3. Failed Jobs Audit (if any)
  if (failedJobsSummary.length > 0) {
    console.log("\n--- RECENT FAILED JOBS ---");
    for (const f of failedJobsSummary) {
      console.log(`  [${f.queue}] Job ${f.id} (${f.task}): ${f.failedReason}`);
    }
  } else {
    console.log("\n  ✓ 0 failed jobs detected in the cluster.");
  }

  console.log("\n=========================================================================================\n");

  if (!isWatch) {
    await closeQueues();
    if (redisClient) await redisClient.quit().catch(() => {});
    process.exit(0);
  }
}

async function main() {
  await printStatus();

  if (isWatch) {
    console.log("Watching queue health... Press Ctrl+C to exit.");
    setInterval(async () => {
      try {
        await printStatus();
      } catch (err) {
        console.error("Monitor refresh error:", err.message);
      }
    }, 5000);

    const cleanup = async () => {
      console.log("\nExiting monitor...");
      await closeQueues();
      if (redisClient) await redisClient.quit().catch(() => {});
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

main().catch((err) => {
  console.error("Monitor fatal error:", err);
  process.exit(1);
});
