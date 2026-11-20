require("dotenv").config();
const mongoose = require("mongoose");
const targetingSchema = require("../api-server/models/targeting.model");
const { buildTargetingMetricsPipeline } = require("../api-server/helper/targetingMetricsPipeline");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const profileId = 2376610121042864;
  const configId = new mongoose.Types.ObjectId("698180fcc241e002c2b6f153");

  const queryWithStatus = {
    configId,
    profileId,
    status: "ENABLED",
    reportDate: { $gte: "2026-11-11", $lte: "2026-11-17" }
  };

  const pipe = buildTargetingMetricsPipeline(queryWithStatus);
  const explain = await targetingSchema.aggregate(pipe).explain("executionStats");
  console.log("EXPLAIN STAGES:", JSON.stringify(explain.stages?.[0] || explain, null, 2));

  await mongoose.disconnect();
}
run().catch(console.error);
