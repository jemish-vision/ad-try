const fs = require("fs");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");
const moment = require("moment-timezone");
const { normalizeReportRow } = require("../helper/reportNormalization.helper");
const { isExtendedEntity, normalizeExtendedRow, extendedRowKey } = require("../helper/reportExtendedEntities.helper");
const { redisClient } = require("./redis.service");
const {
  getFileChecksum,
  saveRunManifest,
  stageBatchInRedis,
  RUN_STATUS,
  MANIFEST_KEY_PREFIX,
} = require("./reportStaging.service");
const { write_logs } = require("../../winston/utility/logger");

const STAGE_BATCH_SIZE = 500;

/**
 * Validates the entire report file, normalizes all rows, checks for intra-file duplicates,
 * and stages verified batches into Redis Streams.
 *
 * Sets manifest status to READY only after every single batch is confirmed staged in Redis.
 */
const stageReportFileInRedis = async ({
  importRunId,
  entity,
  filePath,
  meta: { profileId, configId, accountType, reportId, reportTypeId, startDate, endDate, reportCreatedAt },
}) => {
  const fileChecksum = await getFileChecksum(filePath);
  const sourceVersion = reportCreatedAt ? new Date(reportCreatedAt).getTime() : Date.now();

  // Initialize Run Manifest
  await saveRunManifest(importRunId, {
    importRunId,
    entity,
    reportId,
    reportTypeId,
    configId: String(configId),
    profileId: Number(profileId),
    accountType: accountType || "seller",
    startDate,
    endDate,
    filePath,
    fileChecksum,
    sourceVersion,
    status: RUN_STATUS.STAGING,
    expectedRows: 0,
    expectedBatches: 0,
    stagedBatches: 0,
    processedBatches: 0,
    createdAt: new Date().toISOString(),
  });

  // For targeting reports where Amazon omits target IDs for auto-targets,
  // pre-load existing Amazon target IDs (T-) for active auto-targets so rows map directly to genuine IDs.
  // Uses index on { configId, profileId, reportDate } with recent dates to keep memory and query time minimal.
  let targetIdMap = null;
  if (entity === "targeting" || entity === "sbTargeting") {
    try {
      const mongoose = require("mongoose");
      const targetModel = entity === "sbTargeting"
        ? require("../models/sbTargeting.model")
        : require("../models/targeting.model");

      const resolvedConfig = mongoose.Types.ObjectId.isValid(configId)
        ? new mongoose.Types.ObjectId(String(configId))
        : configId;

      const latestDoc = await targetModel.findOne(
        { configId: resolvedConfig, profileId: Number(profileId) },
        { reportDate: 1 }
      ).sort({ reportDate: -1 }).lean();

      if (latestDoc?.reportDate) {
        const dateThreshold = moment(latestDoc.reportDate).subtract(14, "days").format("YYYY-MM-DD");
        const existingTargets = await targetModel.find({
          configId: resolvedConfig,
          profileId: Number(profileId),
          reportDate: { $gte: dateThreshold },
          keywordType: "TARGETING_EXPRESSION_PREDEFINED",
          targetId: { $regex: /^T-/ },
        }).select("campaignId adGroupId targeting targetId").lean();

        targetIdMap = new Map();
        for (const t of existingTargets) {
          if (t.campaignId && t.adGroupId && t.targeting && t.targetId) {
            const key = `${t.campaignId}:${t.adGroupId}:${t.targeting}`;
            if (!targetIdMap.has(key)) {
              targetIdMap.set(key, t.targetId);
            }
          }
        }
      }
    } catch (err) {
      write_logs({ message: `[stageReportFileInRedis] Warning loading targetIdMap: ${err.message}`, log_type: "warn" });
    }
  }

  return new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(filePath),
      parser(),
      streamArray(),
    ]);

    let currentBatch = [];
    let batchIndex = 0;
    let totalRows = 0;
    let totalSpend = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalSales = 0;
    let totalPurchases = 0;
    const seenEntityKeys = new Set();
    const stagedBatchIds = [];

    pipeline.on("data", async ({ value }) => {
      pipeline.pause();

      try {
        // 1. Validate & Normalize
        const normalize = isExtendedEntity(entity) ? normalizeExtendedRow : normalizeReportRow;
        const normalized = normalize(value, {
          importRunId,
          entity,
          configId,
          profileId,
          accountType,
          targetIdMap,
        });

        // 2. Intra-file duplicate detection
        let dedupKey = "";
        if (isExtendedEntity(entity)) {
          dedupKey = extendedRowKey(normalized);
        } else if (entity.includes("campaign")) {
          dedupKey = `${normalized.campaignId}#${normalized.reportDate}`;
        } else if (entity.includes("adGroup")) {
          dedupKey = `${normalized.campaignId}#${normalized.adGroupId}#${normalized.reportDate}`;
        } else if (entity.includes("productAd")) {
          dedupKey = `${normalized.campaignId}#${normalized.adGroupId}#${normalized.adId}#${normalized.reportDate}`;
        }

        if (seenEntityKeys.has(dedupKey)) {
          if (isExtendedEntity(entity)) {
            throw new Error(`[Validation Failure] Duplicate ${entity} row identity ${dedupKey} in report ${reportId}`);
          }
          write_logs({
            message: `[Report Staging Notice] Duplicate key within report file: ${dedupKey} in run ${importRunId}. Latest occurrence retained.`,
            log_type: "warn",
          });
        }
        seenEntityKeys.add(dedupKey);

        totalSpend += Number(normalized.metrics.spend || 0);
        totalClicks += Number(normalized.metrics.clicks || 0);
        totalImpressions += Number(normalized.metrics.impressions || 0);
        totalSales += Number(normalized.metrics.sales || 0);
        totalPurchases += Number(normalized.metrics.purchases || 0);

        currentBatch.push(normalized);
        totalRows++;

        if (currentBatch.length >= STAGE_BATCH_SIZE) {
          const batchToStage = currentBatch;
          currentBatch = [];
          const idx = batchIndex++;

          const staged = await stageBatchInRedis(importRunId, entity, idx, batchToStage);
          stagedBatchIds.push(staged.batchId);
        }

        pipeline.resume();
      } catch (err) {
        console.error(`\n❌ [stageReportFileInRedis Validation Error] Entity: ${entity}, Run: ${importRunId}, Row #${totalRows}: ${err.message}`);
        console.error(`   Offending Row Data:`, JSON.stringify(value));
        write_logs({
          message: `[stageReportFileInRedis Validation Error] ${entity} run ${importRunId} row #${totalRows}: ${err.message}`,
          log_type: "error",
        });
        pipeline.destroy(err);
        await saveRunManifest(importRunId, {
          status: RUN_STATUS.VALIDATION_FAILED,
          error: err.message,
        }).catch(() => {});
        return reject(err);
      }
    });

    pipeline.on("end", async () => {
      try {
        if (currentBatch.length > 0) {
          const idx = batchIndex++;
          const staged = await stageBatchInRedis(importRunId, entity, idx, currentBatch);
          stagedBatchIds.push(staged.batchId);
          currentBatch = [];
        }

        // Store expected entity keys in Redis set for strict verification
        const keysKey = `${MANIFEST_KEY_PREFIX}${importRunId}:keys`;
        if (seenEntityKeys.size > 0) {
          const keysArray = Array.from(seenEntityKeys);
          for (let i = 0; i < keysArray.length; i += 1000) {
            await redisClient.sAdd(keysKey, keysArray.slice(i, i + 1000));
          }
          await redisClient.expire(keysKey, 7 * 24 * 3600);
        }

        // Even an empty report needs a stream entry so the writer can verify and
        // transition the report record to COMPLETED.
        if (batchIndex === 0) {
          const staged = await stageBatchInRedis(importRunId, entity, batchIndex++, []);
          stagedBatchIds.push(staged.batchId);
        }

        // Mark run as READY now that every single batch is staged
        await saveRunManifest(importRunId, {
          status: RUN_STATUS.READY,
          expectedRows: totalRows,
          expectedUniqueKeys: seenEntityKeys.size,
          expectedBatches: batchIndex,
          stagedBatches: batchIndex,
          expectedSpend: Number(totalSpend.toFixed(2)),
          expectedImpressions: totalImpressions,
          expectedClicks: totalClicks,
          expectedSales: Number(totalSales.toFixed(2)),
          expectedOrders: totalPurchases,
          stagedAt: new Date().toISOString(),
        });

        resolve({
          importRunId,
          totalRows,
          totalBatches: batchIndex,
          fileChecksum,
        });
      } catch (endErr) {
        await saveRunManifest(importRunId, {
          status: RUN_STATUS.VALIDATION_FAILED,
          error: endErr.message,
        }).catch(() => {});
        reject(endErr);
      }
    });

    pipeline.on("error", async (err) => {
      pipeline.removeAllListeners();
      pipeline.destroy();
      await saveRunManifest(importRunId, {
        status: RUN_STATUS.VALIDATION_FAILED,
        error: err.message,
      }).catch(() => {});
      reject(err);
    });
  });
};

module.exports = {
  stageReportFileInRedis,
};
