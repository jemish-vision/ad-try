const moment = require("moment-timezone");
const mongoose = require("mongoose");
const keywordsHourlyPerformanceSchema = require("../models/keywordsHourlyPerformanceSchema.model");
const { cron_logs } = require("../../winston/cronAutomation/logger");
const { write_logs: ams_write_logs } = require("../../winston/ams/logger");
const { sendEmailHelper } = require("../helper/emailHelper");

/**
 * Calculates start and end time strings for an hourly window.
 * @param {string|number} hourStr - 2-digit hour ("00" to "23")
 * @returns {{ startTime: string, endTime: string }}
 */
function getHourlyWindow(hourStr) {
  const h = parseInt(hourStr, 10);
  const startH = isNaN(h) ? 0 : Math.max(0, Math.min(23, h));
  const nextH = (startH + 1) % 24;
  const startTime = `${String(startH).padStart(2, "0")}:00`;
  const endTime = `${String(nextH).padStart(2, "0")}:00`;
  return { startTime, endTime };
}

/**
 * Consolidates sub-hourly (second/minute) performance records for a single date into hourly buckets.
 *
 * @param {string} reportDate - Date in "YYYY-MM-DD" format
 * @param {object} [options]
 * @param {number} [options.batchSize=1000] - Batch size for inserting consolidated records
 * @returns {Promise<{ success: boolean, reportDate: string, rawCount: number, hourlyCount: number, error?: string }>}
 */
async function consolidateDateHourly(reportDate, options = {}) {
  const batchSize = options.batchSize || 1000;

  try {
    // 1. Check if there are any unaggregated raw records for this date
    const rawCount = await keywordsHourlyPerformanceSchema.countDocuments({
      reportDate,
      isHourlyAggregated: { $ne: true },
    });

    if (rawCount === 0) {
      return {
        success: true,
        reportDate,
        rawCount: 0,
        hourlyCount: 0,
        message: "No unaggregated records found for this date",
      };
    }

    cron_logs({
      message: `[HourlyDataConsolidation] Starting consolidation for date: ${reportDate} (${rawCount} raw records)`,
      log_type: "info",
    });

    // 2. Clean up any partial isHourlyAggregated: true records for this date from a previous aborted run
    await keywordsHourlyPerformanceSchema.deleteMany({
      reportDate,
      isHourlyAggregated: true,
    });

    // 3. Aggregate all records for this date by (configId, profileId, marketplaceId, reportDate, campaignId, adGroupId, keywordId, placement, type, hour)
    const pipeline = [
      {
        $match: {
          reportDate,
          isHourlyAggregated: { $ne: true },
        },
      },
      {
        $group: {
          _id: {
            configId: "$configId",
            profileId: "$profileId",
            marketplaceId: "$marketplaceId",
            reportDate: "$reportDate",
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
            keywordId: "$keywordId",
            placement: "$placement",
            type: "$type",
            hour: {
              $let: {
                vars: {
                  cleanTime: { $ifNull: ["$startTime", "00:00"] },
                  colonIdx: { $indexOfCP: [{ $ifNull: ["$startTime", "00:00"] }, ":"] },
                },
                in: {
                  $cond: [
                    { $eq: ["$$colonIdx", 1] },
                    { $concat: ["0", { $substrCP: ["$$cleanTime", 0, 1] }] },
                    {
                      $cond: [
                        { $gte: [{ $strLenCP: "$$cleanTime" }, 2] },
                        { $substrCP: ["$$cleanTime", 0, 2] },
                        "00",
                      ],
                    },
                  ],
                },
              },
            },
          },
          impressions: { $sum: { $ifNull: ["$impressions", 0] } },
          clicks: { $sum: { $ifNull: ["$clicks", 0] } },
          spends: { $sum: { $ifNull: ["$spends", 0] } },
          sales: { $sum: { $ifNull: ["$sales", 0] } },
          units: { $sum: { $ifNull: ["$units", 0] } },
          orders: { $sum: { $ifNull: ["$orders", 0] } },
          keywordText: { $max: "$keywordText" },
          matchType: { $max: "$matchType" },
          currency: { $max: "$currency" },
          earliestCreatedAt: { $min: "$createdAt" },
        },
      },
    ];

    const aggregatedCursor = keywordsHourlyPerformanceSchema.aggregate(pipeline, {
      allowDiskUse: true,
    });

    const consolidatedDocs = [];
    for await (const doc of aggregatedCursor) {
      const { startTime, endTime } = getHourlyWindow(doc._id.hour);

      consolidatedDocs.push({
        configId: doc._id.configId,
        profileId: doc._id.profileId,
        marketplaceId: doc._id.marketplaceId || "",
        reportDate: doc._id.reportDate,
        startTime,
        endTime,
        type: doc._id.type,
        campaignId: doc._id.campaignId,
        adGroupId: doc._id.adGroupId,
        keywordId: doc._id.keywordId,
        keywordText: doc.keywordText || "",
        matchType: doc.matchType || "",
        placement: doc._id.placement || "",
        impressions: Math.round(doc.impressions || 0),
        clicks: Math.round(doc.clicks || 0),
        spends: Number((doc.spends || 0).toFixed(4)),
        sales: Number((doc.sales || 0).toFixed(4)),
        units: Math.round(doc.units || 0),
        orders: Math.round(doc.orders || 0),
        currency: doc.currency || "",
        isHourlyAggregated: true,
        // Preserve earliest creation timestamp so 396-day TTL retention behaves accurately
        createdAt: doc.earliestCreatedAt || new Date(),
        updatedAt: new Date(),
      });
    }

    const hourlyCount = consolidatedDocs.length;

    // 4. Insert consolidated hourly records in batches
    for (let i = 0; i < consolidatedDocs.length; i += batchSize) {
      const chunk = consolidatedDocs.slice(i, i + batchSize);
      await keywordsHourlyPerformanceSchema.insertMany(chunk, {
        ordered: false,
      });
    }

    // Verify insertion count before deleting raw unaggregated records
    const insertedCount = await keywordsHourlyPerformanceSchema.countDocuments({
      reportDate,
      isHourlyAggregated: true,
    });
    if (insertedCount < hourlyCount) {
      throw new Error(
        `Consolidation verification failed for ${reportDate}: expected ${hourlyCount} records, but found ${insertedCount}. Aborting raw data deletion.`
      );
    }

    // 5. Delete raw unaggregated records for this date
    await keywordsHourlyPerformanceSchema.deleteMany({
      reportDate,
      isHourlyAggregated: { $ne: true },
    });

    const savingsPct =
      rawCount > 0
        ? (((rawCount - hourlyCount) / rawCount) * 100).toFixed(1)
        : "0.0";

    cron_logs({
      message: `[HourlyDataConsolidation] ✓ Date ${reportDate}: Consolidated ${rawCount} raw records → ${hourlyCount} hourly records (Saved ${savingsPct}% space)`,
      log_type: "info",
    });

    return {
      success: true,
      reportDate,
      rawCount,
      hourlyCount,
      savingsPct,
    };
  } catch (error) {
    cron_logs({
      message: `[HourlyDataConsolidation] ✗ Failed consolidation for date ${reportDate}: ${error.message}`,
      log_type: "error",
    });
    return {
      success: false,
      reportDate,
      rawCount: 0,
      hourlyCount: 0,
      error: error.message,
    };
  }
}

