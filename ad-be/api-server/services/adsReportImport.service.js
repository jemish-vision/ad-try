const { randomUUID } = require("node:crypto");
const { withDownloadedReportFile } = require("../helper/reportFile.helper");
const reports = require("../models/report.model");
const { stageReportFileInRedis } = require("./reportFileStager.service");
const { acquireImportLock, renewImportLock, checkImportLock, releaseImportLock } = require("./reportStaging.service");
const { write_logs } = require("../../winston/utility/logger");

const ATTACHED_STATUSES = ["COMPLETED", "SUCCESS", "STAGED", "IMPORTING", "VERIFYING", "WRITE_FAILED"];
const LEASE_SECONDS = 120;

async function stageDownloadedAdsReport({ report, url, entity, runPrefix, meta, downloadFile, retryOnFailure }) {
  const lockScope = `stage:${meta.configId}:${meta.profileId}:${report.reportId}`;
  const token = await acquireImportLock(lockScope, LEASE_SECONDS);
  if (!token) return "PENDING";

  const lease = setInterval(() => {
    void renewImportLock(lockScope, token, LEASE_SECONDS);
  }, 40000);
  lease.unref();

  const importRunId = `${runPrefix}_${report.reportId}_${Date.now()}-${randomUUID()}`;
  let current;
  try {
    current = await reports.findById(report._id).select("status importRunId").lean();
    if (!current) throw new Error("Report no longer exists");
    if (ATTACHED_STATUSES.includes(current.status)) return current.status === "SUCCESS" ? "COMPLETED" : current.status;

    await withDownloadedReportFile(url, downloadFile, filePath => stageReportFileInRedis({
      importRunId, entity, filePath, meta,
      beforeReady: async () => {
        if (!await checkImportLock(lockScope, token)) throw new Error("Report staging lease was lost");
        const update = await reports.updateOne(
          { _id: report._id, status: current.status, importRunId: current.importRunId ?? null },
          { $set: { status: "STAGED", importRunId }, $unset: { errorMessage: 1 } },
        );
        if (!update.matchedCount) throw new Error("Report state changed while staging");
      },
    }));
    return "STAGED";
  } catch (error) {
    // Logged here once for every report type: some callers (and the historical
    // import runner) only keep the status, which would hide why staging failed.
    write_logs({
      message: `[Ads Report Staging] ${entity} report ${report.reportId} (profile ${meta.profileId}) failed: ${error.message}`,
      log_type: "error",
    });
    if (current && await checkImportLock(lockScope, token)) {
      await reports.updateOne({
        _id: report._id,
        $or: [
          { status: current.status, importRunId: current.importRunId ?? null },
          { status: "STAGED", importRunId },
        ],
      }, {
        $set: { status: retryOnFailure ? "PENDING" : "FAILED", errorMessage: `Staging failed: ${error.message}` },
      });
    }
    throw error;
  } finally {
    clearInterval(lease);
    await releaseImportLock(lockScope, token);
  }
}

module.exports = { stageDownloadedAdsReport };
