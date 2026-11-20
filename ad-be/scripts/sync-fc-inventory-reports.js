require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const moment = require("moment-timezone");

const {
  cronGenerateFcInventoryLedgerReport,
  cronGenerateFcStorageFeeReport,
} = require("../api-server/controllers/fcInventory.controller");
const CRON_JOBS = require("../worker-service/cronJobs.enum");
const { createRunJobSafely } = require("../worker-service/runJobSafely.helper");

// ============================================================================
// CONFIGURATION: Set your sync options and target profile/date ranges here
// ============================================================================
const CONFIG = {
  // 1. Actions to execute (true = run, false = skip)
  actions: {
    runFcInventoryLedger: false, // Executes cronGenerateFcInventoryLedgerReport
    runFcStorageFee: true,      // Executes cronGenerateFcStorageFeeReport
  },

  // 2. Target payload passed to controller functions.
  //    - If profileId is null/undefined, it runs for ALL active eligible seller catalog profiles.
  //    - If profileId is provided (Number), it runs for that single profile.
  //    - If dates/month are null, each cron uses its standard calculated date window.
  payload: {
    profileId: 2904042714377649, // e.g. 1406809169199414 (Number) or null for ALL active profiles
    configId: "6a2fd9dbdec3c6e2d5b466a6",  // e.g. "6a2fd9dbdec3c6e2d5b466a6" (String) or null
    startDate: "2026-11-14", // e.g. "2026-10-01" (YYYY-MM-DD) or null
    endDate: "2026-11-18",   // e.g. "2026-10-20" (YYYY-MM-DD) or null
    month: "2026-09",     // e.g. "2026-09" (YYYY-MM) for Storage Fee, or null
    recurring: true, // Set false for on-demand manual runs, true for recurring cron tracking
  },

  // 3. Execution options
  options: {
    useRunJobSafely: true, // Wraps execution with cronJobHistory start/success/failure telemetry
    continueOnError: true, // Continue with next job even if the first throws an error
  },
};

// ============================================================================
// CLI Arguments Parsing (e.g. node scripts/sync-fc-inventory-reports.js --ledger --profile=12345)
// ============================================================================
function parseCliArgs() {
  const args = process.argv.slice(2);
  let ledgerFlag = false;
  let storageFlag = false;

  for (const arg of args) {
    if (arg === "--ledger" || arg === "-l") ledgerFlag = true;
    else if (arg === "--storage" || arg === "-s") storageFlag = true;
    else if (arg === "--all" || arg === "-a") {
      ledgerFlag = true;
      storageFlag = true;
    } else if (arg.startsWith("--profile=")) {
      CONFIG.payload.profileId = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--config=")) {
      CONFIG.payload.configId = arg.split("=")[1];
    } else if (arg.startsWith("--start=")) {
      CONFIG.payload.startDate = arg.split("=")[1];
    } else if (arg.startsWith("--end=")) {
      CONFIG.payload.endDate = arg.split("=")[1];
    } else if (arg.startsWith("--month=")) {
      CONFIG.payload.month = arg.split("=")[1];
    } else if (arg === "--recurring") {
      CONFIG.payload.recurring = true;
    }
  }

  if (ledgerFlag || storageFlag) {
    CONFIG.actions.runFcInventoryLedger = ledgerFlag;
    CONFIG.actions.runFcStorageFee = storageFlag;
  }
}

