require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { cronListProductAdsFromAmazon, cronGenerateAdProductReport } = require("../api-server/controllers/productAds.controller");

async function syncProductAdsData() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI, {
            autoIndex: false,
        });
        console.log("Database connected successfully.\n");

        // ==========================================
        // CONFIGURATION: Set your values here
        // ==========================================
        const pastSyncObj = {
            profileId: 1406809169199414, // REPLACE WITH ACTUAL PROFILE ID (Number)
            configId: "6a2fd9dbdec3c6e2d5b466a6", // REPLACE WITH ACTUAL CONFIG ID (String),
            startDate: "2026-10-01", // YYYY-MM-DD
            endDate: "2026-10-20",   // YYYY-MM-DD
            recurring: true         // Keep this false for manual execution
        };

        // const pastSyncObj = {
        //     profileId: 2630925322373862, // REPLACE WITH ACTUAL PROFILE ID (Number)
        //     configId: "69809498df1b0ea4ae334fc5", // REPLACE WITH ACTUAL CONFIG ID (String),
        //     startDate: "2026-10-01", // YYYY-MM-DD
        //     endDate: "2026-10-12",   // YYYY-MM-DD
        //     recurring: false         // Keep this false for manual execution
        // };

        console.log(`Starting Sync for Profile: ${pastSyncObj.profileId} | Config: ${pastSyncObj.configId}`);
        console.log(`Date Range: ${pastSyncObj.startDate} to ${pastSyncObj.endDate}\n`);

        // 1. List ProductAds
        console.log("--> Executing: cronListProductAdsFromAmazon");
        // await cronListProductAdsFromAmazon(pastSyncObj);
        console.log("--> Completed: cronListProductAdsFromAmazon\n");

        // 2. Generate ProductAds Report
        console.log("--> Executing: cronGenerateAdProductReport");
        await cronGenerateAdProductReport(false, false, pastSyncObj);
        console.log("--> Completed: cronGenerateAdProductReport\n");

        console.log("Sync script finished successfully!");
    } catch (error) {
        console.error("Error during execution:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
        process.exit(0);
    }
}

syncProductAdsData();
