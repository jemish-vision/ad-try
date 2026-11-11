const mongoose = require("mongoose");
const moment = require("moment-timezone");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const { executeLiveSyncAudit } = require("../services/liveSyncAudit.service");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Controller: cronDailySystemHealthAudit
 *
 * Runs automatically every morning (or on scheduled interval) to audit:
 * 1. Reports & 20-min STAGED cascades (data insertion integrity)
 * 2. Database index health & 40 API pipeline latencies
 * 3. 6-to-12 +2% hourly rule execution & basic bid protection
 * 4. BullMQ queues & worker split
 *
 * Automatically persists the full diagnostic result into `cronjobhistories`
 * so you can inspect historical daily system health at any time.
 */
exports.cronDailySystemHealthAudit = async () => {
  const startedAt = Date.now();
  const todayStr = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

  cron_logs({
    message: `[DailySystemHealthAudit] Starting automated daily pre/post-live audit for ${todayStr}...`,
    log_type: "info",
  });

  let historyDoc = null;
  try {
    historyDoc = new cronJobHistorySchema({
      cronName: "Daily System Health Audit",
      historyDate: todayStr,
      status: "PENDING",
      details: {
        startedAt: new Date().toISOString(),
      },
    });
    await historyDoc.save();
  } catch (histErr) {
    cron_logs({
      message: `[DailySystemHealthAudit] Warning: Failed to create pending history record: ${histErr.message}`,
      log_type: "warn",
    });
  }

  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection is not active");
    }

    // Connect redis / queues optionally if available
    let redisClient = null;
    let queues = {};
    try {
      const { createRedisClient } = require("../../queue-service/config/bullmq.config");
      const { getQueues } = require("../../queue-service/queues/queues");
      redisClient = createRedisClient("producer");
      redisClient.on("error", () => {});
      await redisClient.ping();
      queues = getQueues() || {};
    } catch (_) {}

    const report = await executeLiveSyncAudit({
      db,
      redisClient,
      queues,
      options: {
        stagedThresholdMinutes: 20,
        includeIndexAndLatencyProbes: true,
      },
    });

    const durationMs = Date.now() - startedAt;
    const isCritical = (report.criticalAlerts || []).length > 0;
    const finalStatus = isCritical ? "FAILED" : "COMPLETED";

    const summaryPayload = {
      overallStatus: isCritical ? "CRITICAL" : "HEALTHY",
      criticalAlertsCount: (report.criticalAlerts || []).length,
      warningsCount: (report.warnings || []).length,
      criticalAlerts: report.criticalAlerts || [],
      warnings: report.warnings || [],
      stagedReportAudit: {
        status: report.stagedReportAudit?.status,
        stuckOver20mCount: (report.stagedReportAudit?.stuckStagedOverThreshold || []).length,
        cascadingPileupsCount: (report.stagedReportAudit?.cascadingStagedChains || []).length,
      },
      apiLatencyAudit: {
        status: report.apiLatencyAudit?.status,
        maintenanceModeRisk: report.apiLatencyAudit?.maintenanceModeRisk,
        activeSlowDbOpsCount: (report.apiLatencyAudit?.activeSlowDbOps || []).length,
      },
      ruleExecutionAudit: {
        status: report.ruleExecutionAudit?.status,
        duplicateSameHourRunsCount: (report.ruleExecutionAudit?.duplicateSameHourRuns || []).length,
        baseBidCorruptionsCount: (report.ruleExecutionAudit?.baseBidCorruptions || []).length,
      },
      workerHealth: {
        status: report.workerHealth?.status,
        executionMode: report.workerHealth?.executionMode,
      },
    };

    if (historyDoc?._id) {
      await cronJobHistorySchema.findByIdAndUpdate(historyDoc._id, {
        status: finalStatus,
        durationMs,
        recordsCount: report.summary?.activeProfiles || 0,
        message: isCritical
          ? `Audit found ${report.criticalAlerts.length} critical issue(s)`
          : `All checks healthy across ${report.summary?.activeProfiles || 0} active profiles`,
        error: isCritical ? report.criticalAlerts.join(" | ") : null,
        $set: {
          "details.completedAt": new Date().toISOString(),
          "details.durationMs": durationMs,
          "details.summary": summaryPayload,
        },
      });
    }

    cron_logs({
      message: `[DailySystemHealthAudit] Finished in ${durationMs}ms with status: ${finalStatus} (${summaryPayload.criticalAlertsCount} critical, ${summaryPayload.warningsCount} warnings)`,
      log_type: isCritical ? "error" : "info",
    });

    return {
      success: !isCritical,
      status: finalStatus,
      durationMs,
      summary: summaryPayload,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (historyDoc?._id) {
      await cronJobHistorySchema.findByIdAndUpdate(historyDoc._id, {
        status: "FAILED",
        durationMs,
        error: err.message,
        $set: {
          "details.failedAt": new Date().toISOString(),
          "details.durationMs": durationMs,
        },
      });
    }
    cron_logs({
      message: `[DailySystemHealthAudit] FATAL ERROR: ${err.message}`,
      log_type: "error",
    });
    return {
      success: false,
      status: "FAILED",
      error: err.message,
    };
  }
};
