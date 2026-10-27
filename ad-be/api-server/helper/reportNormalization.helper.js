const mongoose = require("mongoose");
const { parseStrictMetric, calcMetrics } = require("../helper/common");

/**
 * Normalizes and validates a single row from an Amazon Sponsored Products report.
 * Throws validation error if required fields are missing or invalid.
 */
const normalizeReportRow = (row, { importRunId, entity, configId, profileId, accountType }) => {
  const isVendor = accountType?.toLowerCase() === "vendor";
  const purchaseField = isVendor ? "purchases14d" : "purchases7d";
  const salesField = isVendor ? "sales14d" : "sales7d";
  const attributionDays = isVendor ? 14 : 7;
  const context = `importRunId=${importRunId} entity=${entity} profile=${profileId} config=${configId} type=${accountType || "unknown"}`;

  const impressions = parseStrictMetric(row.impressions, "impressions", context);
  const clicks = parseStrictMetric(row.clicks, "clicks", context);
  const spend = parseStrictMetric(row.spend ?? row.cost, "spend", context);
  const purchases = parseStrictMetric(row[purchaseField], purchaseField, context);
  const sales = parseStrictMetric(row[salesField], salesField, context);

  const reportDate = row.date;
  if (!reportDate || typeof reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error(`[Validation Failure] Invalid or missing date '${reportDate}' in ${context}`);
  }

  const baseMetrics = {
    impressions,
    clicks,
    spend,
    sales,
    orders: purchases,
  };
  const calculatedMetrics = calcMetrics(baseMetrics);

  const campaignStatus = (row.campaignStatus || row.status || row.state || "").toUpperCase();

  const normalized = {
    importRunId,
    entity,
    configId: String(configId),
    profileId: Number(profileId),
    campaignId: Number(row.campaignId),
    campaignName: row.campaignName || "",
    campaignBudgetAmount: row.campaignBudgetAmount !== undefined ? Number(row.campaignBudgetAmount) : undefined,
    reportDate,
    attributionDays,
    ...(campaignStatus && { campaignStatus }),
    metrics: {
      impressions,
      clicks,
      spend,
      purchases,
      orders: purchases,
      sales,
      ...calculatedMetrics,
    },
  };

  if (entity.includes("adGroup")) {
    if (!row.adGroupId) throw new Error(`[Validation Failure] Missing adGroupId in ${context}`);
    normalized.adGroupId = Number(row.adGroupId);
    normalized.adGroupName = row.adGroupName || "";
    normalized.adStatus = row.adStatus || "";
  }

  if (entity.includes("productAd")) {
    if (!row.adGroupId) throw new Error(`[Validation Failure] Missing adGroupId in ${context}`);
    if (!row.adId) throw new Error(`[Validation Failure] Missing adId in ${context}`);
    normalized.adGroupId = Number(row.adGroupId);
    normalized.adGroupName = row.adGroupName || "";
    normalized.adId = Number(row.adId);
    normalized.advertisedAsin = row.advertisedAsin || "";
  }

  return normalized;
};

/**
 * Builds deterministic MongoDB filter and update operation for a normalized row.
 */
const buildMongoUpsertOp = (row, sourceVersion = Date.now()) => {
  const { entity, configId, profileId, campaignId, reportDate, metrics } = row;
  const configObjId = mongoose.Types.ObjectId.isValid(configId)
    ? new mongoose.Types.ObjectId(String(configId))
    : configId;

  if (entity.includes("campaign")) {
    return {
      updateOne: {
        filter: {
          configId: configObjId,
          profileId,
          campaignId,
          reportDate,
        },
        update: [
          {
            $set: {
              ...(row.campaignStatus ? {
                status: {
                  $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.campaignStatus, "$status"]
                }
              } : {}),
              type: { $ifNull: ["$type", "Sponsored Products"] },
              name: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.campaignName, "$name"]
              },
              budget: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.campaignBudgetAmount, "$budget"]
              },
              impressions: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.impressions, "$impressions"]
              },
              clicks: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.clicks, "$clicks"]
              },
              spend: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.spend, "$spend"]
              },
              sales: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.sales, "$sales"]
              },
              orders: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.purchases, "$orders"]
              },
              cpc: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.cpc, "$cpc"]
              },
              ctr: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.ctr, "$ctr"]
              },
              roas: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.roas, "$roas"]
              },
              acos: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.acos, "$acos"]
              },
              lastImportRunId: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.importRunId, "$lastImportRunId"]
              },
              importSourceVersion: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, sourceVersion, "$importSourceVersion"]
              },
            },
          },
        ],
        upsert: true,
      },
    };
  }

  if (entity.includes("adGroup")) {
    return {
      updateOne: {
        filter: {
          configId: configObjId,
          profileId,
          campaignId,
          adGroupId: row.adGroupId,
          reportDate,
        },
        update: [
          {
            $set: {
              name: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.adGroupName, "$name"]
              },
              status: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.adStatus, "$status"]
              },
              impressions: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.impressions, "$impressions"]
              },
              clicks: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.clicks, "$clicks"]
              },
              spend: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.spend, "$spend"]
              },
              sales: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.sales, "$sales"]
              },
              orders: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.purchases, "$orders"]
              },
              cpc: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.cpc, "$cpc"]
              },
              ctr: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.ctr, "$ctr"]
              },
              roas: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.roas, "$roas"]
              },
              acos: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.acos, "$acos"]
              },
              lastImportRunId: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.importRunId, "$lastImportRunId"]
              },
              importSourceVersion: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, sourceVersion, "$importSourceVersion"]
              },
            },
          },
        ],
        upsert: true,
      },
    };
  }

  if (entity.includes("productAd")) {
    return {
      updateOne: {
        filter: {
          configId: configObjId,
          profileId,
          campaignId,
          adGroupId: row.adGroupId,
          adId: row.adId,
          reportDate,
        },
        update: [
          {
            $set: {
              campaignName: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.campaignName, "$campaignName"]
              },
              adGroupName: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.adGroupName, "$adGroupName"]
              },
              asin: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.advertisedAsin, "$asin"]
              },
              impressions: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.impressions, "$impressions"]
              },
              clicks: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.clicks, "$clicks"]
              },
              spend: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.spend, "$spend"]
              },
              sales: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.sales, "$sales"]
              },
              orders: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.purchases, "$orders"]
              },
              cpc: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.cpc, "$cpc"]
              },
              ctr: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.ctr, "$ctr"]
              },
              roas: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.roas, "$roas"]
              },
              acos: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, metrics.acos, "$acos"]
              },
              lastImportRunId: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, row.importRunId, "$lastImportRunId"]
              },
              importSourceVersion: {
                $cond: [{ $lte: [{ $ifNull: ["$importSourceVersion", 0] }, sourceVersion] }, sourceVersion, "$importSourceVersion"]
              },
            },
          },
        ],
        upsert: true,
      },
    };
  }

  throw new Error(`Unsupported entity type: ${entity}`);
};

module.exports = {
  normalizeReportRow,
  buildMongoUpsertOp,
};
