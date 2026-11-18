/**
 * Out-of-stock products in running ads — database setup. Safe to re-run.
 *
 *  1. Creates the daily cron schedule "Out Of Stock Ads" (queue-service picks it up; task "out-of-stock-ads").
 *  2. Creates the out_of_stock_ads indexes.
 *  3. Optional --run-now: builds the list immediately (all seller/vendor profiles, or one with
 *     --profile=<profileId>) instead of waiting for the first daily run. Needs Redis + Amazon Ads access.
 *
 * Usage (dry run first, then --apply):
 *   node scripts/setup-out-of-stock-ads.js
 *   node scripts/setup-out-of-stock-ads.js --apply
 *   node scripts/setup-out-of-stock-ads.js --apply --run-now [--profile=1234567890]
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const CRON = {
  cronName: "Out Of Stock Ads",
  cronDescription:
    "Daily list of out-of-stock products that are still advertised in running SP/SD campaigns (dashboard, seller and vendor profiles).",
  // node-cron with seconds, server time: every day at 03:00
  cronExpression: process.env.OUT_OF_STOCK_ADS_CRON || "0 0 3 * * *",
  frequency: "Daily",
  isActive: true,
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RUN_NOW = args.includes("--run-now");
const PROFILE = (args.find((a) => a.startsWith("--profile=")) || "").replace("--profile=", "") || null;
const log = (msg) => console.log(`${APPLY ? "" : "[dry run] "}${msg}`);

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log(`Connected to ${mongoose.connection.name}. Mode: ${APPLY ? "APPLY" : "DRY RUN (nothing is changed)"}\n`);

  const CronJob = require("../api-server/models/cronJob.model");
  const OutOfStockAd = require("../api-server/models/outOfStockAd.model");

  console.log("1. Cron schedule");
  const cron = await CronJob.findOne({ cronName: CRON.cronName }).lean();
  if (cron) console.log(`  exists: ${cron.cronName} [${cron.cronExpression}] active=${cron.isActive}`);
  else {
    log(`  create "${CRON.cronName}" [${CRON.cronExpression}]`);
    if (APPLY) await CronJob.create(CRON);
  }

  console.log("\n2. Indexes");
  if (APPLY) {
    await OutOfStockAd.syncIndexes();
    console.log("  out_of_stock_ads indexes synced");
  } else log("  sync out_of_stock_ads indexes");

  if (RUN_NOW) {
    console.log("\n3. Build the list now");
    if (!APPLY) log("  run the out-of-stock check");
    else {
      const { cronOutOfStockAds } = require("../api-server/services/automation/outOfStockAds.service");
      const result = await cronOutOfStockAds(PROFILE ? { profileId: Number(PROFILE) } : {});
      console.log(`  profiles: ${result.profiles}, completed: ${result.completed}`);
      console.log(`  products saved: ${await OutOfStockAd.countDocuments(PROFILE ? { profileId: Number(PROFILE) } : {})}`);
    }
  }

  console.log(`\n${APPLY ? "Done." : "Dry run only — re-run with --apply."} Restart queue-service so it schedules the new cron.`);
  await mongoose.disconnect();
  try {
    const { redisClient } = require("../api-server/services/redis.service");
    if (redisClient?.isOpen) await redisClient.quit();
  } catch (_) {}
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
