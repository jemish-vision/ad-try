const crypto = require("crypto");
const fs = require("fs");
const { redisClient } = require("./redis.service");
const { write_logs } = require("../../winston/utility/logger");

const STREAM_KEY_PREFIX = "import_stream:";
const MANIFEST_KEY_PREFIX = "import_manifest:";
const BATCH_KEY_PREFIX = "import_batch:";
const LOCK_KEY_PREFIX = "import_lock:";
const CONSUMER_GROUP = "report_importers";

/**
 * Computes sha256 checksum of a file
 */
const getFileChecksum = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
};

/**
 * Initializes Redis consumer group for a stream if not already created
 */
const ensureConsumerGroup = async (streamKey) => {
  try {
    await redisClient.xGroupCreate(streamKey, CONSUMER_GROUP, "0", { MKSTREAM: true });
  } catch (err) {
    if (!err.message?.includes("BUSYGROUP")) {
      throw err;
    }
  }
};

/**
 * Staged run status constants
 */
const RUN_STATUS = {
  STAGING: "STAGING",
  READY: "READY",
  IMPORTING: "IMPORTING",
  VERIFYING: "VERIFYING",
  COMPLETED: "COMPLETED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  WRITE_FAILED: "WRITE_FAILED",
};

/**
 * Saves or updates an import run manifest in Redis
 */
const saveRunManifest = async (importRunId, manifestData) => {
  const key = `${MANIFEST_KEY_PREFIX}${importRunId}`;
  const serialized = {};
  for (const [k, v] of Object.entries(manifestData)) {
    serialized[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  }
  await redisClient.hSet(key, serialized);
  // Set 7-day retention on manifest
  await redisClient.expire(key, 7 * 24 * 3600);
};

/**
 * Retrieves an import run manifest from Redis
 */
const getRunManifest = async (importRunId) => {
  const key = `${MANIFEST_KEY_PREFIX}${importRunId}`;
  const data = await redisClient.hGetAll(key);
  if (!data || Object.keys(data).length === 0) return null;

  return {
    ...data,
    profileId: Number(data.profileId),
    expectedRows: Number(data.expectedRows || 0),
    expectedUniqueKeys: Number(data.expectedUniqueKeys || 0),
    expectedBatches: Number(data.expectedBatches || 0),
    processedBatches: Number(data.processedBatches || 0),
    stagedBatches: Number(data.stagedBatches || 0),
    failedBatches: Number(data.failedBatches || 0),
    sourceVersion: data.sourceVersion ? Number(data.sourceVersion) : undefined,
    expectedSpend: data.expectedSpend !== undefined ? Number(data.expectedSpend) : undefined,
    expectedImpressions: data.expectedImpressions !== undefined ? Number(data.expectedImpressions) : undefined,
    expectedClicks: data.expectedClicks !== undefined ? Number(data.expectedClicks) : undefined,
    expectedSales: data.expectedSales !== undefined ? Number(data.expectedSales) : undefined,
    expectedOrders: data.expectedOrders !== undefined ? Number(data.expectedOrders) : undefined,
  };
};

/**
 * Stages a single batch of validated normalized rows into Redis
 */
const stageBatchInRedis = async (importRunId, entity, batchIndex, rows) => {
  const batchId = `${importRunId}_b${batchIndex}`;
  const batchKey = `${BATCH_KEY_PREFIX}${batchId}`;
  const payloadStr = JSON.stringify(rows);
  const checksum = crypto.createHash("sha256").update(payloadStr).digest("hex");

  // 1. Store batch payload
  await redisClient.set(batchKey, payloadStr, { EX: 7 * 24 * 3600 });

  // 2. Add batch reference to Redis Stream
  const streamKey = `${STREAM_KEY_PREFIX}${entity}`;
  await ensureConsumerGroup(streamKey);

  const entryId = await redisClient.xAdd(streamKey, "*", {
    importRunId,
    batchId,
    batchIndex: String(batchIndex),
    rowsCount: String(rows.length),
    checksum,
    entity,
  });

  return { batchId, entryId, checksum };
};

/**
 * Acquires a distributed lock for a scope (e.g. configId + profileId + entity)
 */
const acquireImportLock = async (lockScope, ttlSeconds = 120) => {
  const lockKey = `${LOCK_KEY_PREFIX}${lockScope}`;
  const token = crypto.randomUUID();
  const acquired = await redisClient.set(lockKey, token, { NX: true, EX: ttlSeconds });
  return acquired ? token : null;
};

/**
 * Releases a distributed lock atomically using Lua script
 */
const releaseImportLock = async (lockScope, token) => {
  const lockKey = `${LOCK_KEY_PREFIX}${lockScope}`;
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    const result = await redisClient.eval(luaScript, {
      keys: [lockKey],
      arguments: [token],
    });
    return result === 1;
  } catch (err) {
    write_logs({ message: `[Lock Release Error] ${lockKey}: ${err.message}`, log_type: "error" });
    return false;
  }
};

