const mongoose = require("mongoose");
const path = require("path");
const cron = require("node-cron");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createRedisClient } = require("../queue-service/config/bullmq.config");
const { resolveMigratedSchedule } = require("../queue-service/scheduler/scheduleRegistry");
const cronJobSchema = require("../api-server/models/cronJob.model");
const ruleRunHistorySchema = require("../api-server/models/ruleRunHistory.model");

const isDryRun = process.argv.includes("--dry-run");

async function auditRedis() {
  console.log("\n========================================================");
  console.log("  1. REDIS PRE-FLIGHT AUDIT (BullMQ Compatibility)      ");
  console.log("========================================================");

  let redisClient;
  try {
    redisClient = createRedisClient("producer");
    await redisClient.ping();
    console.log("[PASS] Redis connection established.");

    // 1. Version Check
    const serverInfo = await redisClient.info("server");
    const versionMatch = serverInfo.match(/redis_version:([^\r\n]+)/);
    const redisVersion = versionMatch ? versionMatch[1] : "unknown";
    console.log(`[INFO] Redis Server Version: ${redisVersion}`);

    const [major, minor] = redisVersion.split(".").map(Number);
    if (major >= 6) {
      console.log(`[PASS] Redis version >= 6.0 (${redisVersion}). Full BullMQ feature support.`);
    } else if (major === 5) {
      console.log(`[WARN] Redis version 5.x (${redisVersion}). Supported by BullMQ, but 6.2+ recommended.`);
    } else {
      console.log(`[FAIL] Redis version ${redisVersion} is below BullMQ minimum requirement (5.0.0).`);
    }

    // 2. Maxmemory Policy Check
    let maxmemoryPolicy = null;
    try {
      const configRes = await redisClient.config("GET", "maxmemory-policy");
      if (Array.isArray(configRes) && configRes.length >= 2) {
        maxmemoryPolicy = configRes[1];
      }
    } catch (cfgErr) {
      // In managed cloud redis (e.g. Redis Cloud), CONFIG command is often disabled
      const memInfo = await redisClient.info("memory");
      const match = memInfo.match(/maxmemory_policy:([^\r\n]+)/);
      if (match) maxmemoryPolicy = match[1];
    }

    if (maxmemoryPolicy) {
      console.log(`[INFO] maxmemory-policy: ${maxmemoryPolicy}`);
      if (maxmemoryPolicy.toLowerCase() === "noeviction") {
        console.log("[PASS] maxmemory-policy is 'noeviction' (Required by BullMQ).");
      } else {
        console.log(`[WARN/FAIL] maxmemory-policy is '${maxmemoryPolicy}'. BullMQ requires 'noeviction' to prevent silent job metadata eviction!`);
      }
    } else {
      console.log("[INFO] CONFIG GET command restricted. Checking memory stats directly.");
    }

    // 3. Memory & Client Stats
    const memInfo = await redisClient.info("memory");
    const usedMemMatch = memInfo.match(/used_memory_human:([^\r\n]+)/);
    const maxMemMatch = memInfo.match(/maxmemory_human:([^\r\n]+)/);
    console.log(`[INFO] Used Memory: ${usedMemMatch ? usedMemMatch[1] : "N/A"}`);
    console.log(`[INFO] Max Memory:  ${maxMemMatch ? maxMemMatch[1] : "unlimited / N/A"}`);

    const clientInfo = await redisClient.info("clients");
    const connectedClients = clientInfo.match(/connected_clients:([^\r\n]+)/);
    const blockedClients = clientInfo.match(/blocked_clients:([^\r\n]+)/);
    console.log(`[INFO] Connected Clients: ${connectedClients ? connectedClients[1] : "N/A"}`);
    console.log(`[INFO] Blocked Clients:   ${blockedClients ? blockedClients[1] : "N/A"}`);

    // 4. Persistence Stats
    const persistInfo = await redisClient.info("persistence");
    const aofEnabled = persistInfo.match(/aof_enabled:([^\r\n]+)/);
    const rdbStatus = persistInfo.match(/rdb_last_bgsave_status:([^\r\n]+)/);
    console.log(`[INFO] AOF Persistence:   ${aofEnabled ? (aofEnabled[1] === "1" ? "Enabled" : "Disabled") : "N/A"}`);
    console.log(`[INFO] RDB Save Status:   ${rdbStatus ? rdbStatus[1] : "N/A"}`);

  } catch (err) {
    console.error(`[ERROR] Redis audit failed: ${err.message}`);
  } finally {
    if (redisClient) await redisClient.quit().catch(() => {});
  }
}

