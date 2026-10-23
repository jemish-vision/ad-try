const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function syncAllIndexes() {
  try {
    console.log("Connecting to MongoDB...");
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 120000,
    });
    console.log(`Connected to database: ${conn.connection.name}`);

    const modelsDir = path.join(__dirname, "../api-server/models");

    function loadModelsRecursively(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          loadModelsRecursively(fullPath);
        } else if (file.endsWith(".js")) {
          try {
            require(fullPath);
          } catch (e) {
            // Ignore non-model JS files if any
          }
        }
      }
    }

    loadModelsRecursively(modelsDir);

    const modelNames = mongoose.modelNames();
    console.log(`Found ${modelNames.length} registered Mongoose models. Syncing indexes...`);

    let totalSynced = 0;
    let totalFailed = 0;

    for (const name of modelNames) {
      const model = mongoose.model(name);
      try {
        await model.syncIndexes();
        console.log(`[OK] Synced indexes for model: ${name}`);
        totalSynced++;
      } catch (err) {
        console.error(`[ERROR] Failed to sync indexes for ${name}:`, err.message);
        totalFailed++;
      }
    }

    console.log(`\n========================================`);
    console.log(`Index synchronization complete!`);
    console.log(`Successfully synced: ${totalSynced} models`);
    console.log(`Failed / Skipped:    ${totalFailed} models`);
    console.log(`========================================\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Critical error during index sync:", error);
    process.exit(1);
  }
}

syncAllIndexes();
