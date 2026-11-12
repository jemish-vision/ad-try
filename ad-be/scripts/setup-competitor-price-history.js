/**
 * One-time setup for Competitor Price History (Enterprise feature). Safe to re-run.
 *
 *  1. Page "Competitor Price History" with actions "View Only" and "Update"
 *     → then in Super Admin → Plans, tick this page on the Enterprise plan.
 *  2. Cron schedule "ASIN Snapshot" (hourly; each profile is snapshotted once per local day)
 *     → appears under Super Admin → Cron Job, where it can be paused or re-timed.
 *  3. asinSnapshot indexes, including the TTL index that deletes data after the retention period
 *     (the app connects with autoIndex disabled, so indexes must be created explicitly).
 *
 * Usage:
 *   node scripts/setup-competitor-price-history.js           # dry run: shows what would change
 *   node scripts/setup-competitor-price-history.js --apply   # apply
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const PAGE = {
  pageName: "Competitor Price History",
  pageSlug: "competitor-price-history",
  displayName: "Competitor Price History",
};
const ACTIONS = ["View Only", "Update"];
const CRON = {
  cronName: "ASIN Snapshot",
  cronDescription: "Daily price, Buy Box and rank snapshot for Competitor Price History (Enterprise plans). Runs hourly; each profile is captured once per local day after 06:00.",
  cronExpression: "0 20 * * * *",
  frequency: "Hourly",
  isActive: true,
};

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log(`Connected to ${mongoose.connection.name}. Mode: ${apply ? "APPLY" : "DRY RUN"}`);

  const Page = require("../api-server/models/superAdmin/pages.model");
  const PageAction = require("../api-server/models/superAdmin/pageAction.model");
  const CronJob = require("../api-server/models/cronJob.model");
  const AsinSnapshot = require("../api-server/models/asinSnapshot.model");

  // 1. Page + actions
  let page = await Page.findOne({ $or: [{ pageName: PAGE.pageName }, { pageSlug: PAGE.pageSlug }] }).lean();
  if (page) {
    console.log(`Page exists: ${page.pageName} (${page._id})`);
  } else {
    const productList = await Page.findOne({ pageName: "Product List" }).select("order").lean();
    const order = (productList?.order ?? 0) + 1;
    console.log(`Will create page "${PAGE.pageName}" (order ${order})`);
    if (apply) page = (await Page.create({ ...PAGE, order, isActive: true })).toObject();
  }
  if (page) {
    for (const actionType of ACTIONS) {
      const exists = await PageAction.exists({ pageId: page._id, actionType });
      if (exists) console.log(`  action exists: ${actionType}`);
      else {
        console.log(`  will add action: ${actionType}`);
        if (apply) await PageAction.create({ pageId: page._id, actionType });
      }
    }
  } else {
    console.log(`  will add actions: ${ACTIONS.join(", ")}`);
  }

  // 2. Cron schedule (existing schedule left untouched so admin edits are kept)
  const cron = await CronJob.findOne({ cronName: CRON.cronName }).lean();
  if (cron) console.log(`Cron exists: ${cron.cronName} [${cron.cronExpression}] active=${cron.isActive}`);
  else {
    console.log(`Will create cron "${CRON.cronName}" [${CRON.cronExpression}]`);
    if (apply) await CronJob.create(CRON);
  }

  // 3. Indexes (TTL!)
  const existing = await AsinSnapshot.collection.indexes().catch(() => []);
  const hasTtl = existing.some((i) => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0);
  console.log(`asinSnapshot TTL index present: ${hasTtl}`);
  if (apply) {
    await AsinSnapshot.syncIndexes();
    console.log("asinSnapshot indexes synced.");
  } else if (!hasTtl) {
    console.log("Will create asinSnapshot indexes (including TTL on expiresAt).");
  }

  console.log(apply ? "Done." : "Dry run only — re-run with --apply.");
  console.log('Next: Super Admin → Plans → edit the Enterprise plan → tick "Competitor Price History" (View Only + Update).');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
