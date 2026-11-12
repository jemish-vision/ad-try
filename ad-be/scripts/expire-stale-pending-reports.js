/**
 * One-off cleanup: SP-API report rows stuck in PENDING.
 *
 * Before the CANCELLED/FATAL fix, REIMBURSEMENT and BUSINESS_SALES report rows whose Amazon
 * report ended CANCELLED/FATAL stayed PENDING forever (the recurring lookup only re-polls rows
 * from the last 24h, then requests a new report). This marks those stale rows EXPIRED.
 *
 * Safe by default: DRY RUN unless --apply is passed. Deploy the CANCELLED/FATAL fix first.
 *
 * Usage:
 *   node scripts/expire-stale-pending-reports.js                  # dry run, older than 48h
 *   node scripts/expire-stale-pending-reports.js --hours=72       # dry run, custom age
 *   node scripts/expire-stale-pending-reports.js --apply          # actually update
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const REPORT_TYPES = ["REIMBURSEMENT", "BUSINESS_SALES"];

function parseArgs(argv) {
  const args = { apply: false, hours: 48 };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a.startsWith("--hours=")) args.hours = Number(a.split("=")[1]);
  }
  if (!Number.isFinite(args.hours) || args.hours < 24) {
    throw new Error("--hours must be a number >= 24 (rows younger than 24h are still polled by the cron).");
  }
  return args;
}

async function main() {
  const { apply, hours } = parseArgs(process.argv.slice(2));
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  const reports = require("../api-server/models/report.model");
  console.log(`Connected to ${mongoose.connection.name}. Mode: ${apply ? "APPLY" : "DRY RUN"}. Cutoff: older than ${hours}h.`);

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const filter = { reportTypeId: { $in: REPORT_TYPES }, status: "PENDING", createdAt: { $lt: cutoff } };

  const breakdown = await reports.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { reportTypeId: "$reportTypeId", month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } } },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.month": 1, "_id.reportTypeId": 1 } },
  ]);
  const total = breakdown.reduce((n, r) => n + r.count, 0);

  console.table(breakdown.map((r) => ({ reportType: r._id.reportTypeId, month: r._id.month, count: r.count })));
  console.log(`Total stale PENDING rows: ${total}`);

  if (!apply) {
    console.log("Dry run only — nothing changed. Re-run with --apply to mark these rows EXPIRED.");
  } else if (total > 0) {
    const res = await reports.updateMany(filter, {
      $set: {
        status: "EXPIRED",
        errorMessage: `Expired by cleanup: PENDING for more than ${hours}h (Amazon report likely CANCELLED/FATAL or superseded).`,
      },
    });
    console.log(`Updated ${res.modifiedCount} row(s) to EXPIRED.`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
