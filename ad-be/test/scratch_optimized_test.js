require("dotenv").config();
const mongoose = require("mongoose");
const targetingSchema = require("../api-server/models/targeting.model");
const campaignSchema = require("../api-server/models/campaign.model");
const adGroupSchema = require("../api-server/models/adGroups.model");
const { buildTargetingMetricsPipeline, resolveSPAutoTargetBids } = require("../api-server/helper/targetingMetricsPipeline");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const profileId = 2376610121042864; // TOPLOT
  const configId = new mongoose.Types.ObjectId("698180fcc241e002c2b6f153");

  const lastDate = "2026-11-17";
  const lookupStages = [
    {
      $lookup: {
        from: "campaigns",
        let: { cId: "$_id.campaignId", pId: "$_id.profileId", end: lastDate },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$campaignId", "$$cId"] },
            { $eq: ["$profileId", "$$pId"] },
            { $eq: ["$reportDate", "$$end"] }
          ] } } },
          { $limit: 1 },
          { $project: { _id: 0, campaignId: 1, name: 1, status: 1, budget: 1, startDate: 1 } }
        ],
        as: "campaign"
      }
    },
    { $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "adgroups",
        let: { agId: "$_id.adGroupId", pId: "$_id.profileId", end: lastDate },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$adGroupId", "$$agId"] },
            { $eq: ["$profileId", "$$pId"] },
            { $eq: ["$reportDate", "$$end"] }
          ] } } },
          { $limit: 1 },
          { $project: { _id: 0, adGroupId: 1, name: 1, status: 1 } }
        ],
        as: "adGroup"
      }
    },
    { $unwind: { path: "$adGroup", preserveNullAndEmptyArrays: true } }
  ];

  // OPTIMIZED: Put status: "ENABLED" into query (uses ALREADY EXISTING index!)
  const query = {
    configId,
    profileId,
    status: "ENABLED",
    reportDate: { $gte: "2026-11-11", $lte: "2026-11-17" }
  };

  const t0 = Date.now();
  const pipe = [
    ...buildTargetingMetricsPipeline(query),
    {
      $facet: {
        totalRow: [
          { $group: { _id: null, totalClicks: { $sum: "$clicks" }, totalSales: { $sum: "$sales" } } }
        ],
        totalCount: [{ $count: "count" }],
        data: [
          { $sort: { sales: -1 } },
          { $skip: 0 },
          { $limit: 10 },
          ...resolveSPAutoTargetBids("adgroups", configId),
          ...lookupStages
        ]
      }
    }
  ];

  const res = await targetingSchema.aggregate(pipe).allowDiskUse(true);
  const elapsed = Date.now() - t0;
  console.log("Optimized pipeline finished in", elapsed, "ms!");
  console.log("Rows returned:", res[0]?.data?.length, "Total Count:", res[0]?.totalCount?.[0]?.count);

  await mongoose.disconnect();
}
run().catch(console.error);
