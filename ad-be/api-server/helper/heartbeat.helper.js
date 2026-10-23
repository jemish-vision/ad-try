const serviceHeartbeat = require("../models/serviceHeartbeat.model");
const { sendEmailHelper } = require("./emailHelper");
const { buildCronErrorEmail } = require("../../emailTemplate/buildCronErrorEmail");
const { buildServiceAlertEmail } = require("../../emailTemplate/buildServiceAlertEmail");

// Keep in-memory cache of sent alerts to throttle (1 hour throttle)
const cronAlertThrottle = new Map();

const pingHeartbeat = async (serviceName) => {
  try {
    await serviceHeartbeat.findOneAndUpdate(
      { serviceName },
      { $set: { lastPing: new Date(), status: "RUNNING", alertSent: false } },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error(`Failed to ping heartbeat for ${serviceName}:`, error);
  }
};

const monitorWorkerService = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const heartbeat = await serviceHeartbeat.findOne({ serviceName: "worker-service" });

    if (heartbeat) {
      if (heartbeat.lastPing < fiveMinutesAgo && !heartbeat.alertSent) {
        // Update status and alertSent flag first to avoid duplicate email alerts in subsequent checks
        await serviceHeartbeat.updateOne(
          { serviceName: "worker-service" },
          { $set: { status: "DOWN", alertSent: true } }
        );

        // Build HTML template
        const html = buildServiceAlertEmail({
          serviceName: "worker-service",
          status: "DOWN",
          lastPing: heartbeat.lastPing,
          environment: process.env.NODE_ENV
        });

        // Send email alert
        await sendEmailHelper(
          process.env.RECEIVER_EMAIL || "support@aihello.com",
          "Worker Service Stoppage Alert",
          html
        );
      }
    }
  } catch (error) {
    console.error("Error monitoring worker service health:", error);
  }
};

const sendThrottledCronAlert = async (taskName, error) => {
  try {
    const now = Date.now();
    const lastAlertTime = cronAlertThrottle.get(taskName);

    // Throttle: 1 hour = 60 * 60 * 1000 ms
    if (lastAlertTime && (now - lastAlertTime) < 60 * 60 * 1000) {
      return; // Throttled
    }

    cronAlertThrottle.set(taskName, now);

    // Send email alert using buildCronErrorEmail template
    const html = buildCronErrorEmail({
      type: "JOB_FAILED",
      jobName: taskName,
      error: error?.stack || error?.message || error
    });

    await sendEmailHelper(
      process.env.RECEIVER_EMAIL || "support@aihello.com",
      `Cron Failure Alert: ${taskName}`,
      html
    );
  } catch (err) {
    console.error("Failed to send throttled cron alert:", err);
  }
};

const sendStuckTaskAlert = async (taskName, errorDetails) => {
  try {
    const html = buildCronErrorEmail({
      type: "UNCAUGHT_EXCEPTION",
      error: errorDetails
    });
    await sendEmailHelper(
      process.env.RECEIVER_EMAIL || "support@aihello.com",
      `CRITICAL: Worker Service Stuck Task Alert (${taskName})`,
      html
    );
  } catch (err) {
    console.error("Failed to send stuck task alert:", err);
  }
};

const checkWorkerHealth = async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const heartbeat = await serviceHeartbeat.findOne({ serviceName: "worker-service" });

    if (!heartbeat) {
      return res.status(500).json({ status: "DOWN", error: "No heartbeat record found" });
    }

    if (heartbeat.lastPing < fiveMinutesAgo) {
      return res.status(500).json({
        status: "DOWN",
        error: "Worker heartbeat is stale",
        lastPing: heartbeat.lastPing
      });
    }

    return res.status(200).json({
      status: "UP",
      lastPing: heartbeat.lastPing
    });
  } catch (error) {
    return res.status(500).json({ status: "ERROR", error: error.message });
  }
};

module.exports = {
  pingHeartbeat,
  monitorWorkerService,
  sendThrottledCronAlert,
  sendStuckTaskAlert,
  checkWorkerHealth
};
