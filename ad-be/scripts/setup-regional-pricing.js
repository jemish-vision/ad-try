/**
 * Regional pricing — database setup. Safe to re-run.
 *
 *  1. Creates the pricingRegion indexes.
 *  2. Existing paying customers keep the price they signed up with: organizations with a paid, unexpired
 *     subscription (or a paid upcoming plan) and no billing country yet are set to pricingMode "default"
 *     (always the plan's default price). Super Admin can switch any of them to regional pricing later in
 *     Regional Pricing → Organization billing.
 *  3. Everyone else stays on "auto": priced by the visitor's Cloudflare country until their first paid
 *     checkout, which locks the billing country.
 *
 * Usage (dry run first, then --apply):
 *   node scripts/setup-regional-pricing.js
 *   node scripts/setup-regional-pricing.js --apply
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const APPLY = process.argv.slice(2).includes("--apply");
const log = (msg) => console.log(`${APPLY ? "" : "[dry run] "}${msg}`);

/** Query for organizations that are paying today and haven't been through regional pricing yet. */
function payingLegacyQuery(now = new Date()) {
  return {
    pricingMode: { $ne: "default" },
    billingCountry: { $in: [null, ""] },
    $or: [
      { subscriptionId: { $ne: null }, endDate: { $gt: now }, isTrialActive: { $ne: true } },
      { isUpcomingPlanPaid: true },
    ],
  };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log(`Connected to ${mongoose.connection.name}. Mode: ${APPLY ? "APPLY" : "DRY RUN (nothing is changed)"}\n`);

  const PricingRegion = require("../api-server/models/pricingRegion.model");
  const Organization = require("../api-server/models/organization.model");

  console.log("1. Indexes");
  if (APPLY) {
    await PricingRegion.syncIndexes();
    console.log("  pricingRegion indexes synced");
  } else log("sync pricingRegion indexes");

  console.log("\n2. Existing paying customers → default pricing");
  const legacy = await Organization.find(payingLegacyQuery()).select("organizationName endDate").lean();
  for (const org of legacy) log(`  ${org.organizationName || org._id} (paid until ${org.endDate ? new Date(org.endDate).toISOString().slice(0, 10) : "-"})`);
  console.log(`  ${legacy.length} organization(s)`);
  if (APPLY && legacy.length) {
    const r = await Organization.updateMany({ _id: { $in: legacy.map((o) => o._id) } }, { $set: { pricingMode: "default" } });
    console.log(`  updated ${r.modifiedCount}`);
  }

  console.log("\n3. Current setup");
  const regions = await PricingRegion.find({}).lean();
  if (!regions.length) console.log("  no regions yet — everyone pays the default plan price until you add one in Super Admin → Regional Pricing");
  for (const r of regions) console.log(`  ${r.isActive ? "●" : "○"} ${r.name} [${r.currency}] ${r.countries.join(", ")} — ${r.prices.length} plan price(s)`);

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

module.exports = { payingLegacyQuery };
