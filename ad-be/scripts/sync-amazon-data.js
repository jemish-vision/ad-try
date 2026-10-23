require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

// Import controllers for each entity
const { cronListCampaignsFromAmazon, cronGenerateCampaignReport } = require("../api-server/controllers/campaign.controller");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("../api-server/controllers/adGroups.controller");
const { cronListProductAdsFromAmazon, cronGenerateAdProductReport } = require("../api-server/controllers/productAds.controller");
const { cronListTargetingFromAmazon, cronGenerateTargetingReport } = require("../api-server/controllers/targeting.controller");

// ============================================================================
// CONFIGURATION: Set your sync options here
// ============================================================================
const CONFIG = {
    // 1. Target payload object passed to list & report generation functions
    payload: {
        profileId: 1406809169199414, // Profile ID (Number)
        configId: "6a2fd9dbdec3c6e2d5b466a6", // Config ID (String)
        startDate: "2026-10-01", // YYYY-MM-DD
        endDate: "2026-10-20", // YYYY-MM-DD
        recurring: true // Boolean
    },

    // 2. Action flags:
    // - runList: Calls cronList... functions (Fetches entities from Amazon into Mongo DB)
    //   -> Set to `true` on your first run.
    //   -> Set to `false` on subsequent runs so you don't re-fetch list data repeatedly.
    // - runGenerateReport: Calls cronGenerate... functions (Requests report creation from Amazon API)
    //   -> Set to `true` to initiate Amazon performance reports.
    actions: {
        runList: false, // Set to true to execute cronList functions; false to skip
        runGenerateReport: true // Set to true to execute cronGenerateReport functions; false to skip
    },

    // 3. Entity selection: Select which entities to sync (true = sync, false = skip)
    entities: {
        campaigns: true,  // Sync Campaigns
        adGroups: true,   // Sync Ad Groups
        productAds: true, // Sync Product Ads
        targeting: true   // Sync Targeting
    },

    // 4. Execution options
    options: {
        // "phased": Executes all selected List calls first, then all Report generation calls.
        // "per-entity": Runs List -> Report for Campaigns, then List -> Report for Ad Groups, etc.
        executionMode: "phased", // "phased" | "per-entity"

        // If true, continues with remaining steps/entities even if one step throws an error
        continueOnError: true
    }
};

// ============================================================================
// ENTITY DEFINITIONS & HANDLERS
// ============================================================================
const ENTITIES = [
    {
        key: "campaigns",
        name: "Campaigns",
        listFn: cronListCampaignsFromAmazon,
        reportFn: (payload) => cronGenerateCampaignReport(false, false, payload),
        listLabel: "cronListCampaignsFromAmazon",
        reportLabel: "cronGenerateCampaignReport",
    },
    {
        key: "adGroups",
        name: "Ad Groups",
        listFn: cronListAdGroupsFromAmazon,
        reportFn: (payload) => cronGenerateAdGroupReport(false, false, payload),
        listLabel: "cronListAdGroupsFromAmazon",
        reportLabel: "cronGenerateAdGroupReport",
    },
    {
        key: "productAds",
        name: "Product Ads",
        listFn: cronListProductAdsFromAmazon,
        reportFn: (payload) => cronGenerateAdProductReport(false, false, payload),
        listLabel: "cronListProductAdsFromAmazon",
        reportLabel: "cronGenerateAdProductReport",
    },
    {
        key: "targeting",
        name: "Targeting",
        listFn: cronListTargetingFromAmazon,
        reportFn: (payload) => cronGenerateTargetingReport(false, false, payload),
        listLabel: "cronListTargetingFromAmazon",
        reportLabel: "cronGenerateTargetingReport",
    },
];

// Optional CLI arguments override (e.g. node sync-amazon-data.js --with-list or --no-list)
function applyCliOverrides(config) {
    const args = process.argv.slice(2);
    if (!args.length) return config;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--no-list" || arg === "--skip-list" || arg === "--reports-only") {
            config.actions.runList = false;
            config.actions.runGenerateReport = true;
        } else if (arg === "--with-list" || arg === "--run-list") {
            config.actions.runList = true;
        } else if (arg === "--list-only") {
            config.actions.runList = true;
            config.actions.runGenerateReport = false;
        } else if (arg.startsWith("--startDate=")) {
            config.payload.startDate = arg.split("=")[1];
        } else if (arg === "--startDate" && args[i + 1]) {
            config.payload.startDate = args[++i];
        } else if (arg.startsWith("--endDate=")) {
            config.payload.endDate = arg.split("=")[1];
        } else if (arg === "--endDate" && args[i + 1]) {
            config.payload.endDate = args[++i];
        } else if (arg.startsWith("--profileId=")) {
            config.payload.profileId = Number(arg.split("=")[1]);
        } else if (arg === "--profileId" && args[i + 1]) {
            config.payload.profileId = Number(args[++i]);
        } else if (arg.startsWith("--configId=")) {
            config.payload.configId = arg.split("=")[1];
        } else if (arg === "--configId" && args[i + 1]) {
            config.payload.configId = args[++i];
        } else if (arg.startsWith("--only=")) {
            const list = arg.split("=")[1].toLowerCase().split(",");
            config.entities.campaigns = list.includes("campaigns") || list.includes("campaign");
            config.entities.adGroups = list.includes("adgroups") || list.includes("adgroup");
            config.entities.productAds = list.includes("productads") || list.includes("productad");
            config.entities.targeting = list.includes("targeting") || list.includes("target");
        } else if (arg === "--mode=phased" || arg === "--phased") {
            config.options.executionMode = "phased";
        } else if (arg === "--mode=per-entity" || arg === "--per-entity") {
            config.options.executionMode = "per-entity";
        }
    }

    return config;
}

