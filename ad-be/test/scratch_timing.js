require("dotenv").config();
const mongoose = require("mongoose");
const targetingSchema = require("../api-server/models/targeting.model");
const { buildTargetingMetricsPipeline, resolveSPAutoTargetBids } = require("../api-server/helper/targetingMetricsPipeline");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const profileId = 2376610121042864;
  const configId = new mongoose.Types.ObjectId("698180fcc241e002c2b6f153");

  const query = {
    configId,
    profileId,
    reportDate: { $gte: "2026-11-11", $lte: "2026-11-17" }
  };

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
    { $unwind: { path: "$adGroup", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "campaignbidthresholds",
        let: { cId: "$campaign.campaignId" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$campaignId", "$$cId"] }] } } },
          { $limit: 1 },
          { $project: { _id: 0, minBid: 1, maxBid: 1 } }
        ],
        as: "bidThreshold"
      }
    },
    { $unwind: { path: "$bidThreshold", preserveNullAndEmptyArrays: true } }
  ];

  const baseGroupPipeline = [
    ...buildTargetingMetricsPipeline(query),
    ...resolveSPAutoTargetBids("adgroups", configId),
  ];

  const matchFilterStages = [{ $match: { status: "ENABLED" } }];

  console.log("--- Timing FAST PATH (needsEarlyLookup = false) ---");
  let t0 = Date.now();
  const fastPipeline = [
    ...baseGroupPipeline,
    ...matchFilterStages,
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
          ...lookupStages
        ]
      }
    }
  ];
  const rFast = await targetingSchema.aggregate(fastPipeline).allowDiskUse(true);
  console.log("FAST PATH took:", Date.now() - t0, "ms");

  console.log("--- Timing EARLY LOOKUP PATH (needsEarlyLookup = true) ---");
  t0 = Date.now();
  const earlyPipeline = [
    ...baseGroupPipeline,
    ...lookupStages,
    ...matchFilterStages,
    {
      $facet: {
        totalRow: [
          { $group: { _id: null, totalClicks: { $sum: "$clicks" }, totalSales: { $sum: "$sales" } } }
        ],
        totalCount: [{ $count: "count" }],
        data: [
          { $sort: { sales: -1 } },
          { $skip: 0 },
          { $limit: 10 }
        ]
      }
    }
  ];
  const rEarly = await targetingSchema.aggregate(earlyPipeline).allowDiskUse(true);
  console.log("EARLY LOOKUP PATH took:", Date.now() - t0, "ms");

  await mongoose.disconnect();
}
run().catch(console.error);
