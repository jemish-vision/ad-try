const { redisClient } = require("./redis.service");
const campaignsSchema = require("../models/campaign.model");
const adGroupsSchema = require("../models/adGroups.model");
const productAdsSchema = require("../models/productAds.model");
const reportsSchema = require("../models/report.model");
const { finalizeReportHistory } = require("./reportHistoryCompletion.service");
const { buildMongoUpsertOp } = require("../helper/reportNormalization.helper");
const {
  EXTENDED_REPORT_ENTITIES,
  isExtendedEntity,
  getExtendedModel,
  buildExtendedUpsertOp,
} = require("../helper/reportExtendedEntities.helper");
const { parallelBulkWrite } = require("../helper/common");
const {
  STREAM_KEY_PREFIX,
  MANIFEST_KEY_PREFIX,
  BATCH_KEY_PREFIX,
  CONSUMER_GROUP,
  RUN_STATUS,
  getRunManifest,
  saveRunManifest,
  acquireImportLock,
  renewImportLock,
  checkImportLock,
  releaseImportLock,
  ensureConsumerGroup,
  atomicBatchConfirm,
} = require("./reportStaging.service");
const { write_logs } = require("../../winston/utility/logger");

const CONSUMER_ID = `worker_${process.pid}_${Date.now()}`;

const getModelForEntity = (entity) => {
  if (isExtendedEntity(entity)) return getExtendedModel(entity);
  if (entity === "campaign" || entity === "test_campaign") return campaignsSchema;
  if (entity === "adGroup" || entity === "test_adGroup") return adGroupsSchema;
  if (entity === "productAd" || entity === "test_productAd") return productAdsSchema;
  throw new Error(`Unknown entity: ${entity}`);
};

const verifyExtendedRun = async (manifest, model) => {
  const { importRunId, entity, configId, profileId, sourceVersion, expectedSpend } = manifest;
  const mongoose = require("mongoose");
  const configObjId = mongoose.Types.ObjectId.isValid(configId)
    ? new mongoose.Types.ObjectId(String(configId)) : configId;
  const rawKeys = await redisClient.sMembers(`${MANIFEST_KEY_PREFIX}${importRunId}:keys`);
  if (rawKeys.length !== Number(manifest.expectedUniqueKeys || 0)) {
    throw new Error(`[Verification Failure] ${entity} expected ${manifest.expectedUniqueKeys} Redis keys, found ${rawKeys.length}`);
  }
  if (rawKeys.length === 0) return { verified: true, actualCount: 0, totalAccounted: 0 };

  let exactMatches = 0;
  let supersededMatches = 0;
  let exactSpendTotal = 0;
  for (let offset = 0; offset < rawKeys.length; offset += 200) {
    const chunk = rawKeys.slice(offset, offset + 200);
    const identities = chunk.map((key) => {
      if (!key.startsWith("v2:")) throw new Error(`[Verification Failure] Invalid ${entity} key`);
      return Object.fromEntries(JSON.parse(key.slice(3)));
    });
    const fields = [...new Set(identities.flatMap((identity) => Object.keys(identity)))];
    const docs = await model.find({
      configId: configObjId,
      profileId,
      $or: identities,
    }).select([...fields, "spend", "lastImportRunId", "importSourceVersion"].join(" ")).lean();

    for (let i = 0; i < identities.length; i++) {
      const identity = identities[i];
      const doc = docs.find((candidate) => Object.entries(identity).every(
        ([field, value]) => (candidate[field] ?? null) === value
      ));
      if (!doc) throw new Error(`[Verification Failure] ${entity} missing key ${chunk[i]} in Mongo`);
      if (doc.lastImportRunId === importRunId) {
        exactMatches++;
        exactSpendTotal += Number(doc.spend || 0);
      } else if (Number(doc.importSourceVersion || 0) > Number(sourceVersion || 0)) {
        supersededMatches++;
      } else {
        throw new Error(`[Verification Failure] ${entity} stale or mismatched key ${chunk[i]}`);
      }
    }
  }
  if (supersededMatches === 0 && expectedSpend !== undefined &&
    Math.abs(exactSpendTotal - Number(expectedSpend)) > 0.05) {
    throw new Error(`[Verification Failure] ${entity} spend mismatch: Mongo ${exactSpendTotal} vs staged ${expectedSpend}`);
  }
  return {
    verified: true,
    actualCount: exactMatches,
    supersededCount: supersededMatches,
    totalAccounted: exactMatches + supersededMatches,
    verifiedSpend: Number(exactSpendTotal.toFixed(2)),
  };
};

