const mongoose = require("mongoose");
require("dotenv").config();

require("../shared/connection");

const { processQueue } = require("../api-server/controllers/campaign.controller");
const { pingHeartbeat } = require("../api-server/helper/heartbeat.helper");
const { write_logs: ams_write_logs } = require("../winston/ams/logger");

const waitForDbConnection = () => {
    return new Promise((resolve) => {
        if (mongoose.connection.readyState === 1) return resolve();
        mongoose.connection.once("connected", resolve);
    });
};

(async () => {
    await waitForDbConnection();

    ams_write_logs({
        message: "[worker-ams-queue] AMS Queue Worker Service started",
        log_type: "info",
    });

    // Setup heartbeat ping loop
    try {
        await pingHeartbeat("worker-ams-queue");
        setInterval(async () => {
            await pingHeartbeat("worker-ams-queue");
        }, 60 * 1000);
    } catch (hbErr) {
        ams_write_logs({
            message: `[worker-ams-queue] Heartbeat error: ${hbErr.message}`,
            log_type: "error",
        });
    }

    // Run the AMS message processing queue loop
    try {
        await processQueue();
    } catch (err) {
        ams_write_logs({
            message: `[worker-ams-queue] Fatal error in processQueue: ${err.stack || err.message || err}`,
            log_type: "error",
        });
    }
})();

process.on("unhandledRejection", (reason) => {
    ams_write_logs({
        message: `[worker-ams-queue] Unhandled Rejection: ${reason?.stack || reason}`,
        log_type: "error",
    });
});

process.on("uncaughtException", (err) => {
    ams_write_logs({
        message: `[worker-ams-queue] Uncaught Exception: ${err.stack || err.message || err}`,
        log_type: "error",
    });
    process.exit(1);
});
