require("dotenv").config();
const mongoose = require("mongoose");
const targetingSchema = require("../api-server/models/targeting.model");
const campaignSchema = require("../api-server/models/campaign.model");
const adGroupSchema = require("../api-server/models/adGroups.model");
const { getTargeting } = require("../api-server/controllers/targeting.controller");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const profileId = 2376610121042864; // TOPLOT
  const configId = "698180fcc241e002c2b6f153";

  const req = {
    adType: "SP",
    models: {
      adTypeTargetingSchema: targetingSchema,
      adTypeCampaignSchema: campaignSchema,
      adTypeAdGroupSchema: adGroupSchema
    },
    config: { configId },
    body: {
      profileId,
      fromDate: "2026-11-11",
      toDate: "2026-11-17",
      pageNo: 1,
      perPage: 10,
      fieldName: "sales",
      sortType: "DESC",
      targetingStatus: "ENABLED",
      query: JSON.stringify({ status: { $eq: "ENABLED" } })
    }
  };

  let captured = null;
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(data) {
      captured = data;
      return this;
    }
  };

  console.log("Starting getTargeting execution...");
  const t0 = Date.now();
  await getTargeting(req, res);
  const elapsed = Date.now() - t0;
  console.log("getTargeting finished in", elapsed, "ms. Status:", res.statusCode, "Records:", captured?.totalRecords);
  await mongoose.disconnect();
}
run().catch(console.error);