/**
* Verifies that the MongoDB records match the staged row counts and metrics for the import run.
* Checks exact expected keys and compares aggregate metrics. Rejects partial writes, while explicitly
* accounting for newer versioned documents if superseded.
*/
const verifyImportedRun = async (manifest) => {
  const {
    importRunId,
    entity,
    configId,
    profileId,
    startDate,
    endDate,
    expectedRows,
    expectedUniqueKeys,
    sourceVersion,
    expectedSpend,
    expectedImpressions,
    expectedClicks,
  } = manifest;
  const model = getModelForEntity(entity);
  if (isExtendedEntity(entity)) return verifyExtendedRun(manifest, model);
  const mongoose = require("mongoose");
  const configObjId = mongoose.Types.ObjectId.isValid(configId)
    ? new mongoose.Types.ObjectId(String(configId))
    : configId;

  const runVersion = sourceVersion ? Number(sourceVersion) : 0;
  const targetExpectedKeys = expectedUniqueKeys || expectedRows || 0;

  // Retrieve exact entity keys from Redis if available
  const keysKey = `${MANIFEST_KEY_PREFIX}${importRunId}:keys`;
  const expectedKeys = await redisClient.sMembers(keysKey);

  if (expectedKeys && expectedKeys.length > 0) {
    // 1. Strict Exact-Key Verification
    // Each key is format: entityId#reportDate or entityId#adGroupId#reportDate or entityId#adGroupId#adId#reportDate
    const parsedKeys = expectedKeys.map((k) => {
      const parts = k.split("#");
      if (entity.includes("campaign")) {
        return { campaignId: Number(parts[0]), reportDate: parts[1], key: k };
      } else if (entity.includes("adGroup")) {
        return { campaignId: Number(parts[0]), adGroupId: Number(parts[1]), reportDate: parts[2], key: k };
      } else if (entity.includes("productAd")) {
        return { campaignId: Number(parts[0]), adGroupId: Number(parts[1]), adId: Number(parts[2]), reportDate: parts[3], key: k };
      }
      return { key: k };
    });

    // Query Mongo for these exact documents
    let orConditions = {};
    if (entity.includes("campaign")) {
      const campaignIds = [...new Set(parsedKeys.map((p) => p.campaignId))];
      const dates = [...new Set(parsedKeys.map((p) => p.reportDate))];
      orConditions = { campaignId: { $in: campaignIds }, reportDate: { $in: dates } };
    } else if (entity.includes("adGroup")) {
      const adGroupIds = [...new Set(parsedKeys.map((p) => p.adGroupId))];
      const dates = [...new Set(parsedKeys.map((p) => p.reportDate))];
      orConditions = { adGroupId: { $in: adGroupIds }, reportDate: { $in: dates } };
    } else if (entity.includes("productAd")) {
      const adIds = [...new Set(parsedKeys.map((p) => p.adId))];
      const dates = [...new Set(parsedKeys.map((p) => p.reportDate))];
      orConditions = { adId: { $in: adIds }, reportDate: { $in: dates } };
    }

    const docs = await model
      .find({
        configId: configObjId,
        profileId,
        ...orConditions,
      })
      .select("campaignId adGroupId adId reportDate lastImportRunId importSourceVersion spend impressions clicks")
      .lean();

    const docMap = new Map();
    for (const d of docs) {
      let key = "";
      if (entity.includes("campaign")) key = `${d.campaignId}#${d.reportDate}`;
      else if (entity.includes("adGroup")) key = `${d.campaignId}#${d.adGroupId}#${d.reportDate}`;
      else if (entity.includes("productAd")) key = `${d.campaignId}#${d.adGroupId}#${d.adId}#${d.reportDate}`;
      docMap.set(key, d);
    }

    let exactMatches = 0;
    let supersededMatches = 0;
    let missingKeys = [];
    let staleOrCorruptKeys = [];
    let exactSpendTotal = 0;

    for (const pk of parsedKeys) {
      const doc = docMap.get(pk.key);
      if (!doc) {
        missingKeys.push(pk.key);
        continue;
      }

      if (doc.lastImportRunId === importRunId) {
        exactMatches++;
        exactSpendTotal += Number(doc.spend || 0);
      } else if (Number(doc.importSourceVersion || 0) > runVersion) {
        supersededMatches++;
      } else {
        staleOrCorruptKeys.push({
          key: pk.key,
          docRunId: doc.lastImportRunId,
          docVersion: doc.importSourceVersion,
          expectedVersion: runVersion,
        });
      }
    }

    if (missingKeys.length > 0) {
      throw new Error(
        `[Verification Failure] Run ${importRunId} failed exact key verification: ${missingKeys.length} expected rows missing in Mongo (e.g. ${missingKeys.slice(0, 3).join(", ")}).`
      );
    }

    if (staleOrCorruptKeys.length > 0) {
      throw new Error(
        `[Verification Failure] Run ${importRunId} has ${staleOrCorruptKeys.length} rows with stale version or mismatched importRunId in Mongo.`
      );
    }

    const totalAccounted = exactMatches + supersededMatches;
    if (totalAccounted < expectedKeys.length) {
      throw new Error(
        `[Verification Failure] Run ${importRunId} accounted for only ${totalAccounted} of ${expectedKeys.length} expected keys.`
      );
    }

    // Verify metrics integrity if all rows were exact matches and expected metrics were saved
    if (supersededMatches === 0 && expectedSpend !== undefined) {
      const spendDiff = Math.abs(exactSpendTotal - expectedSpend);
      if (spendDiff > 0.05) {
        throw new Error(
          `[Verification Failure] Spend mismatch for run ${importRunId}: Mongo total ${exactSpendTotal.toFixed(2)} vs expected ${expectedSpend.toFixed(2)} (diff: ${spendDiff.toFixed(2)})`
        );
      }
    }

    return {
      verified: true,
      actualCount: exactMatches,
      supersededCount: supersededMatches,
      totalAccounted,
      verifiedSpend: Number(exactSpendTotal.toFixed(2)),
    };
  }

  // 2. Fallback Verification (when Redis key set was not populated)
  const exactFilter = {
    configId: configObjId,
    profileId,
    lastImportRunId: importRunId,
  };
  if (startDate && endDate) {
    exactFilter.reportDate = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    exactFilter.reportDate = { $gte: startDate };
  } else if (endDate) {
    exactFilter.reportDate = { $lte: endDate };
  }
  const exactCount = await model.countDocuments(exactFilter);

  if (targetExpectedKeys > 0 && exactCount < targetExpectedKeys) {
    throw new Error(
      `[Verification Failure] Expected ${targetExpectedKeys} imported rows for run ${importRunId}, but only ${exactCount} stamped with runId in Mongo.`
    );
  }

  return { verified: true, actualCount: exactCount, totalAccounted: exactCount };
};

