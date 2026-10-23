require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { cronListAdGroupsFromAmazon, cronGenerateAdGroupReport } = require("../api-server/controllers/adGroups.controller");

async function syncAdGroupData() {
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

        // 1. List AdGroups
        console.log("--> Executing: cronListAdGroupsFromAmazon");
        // await cronListAdGroupsFromAmazon(pastSyncObj);
        console.log("--> Completed: cronListAdGroupsFromAmazon\n");

        // 2. Generate AdGroup Report
        console.log("--> Executing: cronGenerateAdGroupReport");
        await cronGenerateAdGroupReport(false, false, pastSyncObj);
        console.log("--> Completed: cronGenerateAdGroupReport\n");

        console.log("Sync script finished successfully!");
    } catch (error) {
        console.error("Error during execution:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed.");
        process.exit(0);
    }
}

syncAdGroupData();


//  profileId: 2630925322373862, // REPLACE WITH ACTUAL PROFILE ID (Number)
//             configId: "69809498df1b0ea4ae334fc5", // REPLACE WITH ACTUAL CONFIG ID (String),