async function auditCronJobs() {
  console.log("\n========================================================");
  console.log("  2. MONGODB cronJob DEFINITIONS AUDIT                  ");
  console.log("========================================================");

  const cronJobs = await cronJobSchema.find({}).lean();
  console.log(`[INFO] Total cronJob records in database: ${cronJobs.length}`);

  const migratedFound = [];
  const unmigratedFound = [];
  const invalidExpressions = [];

  for (const job of cronJobs) {
    const target = resolveMigratedSchedule(job.cronName);
    const isValidCron = job.cronExpression ? cron.validate(job.cronExpression) : false;

    if (!isValidCron && job.isActive) {
      invalidExpressions.push({ cronName: job.cronName, expression: job.cronExpression });
    }

    if (target) {
      migratedFound.push({
        cronName: job.cronName,
        targetTask: target.task,
        targetQueue: target.queue,
        family: target.family,
        cronExpression: job.cronExpression,
        isActive: job.isActive,
        valid: isValidCron,
      });
    } else {
      unmigratedFound.push({
        cronName: job.cronName,
        cronExpression: job.cronExpression,
        isActive: job.isActive,
      });
    }
  }

  console.log(`\n--- Migrated Schedules Found (${migratedFound.length}) ---`);
  for (const item of migratedFound) {
    const status = item.isActive ? "ACTIVE" : "INACTIVE";
    const validStr = item.valid ? "VALID" : "INVALID_EXPR";
    console.log(`  - [${status}][${validStr}] "${item.cronName}" -> ${item.targetTask} (${item.targetQueue}) | [${item.cronExpression}]`);
  }

  console.log(`\n--- Unmigrated (Legacy Preserved) Schedules (${unmigratedFound.length}) ---`);
  for (const item of unmigratedFound) {
    const status = item.isActive ? "ACTIVE" : "INACTIVE";
    console.log(`  - [${status}] "${item.cronName}" | [${item.cronExpression}]`);
  }

  if (invalidExpressions.length > 0) {
    console.log("\n[WARN] Invalid active cron expressions detected:");
    for (const inv of invalidExpressions) {
      console.log(`  - "${inv.cronName}": "${inv.expression}"`);
    }
  } else {
    console.log("\n[PASS] All active cron expressions are valid 5/6-field crons.");
  }
}

async function auditAndReconcileRuleHistory() {
  console.log("\n========================================================");
  console.log("  3. ruleRunHistory DUPLICATE AUDIT & RECONCILIATION    ");
  console.log("========================================================");

  console.log("[INFO] Scanning ruleRunHistories for duplicate identities...");

  const pipeline = [
    {
      $group: {
        _id: {
          configId: "$configId",
          profileId: "$profileId",
          ruleId: "$ruleId",
          ruleSchema: "$ruleSchema",
          ruleDate: "$ruleDate",
          ruleTime: "$ruleTime",
        },
        count: { $sum: 1 },
        docs: { $push: { _id: "$_id", isRun: "$isRun", updatedAt: "$updatedAt" } },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
  ];

  const duplicates = await ruleRunHistorySchema.aggregate(pipeline);
  console.log(`[INFO] Found ${duplicates.length} duplicate identity groups.`);

  let totalDocsToDelete = 0;
  const idsToDelete = [];

  for (const group of duplicates) {
    // Sort docs: prefer isRun: true, then newest updatedAt
    group.docs.sort((a, b) => {
      if (a.isRun !== b.isRun) {
        return a.isRun ? -1 : 1;
      }
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

    // Keep the first (best) doc, mark remaining for deletion
    const toRemove = group.docs.slice(1);
    totalDocsToDelete += toRemove.length;
    for (const doc of toRemove) {
      idsToDelete.push(doc._id);
    }
  }

  console.log(`[INFO] Total duplicate documents identified for removal: ${totalDocsToDelete}`);

  if (totalDocsToDelete > 0) {
    if (isDryRun) {
      console.log(`[DRY-RUN] Would remove ${idsToDelete.length} duplicate documents. (Run without --dry-run to apply).`);
    } else {
      console.log(`[RECONCILE] Deleting ${idsToDelete.length} duplicate documents...`);
      const res = await ruleRunHistorySchema.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`[PASS] Removed ${res.deletedCount} duplicate records.`);
    }
  } else {
    console.log("[PASS] No duplicate ruleRunHistory records found. Identity is clean.");
  }

  // Strengthen Index
  if (!isDryRun) {
    console.log("[INDEX] Ensuring unique compound index on ruleRunHistories...");
    try {
      await ruleRunHistorySchema.collection.createIndex(
        {
          configId: 1,
          profileId: 1,
          ruleId: 1,
          ruleSchema: 1,
          ruleDate: 1,
          ruleTime: 1,
        },
        {
          unique: true,
          name: "idx_unique_rule_run_identity",
        }
      );
      console.log("[PASS] Successfully created unique index 'idx_unique_rule_run_identity'.");
    } catch (idxErr) {
      console.error(`[ERROR] Failed to create unique index: ${idxErr.message}`);
    }
  }
}

async function run() {
  console.log("========================================================");
  console.log(`  BULLMQ MIGRATION: PRE-FLIGHT AUDIT & RECONCILIATION   `);
  console.log(`  Mode: ${isDryRun ? "DRY-RUN (read-only)" : "RECONCILE & APPLY"}  `);
  console.log("========================================================");

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 120000,
    });
    console.log(`[PASS] MongoDB connected to database: ${mongoose.connection.name}`);

    await auditRedis();
    await auditCronJobs();
    await auditAndReconcileRuleHistory();

    console.log("\n========================================================");
    console.log("  PRE-FLIGHT AUDIT & RECONCILIATION FINISHED!           ");
    console.log("========================================================\n");
  } catch (err) {
    console.error("\n[FATAL] Script encountered an unhandled error:", err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