/**
* Reconciles staged runs across Redis and MongoDB to heal any gaps caused by worker crashes
* during the final commit window.
*/
const reconcileStagedRuns = async (entities = ["campaign", "adGroup", "productAd", ...EXTENDED_REPORT_ENTITIES]) => {
  let reconciledCount = 0;
  try {
    // Fast targeted reconciliation: query only reports that are currently uncompleted in MongoDB
    // instead of scanning thousands of historical manifests in Redis.
    const pendingReports = await reportsSchema.find({
      status: { $in: ["STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"] },
    }).limit(100).lean();

    for (const rep of pendingReports) {
      const importRunId = rep.importRunId;
      if (!importRunId) continue;
      const manifest = await getRunManifest(importRunId);
      if (!manifest) continue;

      // Case 1: Manifest is COMPLETED in Redis, but Mongo reportsSchema is still not COMPLETED
      if (manifest.status === RUN_STATUS.COMPLETED) {
        await reportsSchema.updateOne(
          { _id: rep._id },
          {
            $set: {
              status: "COMPLETED",
              importRunId,
              completedAt: new Date(),
            },
          }
        );
        reconciledCount++;
        write_logs({
          message: `[Reconciliation] Repaired Mongo report ${rep.reportId} status to COMPLETED for run ${importRunId}.`,
          log_type: "info",
        });
        if (rep.cronHistoryId) {
          await finalizeReportHistory(rep.cronHistoryId).catch((err) =>
            write_logs({ message: `[Report History Finalize] ${err.message}`, log_type: "warn" }));
        }
      }

      // Case 2: All batches processed in Redis (processedBatches >= expectedBatches), but manifest status was not transitioned to COMPLETED
      if (
        manifest.status === RUN_STATUS.IMPORTING &&
        manifest.expectedBatches > 0 &&
        manifest.processedBatches >= manifest.expectedBatches
      ) {
        try {
          const verifyResult = await verifyImportedRun(manifest);
          await reportsSchema.updateOne(
            { _id: rep._id },
            {
              $set: {
                status: "COMPLETED",
                importRunId,
                verifiedRows: verifyResult.actualCount,
                completedAt: new Date(),
              },
            }
          );
          if (rep.cronHistoryId) {
            await finalizeReportHistory(rep.cronHistoryId).catch((err) =>
              write_logs({ message: `[Report History Finalize] ${err.message}`, log_type: "warn" }));
          }

          await saveRunManifest(importRunId, {
            status: RUN_STATUS.COMPLETED,
            completedAt: new Date().toISOString(),
            verifiedCount: verifyResult.actualCount,
          });

          reconciledCount++;
          write_logs({
            message: `[Reconciliation] Successfully finalized crashed run ${importRunId} to COMPLETED.`,
            log_type: "info",
          });
        } catch (vErr) {
          write_logs({
            message: `[Reconciliation Note] Run ${importRunId} verification pending: ${vErr.message}`,
            log_type: "warn",
          });
        }
      }
    }
  } catch (err) {
    write_logs({
      message: `[Reconciliation Error] ${err.message}`,
      log_type: "error",
    });
  }

  return reconciledCount;
};

