const dns = require("dns");
// In Node.js 18+, dns.lookup defaults to 'verbatim', which resolves IPv6 (::1) before IPv4.
// Since local MongoDB binds to 127.0.0.1, set ipv4first to avoid 30s connection timeout on reload.
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const mongoose = require("mongoose");
require("dotenv").config();
const { write_logs } = require("../winston/connection/logger");
const { sendEmailHelper } = require("../api-server/helper/emailHelper");
const { buildDbAlertEmail } = require("../emailTemplate/buildDbAlertEmail");

mongoose.set("strictQuery", false);

const options = {
  autoIndex: false,
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 60000,
  waitQueueTimeoutMS: 10000,

  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 120000,
  connectTimeoutMS: 30000,

  heartbeatFrequencyMS: 10000,

  // Stability
  retryWrites: true,
  retryReads: true,

  // Optional but safe
  compressors: "zlib"
};

const sendDbAlert = async (status) => {
  try {
    const env = (process.env.NODE_ENV || "development").toUpperCase();
    const subjectPrefix = `[${env}]`;
    const subject = status === "DISCONNECTED"
      ? `${subjectPrefix} 🔴 Alert: MongoDB Connection Lost`
      : `${subjectPrefix} 🟢 Resolved: MongoDB Reconnected`;

    await sendEmailHelper(
      process.env.RECEIVER_EMAIL,
      subject,
      buildDbAlertEmail({
        status,
        dbName: mongoose.connection.name,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (emailErr) {
    write_logs({ message: `DB alert email failed: ${emailErr.message}`, log_type: "error" });
  }
};

const rawUri = process.env.MONGO_URI || process.env.DB_URL;
// Normalize localhost to 127.0.0.1 defensively to prevent IPv6 lookups
const mongoUri = (rawUri || "").replace("mongodb://localhost:", "mongodb://127.0.0.1:");

let isShuttingDown = false;
let retryTimer = null;
let disconnectAlertTimer = null;
let hasSentDisconnectAlert = false;
const DISCONNECT_DEBOUNCE_MS = 10000;

const connectWithRetry = async () => {
  if (isShuttingDown) return;
  try {
    await mongoose.connect(mongoUri, options);
  } catch (err) {
    write_logs({
      message: `Initial MongoDB connection failed: ${err.message}. Retrying in 3 seconds...`,
      log_type: "error",
    });
    if (!isShuttingDown) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connectWithRetry, 3000);
    }
  }
};

connectWithRetry();

mongoose.connection.on("connected", async () => {
  write_logs({
    message: "Connection established successfully",
    log_type: "info",
  });
  if (disconnectAlertTimer) {
    clearTimeout(disconnectAlertTimer);
    disconnectAlertTimer = null;
  }
  if (hasSentDisconnectAlert) {
    hasSentDisconnectAlert = false;
    await sendDbAlert("RECONNECTED");
  }
});

// NOTE: Index synchronization (Model.createIndexes) is intentionally NOT run here.
// Running it on every connection open generates excessive log noise across all 3
// processes (api-server, worker-service, ams-worker) on every restart.
// Instead, run: `node scripts/db-maintenance.js` when deploying schema changes.

mongoose.connection.on("error", () => {
  write_logs({
    message: "Mongoose connection default error",
    log_type: "error",
  });
});

mongoose.connection.on("disconnected", () => {
  write_logs({
    message: "Mongoose default connection disconnected",
    log_type: "info",
  });
  // Grace period: only alert if connection does not auto-recover within 10 seconds
  if (!isShuttingDown && !disconnectAlertTimer && !hasSentDisconnectAlert) {
    disconnectAlertTimer = setTimeout(async () => {
      disconnectAlertTimer = null;
      if (!isShuttingDown && mongoose.connection.readyState !== 1) {
        hasSentDisconnectAlert = true;
        await sendDbAlert("DISCONNECTED");
      }
    }, DISCONNECT_DEBOUNCE_MS);
  }
});

mongoose.connection.on("reconnected", async () => {
  write_logs({ message: "MongoDB reconnected successfully!", log_type: "info" });
  if (disconnectAlertTimer) {
    clearTimeout(disconnectAlertTimer);
    disconnectAlertTimer = null;
  }
  if (hasSentDisconnectAlert) {
    hasSentDisconnectAlert = false;
    await sendDbAlert("RECONNECTED");
  }
});

const gracefulShutdown = async (signal = "SIGINT") => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearTimeout(retryTimer);
  if (disconnectAlertTimer) {
    clearTimeout(disconnectAlertTimer);
    disconnectAlertTimer = null;
  }
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
    }
    write_logs({
      message: `Connection closed cleanly on ${signal}`,
      log_type: "info",
    });
  } catch (err) {
    console.error(`Error closing mongoose connection on ${signal}:`, err);
  }
};

const closeMongoConnection = gracefulShutdown;

// Handlers for graceful shutdown unless entrypoint manages its own shutdown
if (process.env.CUSTOM_SHUTDOWN !== "true") {
  process.on("SIGINT", async () => {
    await gracefulShutdown("SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await gracefulShutdown("SIGTERM");
    process.exit(0);
  });

  // Nodemon sends SIGUSR2 on reload (rs or file changes)
  process.once("SIGUSR2", async () => {
    await gracefulShutdown("SIGUSR2 (nodemon restart)");
    process.kill(process.pid, "SIGUSR2");
  });
}

const ensureDbConnected = async () => {
  if (mongoose.connection.readyState === 1) return true;
  return new Promise((resolve) => {
    mongoose.connection.once("connected", () => resolve(true));
  });
};

module.exports = {
  mongoose,
  ensureDbConnected,
  closeMongoConnection,
  gracefulShutdown,
};
