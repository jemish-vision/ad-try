const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Recursively deletes files older than specified cutoff time in target directory
 * @param {string} dirPath - Absolute directory path
 * @param {number} cutoffTime - Timestamp cutoff in ms
 * @returns {{ filesDeleted: number, bytesFreed: number }}
 */
function cleanDirectoryRecursive(dirPath, cutoffTime) {
    let filesDeleted = 0;
    let bytesFreed = 0;

    if (!fs.existsSync(dirPath)) return { filesDeleted, bytesFreed };

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const subRes = cleanDirectoryRecursive(fullPath, cutoffTime);
                filesDeleted += subRes.filesDeleted;
                bytesFreed += subRes.bytesFreed;

                // Remove empty subdirectories (except top-level category folders)
                const remaining = fs.readdirSync(fullPath);
                if (remaining.length === 0 && fullPath !== path.resolve(__dirname, "../../uploads")) {
                    fs.rmdirSync(fullPath);
                }
            } else if (stat.isFile()) {
                if (stat.mtimeMs < cutoffTime) {
                    bytesFreed += stat.size;
                    fs.unlinkSync(fullPath);
                    filesDeleted++;
                }
            }
        } catch (err) {
            cron_logs({
                message: `[Report File Cleanup] Error processing file ${fullPath}: ${err.message}`,
                log_type: "warn",
            });
        }
    }

    return { filesDeleted, bytesFreed };
}

/**
 * Cron function to delete report files older than 15 days from uploads/ directory
 * @param {number} days - Cutoff days (default: 15)
 */
const cronDeleteOldReportFiles = async (days = 15) => {
    cron_logs({
        message: `[Report File Cleanup] Starting cleanup of report files older than ${days} days...`,
        log_type: "info",
    });

    try {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        const uploadsBaseDir = path.resolve(__dirname, "../../uploads");

        const { filesDeleted, bytesFreed } = cleanDirectoryRecursive(uploadsBaseDir, cutoffTime);

        const mbFreed = (bytesFreed / (1024 * 1024)).toFixed(2);

        cron_logs({
            message: `[Report File Cleanup] Successfully deleted ${filesDeleted} report file(s) older than ${days} days. Freed ${mbFreed} MB of disk space.`,
            log_type: "info",
        });

        return { filesDeleted, bytesFreed, mbFreed };
    } catch (err) {
        cron_logs({
            message: `[Report File Cleanup] Cleanup failed: ${err.message}`,
            log_type: "error",
        });
        return { filesDeleted: 0, bytesFreed: 0, mbFreed: "0.00" };
    }
};

module.exports = {
    cronDeleteOldReportFiles,
};