/**
 * Main nightly job to consolidate sub-hourly keyword streaming data into hourly data for records older than 30 days.
 *
 * @param {object} [options]
 * @param {number} [options.retentionDays=30] - Number of days to keep raw second/minute data before consolidation
 * @param {number} [options.batchSize=1000] - Batch size for insert operations
 * @param {string} [options.targetDate] - Optional single date to consolidate
 * @returns {Promise<{ success: boolean, processedDates: number, totalRawCount: number, totalHourlyCount: number, errors: string[] }>}
 */
async function cronConsolidateHourlyData(options = {}) {
  const retentionDays =
    Number(options.retentionDays || process.env.HOURLY_DATA_RETENTION_DAYS) || 30;
  const cutoffDate = moment().subtract(retentionDays, "days").format("YYYY-MM-DD");

  cron_logs({
    message: `[HourlyDataConsolidation] Nightly Job Started. Consolidating records older than ${retentionDays} days (before ${cutoffDate})`,
    log_type: "info",
  });

  const startTime = Date.now();
  const resultSummary = {
    success: true,
    processedDates: 0,
    totalRawCount: 0,
    totalHourlyCount: 0,
    errors: [],
  };

  try {
    let candidateDates = [];
    if (options.targetDate) {
      candidateDates = [options.targetDate];
    } else {
      // Find all distinct reportDate values older than cutoffDate having unaggregated records
      candidateDates = await keywordsHourlyPerformanceSchema.distinct("reportDate", {
        reportDate: { $lt: cutoffDate, $ne: null },
        isHourlyAggregated: { $ne: true },
      });
    }

    // Filter valid date strings and sort chronologically (oldest first)
    candidateDates = candidateDates
      .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();

    if (candidateDates.length === 0) {
      cron_logs({
        message: `[HourlyDataConsolidation] No unaggregated candidate dates found older than ${cutoffDate}. All past data is already consolidated.`,
        log_type: "info",
      });
      return resultSummary;
    }

    cron_logs({
      message: `[HourlyDataConsolidation] Found ${candidateDates.length} candidate date(s) to consolidate: ${candidateDates.join(", ")}`,
      log_type: "info",
    });

    for (const date of candidateDates) {
      const dateResult = await consolidateDateHourly(date, options);
      if (dateResult.success) {
        resultSummary.processedDates++;
        resultSummary.totalRawCount += dateResult.rawCount;
        resultSummary.totalHourlyCount += dateResult.hourlyCount;
      } else {
        resultSummary.errors.push(`${date}: ${dateResult.error}`);
      }
    }
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const overallSavings =
      resultSummary.totalRawCount > 0
        ? (
          ((resultSummary.totalRawCount - resultSummary.totalHourlyCount) /
            resultSummary.totalRawCount) *
          100
        ).toFixed(1)
        : "0.0";

    cron_logs({
      message: `[HourlyDataConsolidation] Nightly Job Completed in ${durationSec}s. Processed ${resultSummary.processedDates}/${candidateDates.length} dates. Raw: ${resultSummary.totalRawCount} → Hourly: ${resultSummary.totalHourlyCount} (Saved ~${overallSavings}% storage space). Errors: ${resultSummary.errors.length}`,
      log_type: "info",
    });

    if (resultSummary.errors.length > 0 && process.env.RECEIVER_EMAIL) {
      await sendEmailHelper(
        process.env.RECEIVER_EMAIL,
        "[Alert] Hourly Data Consolidation Nightly Job Partial Failure",
        `<p>Hourly Data Consolidation encountered errors during execution:</p><pre>${JSON.stringify(
          resultSummary.errors,
          null,
          2
        )}</pre>`
      ).catch(() => { });
    }

    return resultSummary;
  } catch (err) {
    cron_logs({
      message: `[HourlyDataConsolidation] Fatal error during consolidation run: ${err.stack || err.message}`,
      log_type: "error",
    });
    resultSummary.success = false;
    resultSummary.errors.push(err.message);
    return resultSummary;
  }
}

module.exports = {
  cronConsolidateHourlyData,
  consolidateDateHourly,
  getHourlyWindow,
};
