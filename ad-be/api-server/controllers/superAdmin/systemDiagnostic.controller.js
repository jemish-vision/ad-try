const mongoose = require("mongoose");
const moment = require("moment");
const { executeLiveSyncAudit } = require("../../services/liveSyncAudit.service");
const { processStagedReportBatches } = require("../../services/reportBatchWriter.service");
const { write_logs } = require("../../../winston/utility/logger");

let redisClient = null;
let queues = {};

try {
  const { createRedisClient } = require("../../../queue-service/config/bullmq.config");
  redisClient = createRedisClient("producer");
} catch (_) {}

try {
  const { getQueues } = require("../../../queue-service/queues/queues");
  queues = getQueues();
} catch (_) {}

/**
 * Super Admin Live System & Data Sync Diagnostic Controller
 */
exports.getSystemDiagnostic = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).send({
        isSuccess: false,
        message: "Database connection not initialized",
      });
    }

    const { profileId, targetDate, syncType } = req.query;

    const diagnostic = await executeLiveSyncAudit({
      db,
      redisClient,
      queues,
      options: {
        profileId: profileId ? Number(profileId) : null,
        targetDate: targetDate || undefined,
        syncType: syncType || undefined,
      },
    });

    return res.status(200).send({
      isSuccess: true,
      data: diagnostic,
      message: "System diagnostic retrieved successfully.",
    });
  } catch (error) {
    write_logs({
      message: `[getSystemDiagnostic Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).send({
      isSuccess: false,
      message: "Internal server error retrieving system diagnostic",
      error: error.message,
    });
  }
};

/**
 * Super Admin Manual Drain of Staged Redis Batches to MongoDB
 */
exports.drainStagedBatches = async (req, res) => {
  try {
    const result = await processStagedReportBatches();

    // Clean up orphaned / obsolete manifests from Redis buffer
    let purgedManifestsCount = 0;
    try {
      if (redisClient && typeof redisClient.keys === "function") {
        const manifestKeys = await redisClient.keys("import_manifest:*");
        const db = mongoose.connection.db;
        const reportsCol = db ? db.collection("reports") : null;

        for (const mKey of manifestKeys) {
          if (mKey.endsWith(":keys") || mKey.endsWith(":retries")) continue;
          let raw = null;
          try {
            if (typeof redisClient.hGetAll === "function") {
              raw = await redisClient.hGetAll(mKey);
            } else if (typeof redisClient.hgetall === "function") {
              raw = await redisClient.hgetall(mKey);
            }
          } catch (_) {}
          if (!raw && typeof redisClient.get === "function") {
            try {
              const str = await redisClient.get(mKey);
              if (str) raw = typeof str === "string" ? JSON.parse(str) : str;
            } catch (_) {}
          }
          if (!raw || Object.keys(raw).length === 0) continue;

          const runId = raw.importRunId || mKey.replace("import_manifest:", "");
          const status = raw.status || "UNKNOWN";
          const uuidMatch = runId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          const targetReportId = raw.reportId || (uuidMatch ? uuidMatch[0] : null);

          let canPurge = false;
          if (status === "COMPLETED" || status === "VALIDATION_FAILED") {
            canPurge = true;
          } else if (targetReportId && reportsCol) {
            const compDoc = await reportsCol.findOne({
              reportId: targetReportId,
              status: { $in: ["COMPLETED", "SUCCESS"] },
            });
            if (compDoc) canPurge = true;
          }

          if (canPurge) {
            await redisClient.del(mKey).catch(() => {});
            await redisClient.del(`${mKey}:keys`).catch(() => {});
            purgedManifestsCount++;
          }
        }
      }
    } catch (cleanupErr) {
      write_logs({
        message: `[drainStagedBatches Orphan Cleanup] ${cleanupErr.message}`,
        log_type: "warn",
      });
    }

    return res.status(200).send({
      isSuccess: true,
      data: {
        ...(result || {}),
        purgedManifestsCount,
      },
      message: `Successfully processed ${result?.totalBatchesProcessed || 0} batch(es) and purged ${purgedManifestsCount} stale Redis manifest(s).`,
    });
  } catch (error) {
    write_logs({
      message: `[drainStagedBatches Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).send({
      isSuccess: false,
      message: "Failed to drain staged report batches",
      error: error.message,
    });
  }
};

/**
 * 15-Day Day-Wise Data Reconciliation (Campaigns, AdGroups, Targeting) & Paginated Reports
 */
exports.get15DayReconciliation = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).send({
        isSuccess: false,
        message: "Database connection not initialized",
      });
    }

    const { profileId, page = 1, limit = 10 } = req.query;
    if (!profileId) {
      return res.status(400).send({
        isSuccess: false,
        message: "profileId is required",
      });
    }

    const pId = Number(profileId);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    // Compute last 15 days in UTC
    const days = [];
    for (let i = 0; i < 15; i++) {
      days.push(moment.utc().subtract(i, "days").format("YYYY-MM-DD"));
    }
    const oldestDate = days[days.length - 1];

    const profCol = db.collection("profiles");
    const profileDoc = await profCol.findOne({ profileId: pId }).catch(() => null);
    const countryCode = profileDoc?.countryCode || "IN";
    const currencyCode = profileDoc?.currencyCode || (countryCode === "IN" ? "INR" : "USD");

    const reportsCol = db.collection("reports");
    const campCol = db.collection("campaigns");
    const sbCampCol = db.collection("sbcampaigns");
    const sdCampCol = db.collection("sdcampaigns");

    const agCol = db.collection("ad_groups");
    const sbAgCol = db.collection("sbadgroups");
    const sdAgCol = db.collection("sdadgroups");

    const tgtCol = db.collection("targetings");
    const sbTgtCol = db.collection("sbtargetings");
    const sdTgtCol = db.collection("sdtargetings");

    const [
      reportsAgg,
      rawReports,
      totalReportsCount,
      failedReportsList,
      spCampAgg,
      sbCampAgg,
      sdCampAgg,
      spAgAgg,
      sbAgAgg,
      sdAgAgg,
      spTgtAgg,
      sbTgtAgg,
      sdTgtAgg,
    ] = await Promise.all([
      // Reports aggregated by startDate
      reportsCol
        .aggregate([
          { $match: { profileId: pId, startDate: { $gte: oldestDate } } },
          {
            $group: {
              _id: "$startDate",
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $in: [{ $toUpper: "$status" }, ["COMPLETED", "SUCCESS"]] }, 1, 0] },
              },
              failed: {
                $sum: { $cond: [{ $in: [{ $toUpper: "$status" }, ["FAILED", "ERROR"]] }, 1, 0] },
              },
              pending: {
                $sum: {
                  $cond: [
                    { $in: [{ $toUpper: "$status" }, ["PENDING", "PENDING_1", "PROCESSING", "STAGED"]] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),

      // Paginated reports list
      reportsCol
        .find({ profileId: pId })
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .project({
          reportId: 1,
          reportName: 1,
          adProduct: 1,
          reportTypeId: 1,
          startDate: 1,
          endDate: 1,
          status: 1,
          verifiedRows: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .toArray(),

      // Total reports count for profile
      reportsCol.countDocuments({ profileId: pId }),

      // Failed reports in the 15-day window for granular diagnosis
      reportsCol
        .find({
          profileId: pId,
          startDate: { $gte: oldestDate },
          status: { $in: ["FAILED", "ERROR"] },
        })
        .project({
          reportId: 1,
          reportName: 1,
          adProduct: 1,
          reportTypeId: 1,
          startDate: 1,
          status: 1,
          updatedAt: 1,
        })
        .toArray(),

      // SP Campaigns
      campCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 }, spend: { $sum: "$spend" } } },
        ])
        .toArray(),

      // SB Campaigns
      sbCampCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 }, spend: { $sum: "$cost" } } },
        ])
        .toArray(),

      // SD Campaigns
      sdCampCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 }, spend: { $sum: "$cost" } } },
        ])
        .toArray(),

      // SP Ad Groups
      agCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 } } },
        ])
        .toArray(),

      // SB Ad Groups
      sbAgCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 } } },
        ])
        .toArray(),

      // SD Ad Groups
      sdAgCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 } } },
        ])
        .toArray(),

      // SP Targeting
      tgtCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 }, spend: { $sum: "$spend" } } },
        ])
        .toArray(),

      // SB Targeting
      sbTgtCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 }, spend: { $sum: "$cost" } } },
        ])
        .toArray(),

      // SD Targeting
      sdTgtCol
        .aggregate([
          { $match: { profileId: pId, reportDate: { $gte: oldestDate } } },
          { $group: { _id: "$reportDate", count: { $sum: 1 }, spend: { $sum: "$cost" } } },
        ])
        .toArray(),
    ]);

    const repMap = new Map(reportsAgg.map((r) => [r._id, r]));
    const spCampMap = new Map(spCampAgg.map((c) => [c._id, c]));
    const sbCampMap = new Map(sbCampAgg.map((c) => [c._id, c]));
    const sdCampMap = new Map(sdCampAgg.map((c) => [c._id, c]));

    const spAgMap = new Map(spAgAgg.map((a) => [a._id, a]));
    const sbAgMap = new Map(sbAgAgg.map((a) => [a._id, a]));
    const sdAgMap = new Map(sdAgAgg.map((a) => [a._id, a]));

    const spTgtMap = new Map(spTgtAgg.map((t) => [t._id, t]));
    const sbTgtMap = new Map(sbTgtAgg.map((t) => [t._id, t]));
    const sdTgtMap = new Map(sdTgtAgg.map((t) => [t._id, t]));

    // Group failed reports by startDate
    const failedByDate = new Map();
    for (const f of failedReportsList || []) {
      const d = f.startDate;
      if (!failedByDate.has(d)) {
        failedByDate.set(d, []);
      }
      failedByDate.get(d).push({
        reportId: f.reportId,
        reportName: f.reportName || f.reportType || "Report",
        adProduct: f.adProduct || "SPONSORED_PRODUCTS",
        reportTypeId: f.reportTypeId || "",
        status: f.status,
        updatedAt: f.updatedAt ? new Date(f.updatedAt).toISOString() : null,
      });
    }

    const dayWiseReconciliation = [];
    let matchedDays = 0;
    let mismatchedDays = 0;
    let pendingDays = 0;
    let noDataDays = 0;

    for (const date of days) {
      const r = repMap.get(date) || { total: 0, completed: 0, failed: 0, pending: 0 };
      const spC = spCampMap.get(date) || { count: 0, spend: 0 };
      const sbC = sbCampMap.get(date) || { count: 0, spend: 0 };
      const sdC = sdCampMap.get(date) || { count: 0, spend: 0 };
      const totalCampDocs = spC.count + sbC.count + sdC.count;
      const totalCampSpend = Math.round((spC.spend + sbC.spend + sdC.spend) * 100) / 100;

      const spA = spAgMap.get(date) || { count: 0 };
      const sbA = sbAgMap.get(date) || { count: 0 };
      const sdA = sdAgMap.get(date) || { count: 0 };
      const totalAgDocs = spA.count + sbA.count + sdA.count;

      const spT = spTgtMap.get(date) || { count: 0, spend: 0 };
      const sbT = sbTgtMap.get(date) || { count: 0, spend: 0 };
      const sdT = sdTgtMap.get(date) || { count: 0, spend: 0 };
      const totalTgtDocs = spT.count + sbT.count + sdT.count;
      const totalTgtSpend = Math.round((spT.spend + sbT.spend + sdT.spend) * 100) / 100;

      const failedReportsForDay = failedByDate.get(date) || [];
      const spendDelta = Math.round(Math.abs(totalCampSpend - totalTgtSpend) * 100) / 100;
      const spendMatches = spendDelta <= 15; // Within attribution/rounding margin

      const issues = [];
      let status = "MATCH";

      if (r.total === 0 && totalCampDocs === 0 && totalAgDocs === 0 && totalTgtDocs === 0) {
        status = "NO_DATA";
        noDataDays++;
      } else {
        if (r.failed > 0) {
          issues.push(`${r.failed} Amazon SP-API report(s) failed during generation`);
          status = "MISMATCH";
        }
        if (r.completed > 0 && totalCampDocs === 0) {
          issues.push("Campaigns report completed on Amazon but 0 records in database");
          status = "MISMATCH";
        }
        if (r.completed > 0 && totalAgDocs === 0) {
          issues.push("AdGroups report completed on Amazon but 0 records in database");
          status = "MISMATCH";
        }
        if (r.completed > 0 && totalTgtDocs === 0) {
          issues.push("Targeting report completed on Amazon but 0 records in database");
          status = "MISMATCH";
        }
        if (totalCampDocs > 0 && totalTgtDocs === 0) {
          issues.push(`Campaigns exist (${totalCampDocs}) but Targeting has 0 docs in database`);
          status = "MISMATCH";
        }
        if (totalCampDocs > 0 && totalTgtDocs > 0 && totalCampSpend > 0 && totalTgtSpend === 0) {
          issues.push(`Campaign spend is $${totalCampSpend} but Targeting spend is $0`);
          status = "MISMATCH";
        }

        if (status === "MISMATCH") {
          mismatchedDays++;
        } else if (r.pending > 0) {
          status = "PENDING";
          pendingDays++;
        } else {
          matchedDays++;
        }
      }

      dayWiseReconciliation.push({
        date,
        status,
        campaigns: {
          totalDocs: totalCampDocs,
          spDocs: spC.count,
          sbDocs: sbC.count,
          sdDocs: sdC.count,
          totalSpend: totalCampSpend,
        },
        adGroups: {
          totalDocs: totalAgDocs,
          spDocs: spA.count,
          sbDocs: sbA.count,
          sdDocs: sdA.count,
        },
        targeting: {
          totalDocs: totalTgtDocs,
          spDocs: spT.count,
          sbDocs: sbT.count,
          sdDocs: sdT.count,
          totalSpend: totalTgtSpend,
        },
        reports: {
          total: r.total,
          completed: r.completed,
          failed: r.failed,
          pending: r.pending,
        },
        failedReports: failedReportsForDay,
        spendDelta,
        spendMatches,
        issues,
      });
    }

    return res.status(200).send({
      isSuccess: true,
      data: {
        profileId: pId,
        countryCode,
        currencyCode,
        summary: {
          matchedDays,
          mismatchedDays,
          pendingDays,
          noDataDays,
          overallStatus: mismatchedDays > 0 ? "MISMATCH" : pendingDays > 0 ? "PENDING" : "HEALTHY",
        },
        dayWiseReconciliation,
        reportsHistory: {
          docs: rawReports.map((r) => ({
            reportId: r.reportId || String(r._id),
            reportName: r.reportName || r.reportType || "CAMPAIGNS",
            adProduct: r.adProduct || "SPONSORED_PRODUCTS",
            reportTypeId: r.reportTypeId || "",
            startDate: r.startDate || "-",
            endDate: r.endDate || "-",
            status: (r.status || "UNKNOWN").toUpperCase(),
            verifiedRows: r.verifiedRows || 0,
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
            updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
          })),
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalCount: totalReportsCount,
            totalPages: Math.ceil(totalReportsCount / limitNum),
          },
        },
      },
      message: "15-day reconciliation retrieved successfully.",
    });
  } catch (error) {
    write_logs({
      message: `[get15DayReconciliation Error] ${error?.message || error}`,
      log_type: "error",
    });
    return res.status(500).send({
      isSuccess: false,
      message: "Internal server error retrieving 15-day reconciliation",
      error: error.message,
    });
  }
};