/**
 * Renews distributed lock lease atomically
 */
const renewImportLock = async (lockScope, token, ttlSeconds = 60) => {
  const lockKey = `${LOCK_KEY_PREFIX}${lockScope}`;
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], tonumber(ARGV[2]))
    else
      return 0
    end
  `;
  try {
    const result = await redisClient.eval(luaScript, {
      keys: [lockKey],
      arguments: [token, String(ttlSeconds)],
    });
    return result === 1;
  } catch (err) {
    write_logs({ message: `[Lock Renew Error] ${lockKey}: ${err.message}`, log_type: "warn" });
    return false;
  }
};

/**
 * Checks if distributed lock is still held by token (fencing guard)
 */
const checkImportLock = async (lockScope, token) => {
  const lockKey = `${LOCK_KEY_PREFIX}${lockScope}`;
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return 1
    else
      return 0
    end
  `;
  try {
    const result = await redisClient.eval(luaScript, {
      keys: [lockKey],
      arguments: [token],
    });
    return result === 1;
  } catch (err) {
    write_logs({ message: `[Lock Check Error] ${lockKey}: ${err.message}`, log_type: "warn" });
    return false;
  }
};

/**
 * Atomically marks a batch processed in the manifest (idempotently guarded by batch ID set),
 * acknowledges the message in consumer group, deletes the message from the stream, and removes payload.
 */
const atomicBatchConfirm = async ({ streamKey, streamMsgId, batchKey, batchId, importRunId, isFinalBatch, finalManifestUpdates }) => {
  const manifestKey = `${MANIFEST_KEY_PREFIX}${importRunId}`;
  const processedBatchesSetKey = `${MANIFEST_KEY_PREFIX}${importRunId}:batches`;

  // Lua script ensuring idempotency:
  // KEYS[1] = manifestKey
  // KEYS[2] = processedBatchesSetKey
  // KEYS[3] = batchKey
  // KEYS[4] = streamKey
  // ARGV[1] = batchId
  // ARGV[2] = streamMsgId
  // ARGV[3] = CONSUMER_GROUP
  // ARGV[4] = isFinalBatch ('1' or '0')
  // ARGV[5] = finalManifestUpdates serialized JSON (or empty)

  const luaScript = `
    local wasAdded = redis.call("sadd", KEYS[2], ARGV[1])
    local completedBatches = redis.call("scard", KEYS[2])
    redis.call("hset", KEYS[1], "processedBatches", tostring(completedBatches))

    local expectedBatches = tonumber(redis.call("hget", KEYS[1], "expectedBatches") or "0")
    local isFinal = (ARGV[4] == "1") or (expectedBatches > 0 and completedBatches >= expectedBatches)

    if isFinal and ARGV[5] ~= "" then
      local updates = cjson.decode(ARGV[5])
      for k, v in pairs(updates) do
        redis.call("hset", KEYS[1], k, tostring(v))
      end
    end

    redis.call("xack", KEYS[4], ARGV[3], ARGV[2])
    redis.call("xdel", KEYS[4], ARGV[2])
    redis.call("del", KEYS[3])

    return {wasAdded, completedBatches, isFinal and 1 or 0}
  `;

  const res = await redisClient.eval(luaScript, {
    keys: [manifestKey, processedBatchesSetKey, batchKey, streamKey],
    arguments: [
      batchId || "default_batch",
      streamMsgId,
      CONSUMER_GROUP,
      isFinalBatch ? "1" : "0",
      finalManifestUpdates ? JSON.stringify(finalManifestUpdates) : "",
    ],
  });

  return {
    wasAdded: res?.[0] === 1,
    completedBatches: Number(res?.[1] || 0),
    isFinal: res?.[2] === 1,
  };
};

module.exports = {
  STREAM_KEY_PREFIX,
  MANIFEST_KEY_PREFIX,
  BATCH_KEY_PREFIX,
  CONSUMER_GROUP,
  RUN_STATUS,
  getFileChecksum,
  ensureConsumerGroup,
  saveRunManifest,
  getRunManifest,
  stageBatchInRedis,
  acquireImportLock,
  renewImportLock,
  checkImportLock,
  releaseImportLock,
  atomicBatchConfirm,
};
