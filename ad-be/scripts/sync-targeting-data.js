require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { cronListTargetingFromAmazon, cronGenerateTargetingReport } = require("../api-server/controllers/targeting.controller");

async function syncTargetingData() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI, {
            autoIndex: false,
        });
        console.log("Database connected successfully.\n");

        // ==========================================
        // CONFIGURATION: Set your values here
        // ==========================================
        // const pastSyncObj = {
        //     profileId: 2376610121042864, // REPLACE WITH ACTUAL PROFILE ID (Number)
        //     configId: "698180fcc241e002c2b6f153", // REPLACE WITH ACTUAL CONFIG ID (String),
        //     startDate: "2026-10-01", // YYYY-MM-DD
        //     endDate: "2026-10-14",   // YYYY-MM-DD
        //     recurring: true         // Keep this false for manual execution
        // };

        const pastSyncObj = {
            profileId: 1406809169199414, // REPLACE WITH ACTUAL PROFILE ID (Number)
            configId: "6a2fd9dbdec3c6e2d5b466a6", // REPLACE WITH ACTUAL CONFIG ID (String),
            startDate: "2026-10-01", // YYYY-MM-DD
            endDate: "2026-10-20",   // YYYY-MM-DD
            recurring: true         // Keep this false for manual execution
        };

        console.log(`Starting Sync for Profile: ${pastSyncObj.profileId} | Config: ${pastSyncObj.configId}`);
        console.log(`Date Range: ${pastSyncObj.startDate} to ${pastSyncObj.endDate}\n`);

        // 1. List Targeting
        console.log("--> Executing: cronListTargetingFromAmazon");
        // await cronListTargetingFromAmazon(pastSyncObj);
        console.log("--> Completed: cronListTargetingFromAmazon\n");

        // 2. Generate Targeting Report
        console.log("--> Executing: cronGenerateTargetingReport");
        await cronGenerateTargetingReport(false, false, pastSyncObj);
        console.log("--> Completed: cronGenerateTargetingReport\n");

        console.log("Sync script finished successfully!");
    } catch (error) {
        console.error("Error during execution:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
        process.exit(0);
    }
}

syncTargetingData();