/**
* Scheduled bulk writer that processes ready report streams from Redis into MongoDB.
*/
const processStagedReportBatches = async (entities = ["campaign", "adGroup", "productAd", ...EXTENDED_REPORT_ENTITIES], { minIdleTime = 30000 } = {}) => {
  let totalBatchesProcessed = 0;

  // Run self-healing reconciliation before processing incoming stream entries
  await reconcileStagedRuns(entities);

  const ELIGIBLE_STATUSES = [
    RUN_STATUS.READY,
    RUN_STATUS.IMPORTING,
    RUN_STATUS.WRITE_FAILED,
  ];

  for (const entity of entities) {
    const streamKey = `${STREAM_KEY_PREFIX}${entity}`;
    await ensureConsumerGroup(streamKey);
    let pendingCursor = "0";
    let claimCursor = "0-0";
    let pendingScanDone = false;
    let claimScanDone = false;
    const attemptedMessages = new Set();
    const skipped = {};
    const skippedRuns = new Set();
    const recordSkip = (reason, importRunId) => {
      skipped[reason] = (skipped[reason] || 0) + 1;
      // Bound log size even when a stream contains a large blocked backlog.
      if (skippedRuns.size < 5) skippedRuns.add(importRunId);
    };

    // A report can contain more than ten 500-row batches. Drain all healthy
    // batches during this invocation. Finish pending/reclaim scans even when
    // a page is blocked, and attempt each message only once per invocation.
    for (let pass = 0; pass < 10000; pass++) {
      let passActivity = 0;
      let newMessageCount = 0;

      // Read from stream: first auto-claim pending messages from dead workers, then read from consumer PEL or new stream
      let entries = [];
      try {
        // 1. Reclaim pending messages left by previous/crashed consumers via xAutoClaim
        let claimedMessages = [];
        if (!claimScanDone) {
          try {
            const autoClaimResult = await redisClient.xAutoClaim(
              streamKey,
              CONSUMER_GROUP,
              CONSUMER_ID,
              minIdleTime,
              claimCursor,
              { COUNT: 10 }
            );
            if (autoClaimResult && autoClaimResult.messages?.length > 0) {
              claimedMessages = autoClaimResult.messages.filter((m) => m && m.id && m.message);
            }
            claimCursor = autoClaimResult?.nextId || "0-0";
            claimScanDone = claimCursor === "0-0";
          } catch (claimErr) {
            claimScanDone = true;
            write_logs({ message: `[xAutoClaim Note] ${claimErr.message}`, log_type: "info" });
          }
        }

        let pendingMessages = [];
        if (!pendingScanDone) {
          // 2. Check if this consumer itself has pending unacknowledged messages (id: "0")
          const consumerPending = await redisClient.xReadGroup(
            CONSUMER_GROUP,
            CONSUMER_ID,
            [{ key: streamKey, id: pendingCursor }],
            { COUNT: 10 }
          );

          pendingMessages = consumerPending?.[0]?.messages || [];
          if (pendingMessages.length > 0) {
            pendingCursor = pendingMessages[pendingMessages.length - 1].id;
          } else {
            pendingScanDone = true;
          }
        }
        // Always read new work as well: a STAGING run or a failing pending
        // batch must not block every later report on the entity stream.
        const newEntries = await redisClient.xReadGroup(
          CONSUMER_GROUP,
          CONSUMER_ID,
          [{ key: streamKey, id: ">" }],
          { COUNT: 10, BLOCK: 100 }
        );
        newMessageCount = newEntries?.[0]?.messages?.length || 0;
        const messagesById = new Map();
        for (const msg of [...claimedMessages, ...pendingMessages, ...(newEntries?.[0]?.messages || [])]) {
          if (msg?.id && !attemptedMessages.has(msg.id)) messagesById.set(msg.id, msg);
        }
        entries = [{ name: streamKey, messages: [...messagesById.values()] }];
      } catch (readErr) {
        write_logs({
          message: `[Report Worker Read Error] ${streamKey}: ${readErr.message}`,
          log_type: "error",
        });
        break;
      }

      if (!entries || entries.length === 0 || !entries[0].messages || entries[0].messages.length === 0) {
        if (pendingScanDone && claimScanDone && newMessageCount === 0) break;
        continue;
      }

      const messages = entries[0].messages;

      for (const msg of messages) {
        const { id: streamMsgId, message: fields } = msg;
        const { importRunId, batchId } = fields;
        attemptedMessages.add(streamMsgId);

        // 1. Check Run Manifest
        let manifest = await getRunManifest(importRunId);
        if (!manifest || manifest.status === RUN_STATUS.VALIDATION_FAILED) {
          recordSkip(manifest ? "invalidRun" : "missingManifest", importRunId);
          // Abandon invalid or discarded run
          await redisClient.xAck(streamKey, CONSUMER_GROUP, streamMsgId);
          await redisClient.xDel(streamKey, streamMsgId);
          passActivity++;
          continue;
        }

        // If run is still actively staging, DO NOT process yet and DO NOT ack (leave in stream)
        if (manifest.status === RUN_STATUS.STAGING) {
          recordSkip("staging", importRunId);
          continue;
        }

        // If run is already completed, ack and delete redundant message
        if (manifest.status === RUN_STATUS.COMPLETED) {
          await redisClient.xAck(streamKey, CONSUMER_GROUP, streamMsgId);
          await redisClient.xDel(streamKey, streamMsgId);
          passActivity++;
          continue;
        }

        // If the report was marked FAILED in MongoDB, abandon and clean up stream
        if (manifest.reportId) {
          const mongoReport = await reportsSchema.findOne({
            $or: [
              { importRunId },
              { reportId: manifest.reportId, profileId: manifest.profileId, configId: manifest.configId },
            ],
          }).select("status").lean();

          if (mongoReport && mongoReport.status === "FAILED") {
            await redisClient.xAck(streamKey, CONSUMER_GROUP, streamMsgId);
            await redisClient.xDel(streamKey, streamMsgId);
            await saveRunManifest(importRunId, {
              status: RUN_STATUS.VALIDATION_FAILED,
              lastError: "Report marked FAILED in MongoDB.",
            });
            passActivity++;
            continue;
          }
        }

        // Only process runs in eligible states (READY, IMPORTING, WRITE_FAILED)
        if (!ELIGIBLE_STATUSES.includes(manifest.status)) {
          recordSkip(`status:${manifest.status}`, importRunId);
          continue;
        }

        // 2. Acquire per-scope lock (config + profile + entity) to prevent overlapping writer races
        const lockScope = `${manifest.configId}_${manifest.profileId}_${entity}`;
        const lockToken = await acquireImportLock(lockScope, 60);

        if (!lockToken) {
          recordSkip("lockBusy", importRunId);
          // Another worker is actively importing this profile/entity; leave batch for next cycle
          continue;
        }

        // Heartbeat timer to renew lock lease during long bulk writes
        const lockHeartbeat = setInterval(async () => {
          try {
            await renewImportLock(lockScope, lockToken, 60);
          } catch (_) {}
        }, 20000);

        try {
          // A different writer may have committed another batch while this
          // invocation was waiting for the scope lock. Use its current count.
          manifest = await getRunManifest(importRunId);
          if (manifest?.status === RUN_STATUS.COMPLETED) {
            await redisClient.xAck(streamKey, CONSUMER_GROUP, streamMsgId);
            await redisClient.xDel(streamKey, streamMsgId);
            passActivity++;
            continue;
          }
          if (!manifest || !ELIGIBLE_STATUSES.includes(manifest.status)) {
            recordSkip(manifest ? `status:${manifest.status}` : "missingManifest", importRunId);
            continue;
          }

          // Stream entries can already be held in another writer's memory when
          // atomicBatchConfirm commits this batch and deletes its payload. Check
          // the committed marker under the scope lock before loading that payload.
          const processedBatchesKey = `${MANIFEST_KEY_PREFIX}${importRunId}:batches`;
          if (await redisClient.sIsMember(processedBatchesKey, batchId)) {
            await redisClient.xAck(streamKey, CONSUMER_GROUP, streamMsgId);
            await redisClient.xDel(streamKey, streamMsgId);
            passActivity++;
            write_logs({
              message: `[Report Batch Replay] Skipped already confirmed batch ${batchId} for ${importRunId}.`,
              log_type: "info",
            });
            continue;
          }

          // Mark manifest as IMPORTING if currently READY
          if (manifest.status === RUN_STATUS.READY) {
            await saveRunManifest(importRunId, {
              status: RUN_STATUS.IMPORTING,
              importStartedAt: new Date().toISOString(),
            });
          }

          // 3. Load Batch Payload from Redis
          const batchKey = `${BATCH_KEY_PREFIX}${batchId}`;
          const rawPayload = await redisClient.get(batchKey);

          if (!rawPayload) {
            throw new Error(`Batch payload ${batchKey} not found in Redis (possible expiration or eviction).`);
          }

          const rows = JSON.parse(rawPayload);
          const sourceVersion = manifest.sourceVersion
            ? Number(manifest.sourceVersion)
            : (manifest.createdAt ? new Date(manifest.createdAt).getTime() : Date.now());

          // 4. Build deterministic MongoDB upsert operations
          const bulkOps = rows.map((row) => isExtendedEntity(entity)
            ? buildExtendedUpsertOp(row, sourceVersion)
            : buildMongoUpsertOp(row, sourceVersion));

          // 5. Bulk write to MongoDB (fails loudly if any non-duplicate write error occurs)
          const model = getModelForEntity(entity);
          await parallelBulkWrite(model, bulkOps);

          // Fencing check: verify lock was not stolen before commit/verification
          const isLockHeld = await checkImportLock(lockScope, lockToken);
          if (!isLockHeld) {
            throw new Error(`Lock fencing failure: lock for ${lockScope} was lost during bulk write.`);
          }

          // 6. Check if this is the final batch of the run
          const nextProcessed = (Number(manifest.processedBatches || 0) + 1);
          const isFinalBatch = nextProcessed >= Number(manifest.expectedBatches);

          if (isFinalBatch) {
            // Verify complete row count and exact keys in MongoDB before completing run
            const verifyResult = await verifyImportedRun({
              ...manifest,
              sourceVersion,
            });

            // 1. Mark corresponding reportsSchema document COMPLETED in MongoDB FIRST
            if (manifest.reportId) {
              await reportsSchema.updateOne(
                {
                  reportId: manifest.reportId,
                  profileId: manifest.profileId,
                  configId: manifest.configId,
                },
                {
                  $set: {
                    status: "COMPLETED",
                    importRunId,
                    verifiedRows: verifyResult.actualCount,
                    completedAt: new Date(),
                  },
                }
              );
            }
            const completedReport = manifest.reportId && await reportsSchema.findOne({
              reportId: manifest.reportId, profileId: manifest.profileId, configId: manifest.configId,
            }).select("cronHistoryId").lean();
            if (completedReport?.cronHistoryId) {
              await finalizeReportHistory(completedReport.cronHistoryId).catch((err) =>
                write_logs({ message: `[Report History Finalize] ${err.message}`, log_type: "warn" }));
            }

            // 2. Atomically mark manifest COMPLETED, acknowledge stream entry, and clean batch payload
            await atomicBatchConfirm({
              streamKey,
              streamMsgId,
              batchKey,
              batchId,
              importRunId,
              isFinalBatch: true,
              finalManifestUpdates: {
                status: RUN_STATUS.COMPLETED,
                processedBatches: Number(manifest.expectedBatches),
                completedAt: new Date().toISOString(),
                verifiedCount: verifyResult.actualCount,
              },
            });

            write_logs({
              message: `[Report Import Completed] Run ${importRunId} for ${entity} (${manifest.profileId}) successfully verified and marked COMPLETED.`,
              log_type: "info",
            });
          } else {
            // Atomically increment manifest processedBatches, acknowledge stream entry, and clean batch payload
            await atomicBatchConfirm({
              streamKey,
              streamMsgId,
              batchKey,
              batchId,
              importRunId,
              isFinalBatch: false,
            });
          }

          totalBatchesProcessed++;
          passActivity++;
        } catch (batchErr) {
          write_logs({
            message: `[Report Batch Failure] Failed processing batch ${batchId} for ${importRunId}: ${batchErr.message}`,
            log_type: "error",
          });

          // Legacy failedAttempts was shared by the entire run. Never let a
          // different batch consume this batch's retry budget.
          const attemptsField = `batchAttempts:${batchId}`;
          const failedAttempts = Number(manifest[attemptsField] || 0) + 1;
          if (failedAttempts >= 5) {
            write_logs({
              message: `[Report Batch Max Retries Exceeded] Batch ${batchId} for run ${importRunId} failed ${failedAttempts} times (${batchErr.message}). Discarding stream entry and marking report FAILED.`,
              log_type: "error",
            });

            if (manifest.reportId) {
              await reportsSchema.updateOne(
                {
                  $or: [
                    { importRunId },
                    { reportId: manifest.reportId, profileId: manifest.profileId, configId: manifest.configId },
                  ],
                },
                {
                  $set: {
                    status: "FAILED",
                    errorMessage: `Batch writer failed after ${failedAttempts} attempts: ${batchErr.message}`,
                    failedAt: new Date(),
                  },
                }
              );
            }

            await saveRunManifest(importRunId, {
              status: RUN_STATUS.VALIDATION_FAILED,
              [attemptsField]: failedAttempts,
              lastError: `Max retries exceeded: ${batchErr.message}`,
            });

            await redisClient.xAck(streamKey, CONSUMER_GROUP, streamMsgId);
            await redisClient.xDel(streamKey, streamMsgId);
            passActivity++;
          } else {
            await saveRunManifest(importRunId, {
              status: RUN_STATUS.WRITE_FAILED,
              [attemptsField]: failedAttempts,
              lastFailedBatchId: batchId,
              lastError: batchErr.message,
            });
          }
        } finally {
          clearInterval(lockHeartbeat);
          await releaseImportLock(lockScope, lockToken);
        }
      }
      if (passActivity === 0 && pendingScanDone && claimScanDone && newMessageCount === 0) break;
    }
    if (skippedRuns.size > 0) {
      write_logs({
        message: `[Report Batch Skipped] ${JSON.stringify({ entity, reasons: skipped, sampleRunIds: [...skippedRuns] })}`,
        log_type: "warn",
      });
    }
  }

  return { totalBatchesProcessed };
};

module.exports = {
  processStagedReportBatches,
  verifyImportedRun,
  reconcileStagedRuns,
};
