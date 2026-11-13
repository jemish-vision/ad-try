/**
 * Competitor Comparison (Enterprise feature) — database setup / migration. Safe to re-run.
 *
 * The whole Competitor Comparison page (sidebar item, Compare Offers button, comparison, fees and
 * price history APIs) is gated by ONE page: "Competitor Comparison" (actions: View Only, Update).
 *   View Only → open the page and see history · Update → change the history retention setting.
 *
 * What it does:
 *  1. Page
 *     - If the earlier "Competitor Price History" page exists, it is RENAMED to "Competitor Comparison".
 *       Plans and roles reference pages by id, so every plan/role that had it keeps it.
 *     - If both pages exist, plan and role allocations are moved to "Competitor Comparison" and the old
 *       page is deactivated.
 *     - If neither exists, "Competitor Comparison" is created.
 *     - Ensures actions "View Only" and "Update" exist.
 *  2. Plan (optional): --plan="Enterprise" adds the page (View Only + Update) to that plan if missing.
 *  3. Cron schedule "ASIN Snapshot" and asinSnapshot indexes (incl. the TTL index).
 *  4. Clears the cached page permissions in Redis (orgPagePerm_*), so changes apply immediately.
 *
 * Usage (dry run first, then --apply):
 *   node scripts/setup-competitor-comparison.js
 *   node scripts/setup-competitor-comparison.js --plan="Enterprise"
 *   node scripts/setup-competitor-comparison.js --plan="Enterprise" --apply
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const PAGE = { pageName: "Competitor Comparison", pageSlug: "competitor-comparison", displayName: "Competitor Comparison" };
const OLD_PAGE = { pageName: "Competitor Price History", pageSlug: "competitor-price-history" };
const ACTIONS = ["View Only", "Update"];
const CRON = {
  cronName: "ASIN Snapshot",
  cronDescription:
    "Daily price, Buy Box and rank snapshot for Competitor Comparison price history (Enterprise plans). Runs hourly; each profile is captured once per local day after 06:00.",
  cronExpression: "0 20 * * * *",
  frequency: "Hourly",
  isActive: true,
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PLAN_NAME = (args.find((a) => a.startsWith("--plan=")) || "").replace("--plan=", "").replace(/^["']|["']$/g, "").trim() || null;

const log = (msg) => console.log(`${APPLY ? "" : "[dry run] "}${msg}`);

async function ensureActions(PageAction, pageId) {
  const byType = {};
  for (const actionType of ACTIONS) {
    let action = await PageAction.findOne({ pageId, actionType }).lean();
    if (!action) {
      log(`  add action "${actionType}"`);
      if (APPLY) action = (await PageAction.create({ pageId, actionType })).toObject();
    }
    if (action) byType[actionType] = action._id;
  }
  return byType;
}

/** Moves allocations of oldPageId to newPageId in a collection with { pages: [{ pageId, allocatedActions }] }. */
async function moveAllocations(Model, label, oldPageId, newPageId, oldActionTypeById, newActionIdByType) {
  const docs = await Model.find({ "pages.pageId": oldPageId }).lean();
  for (const doc of docs) {
    const hasNew = doc.pages.some((p) => String(p.pageId) === String(newPageId));
    const oldEntry = doc.pages.find((p) => String(p.pageId) === String(oldPageId));
    const pages = doc.pages.filter((p) => String(p.pageId) !== String(oldPageId));
    if (!hasNew) {
      pages.push({
        pageId: newPageId,
        allocatedActions: (oldEntry.allocatedActions || [])
          .map((a) => ({ actionId: newActionIdByType[oldActionTypeById[String(a.actionId)]], status: a.status }))
          .filter((a) => a.actionId),
        allocatedOn: oldEntry.allocatedOn || new Date(),
      });
    }
    log(`  ${label} ${doc.name || doc._id}: ${hasNew ? "remove duplicate old entry" : "move allocation to Competitor Comparison"}`);
    if (APPLY) await Model.updateOne({ _id: doc._id }, { $set: { pages } });
  }
  return docs.length;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log(`Connected to ${mongoose.connection.name}. Mode: ${APPLY ? "APPLY" : "DRY RUN (nothing is changed)"}\n`);

  const Page = require("../api-server/models/superAdmin/pages.model");
  const PageAction = require("../api-server/models/superAdmin/pageAction.model");
  const Permission = require("../api-server/models/superAdmin/permission.model");
  const Packages = require("../api-server/models/packages.model");
  const CronJob = require("../api-server/models/cronJob.model");
  const AsinSnapshot = require("../api-server/models/asinSnapshot.model");

  // ── 1. Page ───────────────────────────────────────────────────────────────
  console.log("1. Page");
  let page = await Page.findOne({ $or: [{ pageName: PAGE.pageName }, { pageSlug: PAGE.pageSlug }] }).lean();
  const oldPage = await Page.findOne({ $or: [{ pageName: OLD_PAGE.pageName }, { pageSlug: OLD_PAGE.pageSlug }] }).lean();

  if (!page && oldPage) {
    log(`rename "${oldPage.pageName}" (${oldPage._id}) → "${PAGE.pageName}" (plans/roles that had it keep it)`);
    if (APPLY) await Page.updateOne({ _id: oldPage._id }, { $set: { ...PAGE, isActive: true } });
    page = { ...oldPage, ...PAGE };
  } else if (!page) {
    const productList = await Page.findOne({ pageName: "Product List" }).select("order").lean();
    const order = (productList?.order ?? 0) + 1;
    log(`create page "${PAGE.pageName}" (order ${order})`);
    if (APPLY) page = (await Page.create({ ...PAGE, order, isActive: true })).toObject();
  } else {
    console.log(`  page exists: "${page.pageName}" (${page._id})`);
  }

  let actionIdByType = {};
  if (page?._id) actionIdByType = await ensureActions(PageAction, page._id);

  if (page?._id && oldPage && String(oldPage._id) !== String(page._id)) {
    console.log(`  both "${PAGE.pageName}" and "${OLD_PAGE.pageName}" exist → merging`);
    const oldActions = await PageAction.find({ pageId: oldPage._id }).lean();
    const oldTypeById = Object.fromEntries(oldActions.map((a) => [String(a._id), a.actionType]));
    await moveAllocations(Packages, "plan", oldPage._id, page._id, oldTypeById, actionIdByType);
    await moveAllocations(Permission, "role", oldPage._id, page._id, oldTypeById, actionIdByType);
    log(`  deactivate old page "${oldPage.pageName}"`);
    if (APPLY) await Page.updateOne({ _id: oldPage._id }, { $set: { isActive: false } });
  }

  // ── 2. Plan ───────────────────────────────────────────────────────────────
  console.log("\n2. Plans");
  if (PLAN_NAME) {
    const plan = await Packages.findOne({ name: { $regex: `^${PLAN_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).lean();
    if (!plan) {
      console.log(`  ⚠ plan "${PLAN_NAME}" not found — create it in Super Admin → Plans, then re-run.`);
    } else if (page?._id && plan.pages?.some((p) => String(p.pageId) === String(page._id))) {
      console.log(`  plan "${plan.name}" already includes the page`);
    } else {
      log(`add "${PAGE.pageName}" (View Only + Update) to plan "${plan.name}"`);
      if (APPLY && page?._id) {
        await Packages.updateOne(
          { _id: plan._id },
          { $push: { pages: { pageId: page._id, allocatedActions: ACTIONS.map((t) => ({ actionId: actionIdByType[t], status: true })), allocatedOn: new Date() } } }
        );
      }
    }
  }
  if (page?._id) {
    const plans = await Packages.find({ "pages.pageId": page._id }).select("name").lean();
    console.log(`  plans with Competitor Comparison: ${plans.map((p) => p.name).join(", ") || "(none)"}`);
    const roles = await Permission.countDocuments({ "pages.pageId": page._id });
    console.log(`  roles with Competitor Comparison: ${roles} (team members also need it in their role)`);
  }

  // ── 3. Cron + indexes ─────────────────────────────────────────────────────
  console.log("\n3. Snapshot schedule & indexes");
  const cron = await CronJob.findOne({ cronName: CRON.cronName }).lean();
  if (cron) console.log(`  cron exists: ${cron.cronName} [${cron.cronExpression}] active=${cron.isActive}`);
  else {
    log(`create cron "${CRON.cronName}" [${CRON.cronExpression}]`);
    if (APPLY) await CronJob.create(CRON);
  }
  const indexes = await AsinSnapshot.collection.indexes().catch(() => []);
  const hasTtl = indexes.some((i) => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0);
  console.log(`  TTL index present: ${hasTtl}`);
  if (APPLY) {
    await AsinSnapshot.syncIndexes();
    console.log("  asinSnapshot indexes synced");
  } else if (!hasTtl) log("create asinSnapshot indexes (incl. TTL)");

  // ── 4. Permission cache ───────────────────────────────────────────────────
  console.log("\n4. Permission cache");
  if (APPLY) {
    try {
      const { clearOrgPagePermissionCache, redisClient } = require("../api-server/services/redis.service");
      await clearOrgPagePermissionCache();
      console.log("  cleared Redis orgPagePerm_* keys");
      await redisClient.quit().catch(() => {});
    } catch (err) {
      console.log(`  ⚠ could not clear Redis cache (${err.message}). Restart the API server instead.`);
    }
  } else log("clear Redis orgPagePerm_* keys");

  console.log(`\n${APPLY ? "Done." : "Dry run only — re-run with --apply."}`);
  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { moveAllocations, ensureActions };