async function runFcReports() {
  parseCliArgs();

  console.log("=================================================================");
  console.log("       FC Inventory & Storage Fee Reports Sync Runner            ");
  console.log("=================================================================");
  console.log(`Timestamp (IST): ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`);
  console.log("Selected Actions:");
  console.log(`  - FC Inventory Ledger Report : ${CONFIG.actions.runFcInventoryLedger ? "ENABLED" : "SKIPPED"}`);
  console.log(`  - FC Storage Fee Report      : ${CONFIG.actions.runFcStorageFee ? "ENABLED" : "SKIPPED"}`);
  console.log("Payload Parameters:");
  console.log(`  - Target Profile ID          : ${CONFIG.payload.profileId || "ALL Active Seller Profiles"}`);
  console.log(`  - Target Config ID           : ${CONFIG.payload.configId || "N/A"}`);
  console.log(`  - Start Date                 : ${CONFIG.payload.startDate || "Default (3 days ago)"}`);
  console.log(`  - End Date                   : ${CONFIG.payload.endDate || "Default (Yesterday)"}`);
  console.log(`  - Target Month (Storage Fee) : ${CONFIG.payload.month || "Default (Calculated Cutoff Month)"}`);
  console.log(`  - Recurring Mode             : ${CONFIG.payload.recurring}`);
  console.log("=================================================================\n");

  const startTime = Date.now();
  const runJobSafely = createRunJobSafely("script-fc-inventory");

  // Build payload object (clean null/undefined values)
  const pastSyncObj = {};
  if (CONFIG.payload.profileId) pastSyncObj.profileId = CONFIG.payload.profileId;
  if (CONFIG.payload.configId) pastSyncObj.configId = CONFIG.payload.configId;
  if (CONFIG.payload.startDate) pastSyncObj.startDate = CONFIG.payload.startDate;
  if (CONFIG.payload.endDate) pastSyncObj.endDate = CONFIG.payload.endDate;
  if (CONFIG.payload.month) pastSyncObj.month = CONFIG.payload.month;
  pastSyncObj.recurring = CONFIG.payload.recurring;

  const hasCustomParams = Object.keys(pastSyncObj).length > 1; // more than just recurring
  const paramToPass = hasCustomParams ? pastSyncObj : null;

  try {
    console.log("[1/3] Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false,
    });
    console.log("MongoDB connected successfully.\n");

    // 1. FC Inventory Ledger Report
    if (CONFIG.actions.runFcInventoryLedger) {
      console.log(`--> [FC Inventory Ledger] Starting execution...`);
      const stepStart = Date.now();
      try {
        if (CONFIG.options.useRunJobSafely) {
          await runJobSafely(CRON_JOBS.FC_INVENTORY_LEDGER, () =>
            cronGenerateFcInventoryLedgerReport(paramToPass)
          );
        } else {
          await cronGenerateFcInventoryLedgerReport(paramToPass);
        }
        console.log(`--> [FC Inventory Ledger] Completed in ${Date.now() - stepStart}ms\n`);
      } catch (err) {
        console.error(`--> [FC Inventory Ledger] Error: ${err.message || err}\n`);
        if (!CONFIG.options.continueOnError) throw err;
      }
    }

    // 2. FC Storage Fee Report
    if (CONFIG.actions.runFcStorageFee) {
      console.log(`--> [FC Storage Fee] Starting execution...`);
      const stepStart = Date.now();
      try {
        if (CONFIG.options.useRunJobSafely) {
          await runJobSafely(CRON_JOBS.FC_STORAGE_FEE, () =>
            cronGenerateFcStorageFeeReport(paramToPass)
          );
        } else {
          await cronGenerateFcStorageFeeReport(paramToPass);
        }
        console.log(`--> [FC Storage Fee] Completed in ${Date.now() - stepStart}ms\n`);
      } catch (err) {
        console.error(`--> [FC Storage Fee] Error: ${err.message || err}\n`);
        if (!CONFIG.options.continueOnError) throw err;
      }
    }

    console.log("=================================================================");
    console.log(`FC Reports Sync completed successfully in ${Date.now() - startTime}ms`);
    console.log("=================================================================");
  } catch (fatalError) {
    console.error("\n[FATAL] Script execution aborted with error:", fatalError);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
      console.log("MongoDB connection closed.");
    } catch (_) { }
    process.exit(process.exitCode || 0);
  }
}

// Execute runner if invoked directly
if (require.main === module) {
  runFcReports();
}

module.exports = {
  runFcReports,
  CONFIG,
};
