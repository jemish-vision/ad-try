require("dotenv").config();
const mongoose = require("mongoose");
const targetingSchema = require("../api-server/models/targeting.model");

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const profileId = 2376610121042864;
  const configId = new mongoose.Types.ObjectId("698180fcc241e002c2b6f153");

  const r = await targetingSchema.aggregate([
    { $match: { configId, profileId, reportDate: { $gte: "2026-11-11", $lte: "2026-11-17" } } },
    { $group: { _id: "$targetId", statuses: { $addToSet: "$status" } } },
    { $match: { "statuses.1": { $exists: true } } }
  ]);
  console.log("Targets with multiple statuses in date range:", r.length);
  await mongoose.disconnect();
  process.exit(0);
}
check();