// ============================================================================
// MAIN EXECUTION FUNCTION
// ============================================================================
async function syncAmazonData() {
    let isConnected = false;
    try {
        const config = applyCliOverrides(CONFIG);
        const { payload, actions, entities, options } = config;

        console.log("\n==================================================");
        console.log("       AMAZON ADVERTISING UNIFIED DATA SYNC       ");
        console.log("==================================================");
        console.log(`Profile ID       : ${payload.profileId}`);
        console.log(`Config ID        : ${payload.configId}`);
        console.log(`Date Range       : ${payload.startDate} to ${payload.endDate}`);
        console.log(`Recurring        : ${payload.recurring}`);
        console.log(`Action - List    : ${actions.runList ? "ENABLED (Will call cronList functions)" : "SKIPPED (cronList off)"}`);
        console.log(`Action - Report  : ${actions.runGenerateReport ? "ENABLED (Will call cronGenerate functions)" : "SKIPPED (cronGenerate off)"}`);
        console.log(`Execution Mode   : ${options.executionMode}`);
        console.log("--------------------------------------------------");
        console.log("Entity Sync Status:");

        const activeEntities = ENTITIES.filter((e) => entities[e.key]);
        ENTITIES.forEach((e) => {
            const isSelected = !!entities[e.key];
            console.log(`  [${isSelected ? "X" : " "}] ${e.name.padEnd(14)} (${e.key})`);
        });
        console.log("==================================================\n");

        if (activeEntities.length === 0) {
            console.log("Warning: No entities selected to sync. Exiting.\n");
            return;
        }

        if (!actions.runList && !actions.runGenerateReport) {
            console.log("Both 'actions.runList' and 'actions.runGenerateReport' are set to false. Nothing to do. Exiting.\n");
            return;
        }

        const summary = [];
        const startTime = Date.now();

        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI, {
            autoIndex: false,
        });
        isConnected = true;
        console.log("Database connected successfully.\n");

        // Helper function to safely execute and measure each step
        async function executeStep(entityName, stepType, fn, label) {
            console.log(`--> [${entityName}] Executing: ${label}`);
            const stepStart = Date.now();
            try {
                await fn(payload);
                const duration = ((Date.now() - stepStart) / 1000).toFixed(1);
                console.log(`--> [${entityName}] Completed: ${label} in ${duration}s\n`);
                return { status: "SUCCESS", duration: `${duration}s`, error: "-" };
            } catch (error) {
                const duration = ((Date.now() - stepStart) / 1000).toFixed(1);
                const errorMsg = error?.message || String(error);
                console.error(`[!] [${entityName}] Error executing ${label} (${duration}s):`, errorMsg, "\n");
                if (!options.continueOnError) {
                    throw error;
                }
                return { status: "FAILED", duration: `${duration}s`, error: errorMsg };
            }
        }

        if (options.executionMode === "phased") {
            // PHASE 1: Fetch Lists
            if (actions.runList) {
                console.log("==================================================");
                console.log("PHASE 1: Fetching Entity Lists from Amazon");
                console.log("==================================================");
                for (const entity of activeEntities) {
                    const result = await executeStep(entity.name, "List", entity.listFn, entity.listLabel);
                    summary.push({ Entity: entity.name, Action: "List (cronList)", ...result });
                }
            } else {
                console.log("--> Skipping Phase 1 (runList is false)\n");
            }

            // PHASE 2: Generate Reports
            if (actions.runGenerateReport) {
                console.log("==================================================");
                console.log("PHASE 2: Requesting Report Generation from Amazon");
                console.log("==================================================");
                for (const entity of activeEntities) {
                    const result = await executeStep(entity.name, "Report", entity.reportFn, entity.reportLabel);
                    summary.push({ Entity: entity.name, Action: "Generate Report", ...result });
                }
            } else {
                console.log("--> Skipping Phase 2 (runGenerateReport is false)\n");
            }
        } else {
            // Per-Entity execution
            for (const entity of activeEntities) {
                console.log("==================================================");
                console.log(`Processing: ${entity.name}`);
                console.log("==================================================");

                if (actions.runList) {
                    const listResult = await executeStep(entity.name, "List", entity.listFn, entity.listLabel);
                    summary.push({ Entity: entity.name, Action: "List (cronList)", ...listResult });
                } else {
                    console.log(`--> [${entity.name}] Skipping List (runList is false)`);
                }

                if (actions.runGenerateReport) {
                    const reportResult = await executeStep(entity.name, "Report", entity.reportFn, entity.reportLabel);
                    summary.push({ Entity: entity.name, Action: "Generate Report", ...reportResult });
                } else {
                    console.log(`--> [${entity.name}] Skipping Report Generation (runGenerateReport is false)`);
                }
                console.log("");
            }
        }

        // Output final summary
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log("==================================================");
        console.log("                   SYNC SUMMARY                   ");
        console.log("==================================================");
        console.log(`Total Time Elapsed: ${totalDuration}s`);
        if (summary.length > 0) {
            console.table(summary);
        }
        console.log("==================================================");
        console.log("Sync process completed successfully!");

    } catch (error) {
        console.error("\n[FATAL ERROR] Sync process halted:", error);
    } finally {
        if (isConnected || mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
            console.log("Database connection closed.");
        }
        process.exit(0);
    }
}

// Run script
syncAmazonData();
