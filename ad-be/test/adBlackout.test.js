const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");

const root = path.join(__dirname, "..");
const stub = (rel, exp) => {
  const resolved = require.resolve(path.join(root, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exp };
};

stub("api-server/services/redis.service.js", {
  getCacheWithLog: async () => null,
  setCacheWithLog: async () => {},
  redisClient: null,
});
stub("api-server/helper/rateLimiter.js", {});
stub("api-server/helper/amazonAxios.js", async () => ({ status: 200, data: {} }));
stub("winston/utility/logger.js", { write_logs: () => {} });

const { classifyBlackoutReason, extractServingStrings } = require("../api-server/services/adBlackoutDiagnostics.service");
const { getTargetHourSlot, evaluateZeroImpressionEntities } = require("../api-server/services/adBlackoutDetector.service");
const { createAdBlackoutController, sanitizeAlert } = require("../api-server/controllers/adBlackout.controller");
const { SYNC_TASKS, QUEUES } = require("../queue-service/queues/queueNames");
const { generateJobId } = require("../queue-service/contracts/jobId");
const { validateJobPayload } = require("../queue-service/contracts/jobPayload");
const { resolveMigratedSchedule } = require("../queue-service/scheduler/scheduleRegistry");

test("getTargetHourSlot computes previous completed hour in profile timezone", () => {
  // 2026-11-25T08:45:00Z = 14:15 in Asia/Kolkata (+05:30) -> target hour is 13:00 on 2026-11-25
  const slot = getTargetHourSlot(new Date("2026-11-25T08:45:00Z"), "Asia/Kolkata");
  assert.equal(slot.reportDate, "2026-11-25");
  assert.equal(slot.startTime, "13:00");
  assert.equal(slot.hourKey, "2026-11-25 13:00");
  assert.equal(slot.baselineFrom, "2026-11-18");
  assert.equal(slot.baselineTo, "2026-11-24");
});

test("extractServingStrings normalizes extendedData and moderation reasons", () => {
  const sigs = extractServingStrings({
    extendedData: {
      servingStatus: "creative_not_approved",
      servingStatusDetails: [{ name: "AD_POLICING_SUSPENDED", severity: "ERROR" }],
    },
    moderationStatus: "rejected",
  });
  assert.ok(sigs.includes("CREATIVE_NOT_APPROVED"));
  assert.ok(sigs.includes("AD_POLICING_SUSPENDED"));
  assert.ok(sigs.includes("REJECTED"));
});

test("classifyBlackoutReason handles all 4 blackout scenarios cleanly", () => {
  const buyBox = classifyBlackoutReason({
    buyBoxInfo: { asin: "B09TEST123", lostBuyBox: true, ourPrice: 599, buyBoxPrice: 549 },
  });
  assert.equal(buyBox.reasonCode, "BUY_BOX_LOST");
  assert.match(buyBox.plainReason, /B09TEST123.*Buy Box/);

  const unbuyable = classifyBlackoutReason({
    productMetadata: [{ asin: "B09OOS9999", availability: "NOT_BUYABLE" }],
  });
  assert.equal(unbuyable.reasonCode, "PRODUCT_UNBUYABLE");
  assert.match(unbuyable.plainReason, /B09OOS9999/);

  const creative = classifyBlackoutReason({
    creatives: [{ adId: 55, moderationStatus: "REJECTED", rejectionReason: "PROHIBITED_CLAIM" }],
  });
  assert.equal(creative.reasonCode, "CREATIVE_REJECTED");
  assert.match(creative.plainReason, /PROHIBITED_CLAIM/);

  const suppressed = classifyBlackoutReason({
    listingInfo: { asin: "B09SUP1111", sku: "SKU-1", suppressed: true, issueMessage: "Missing required material attribute" },
  });
  assert.equal(suppressed.reasonCode, "LISTING_SUPPRESSED");
  assert.match(suppressed.plainReason, /Missing required material attribute/);

  const ineligible = classifyBlackoutReason({
    productMetadata: [{ asin: "B09INEL111", eligibilityStatus: "NOT_ELIGIBLE", ineligibilityReason: "Variation parent cannot be advertised" }],
  });
  assert.equal(ineligible.reasonCode, "LISTING_INELIGIBLE");
  assert.match(ineligible.plainReason, /Variation parent/);

  const portfolio = classifyBlackoutReason({
    portfolio: { portfolioId: 91, name: "Q4 Top Sellers", isOutOfBudget: true },
  });
  assert.equal(portfolio.reasonCode, "PORTFOLIO_CAP_HIT");
  assert.match(portfolio.plainReason, /Q4 Top Sellers/);

  const ended = classifyBlackoutReason({
    endDate: "2026-11-24",
    todayDate: "2026-11-25",
  });
  assert.equal(ended.reasonCode, "CAMPAIGN_END_DATE");

  const rulePaused = classifyBlackoutReason({
    rulePauseInfo: { allTargetsPaused: true, ruleId: "r1", ruleName: "High ACoS Pause", pausedCount: 14 },
  });
  assert.equal(rulePaused.reasonCode, "RULE_PAUSED_ALL_TARGETS");
  assert.match(rulePaused.plainReason, /High ACoS Pause/);

  const healthyUnknown = classifyBlackoutReason({
    servingSignals: ["CAMPAIGN_STATUS_ENABLED"],
  });
  assert.equal(healthyUnknown.reasonCode, "UNKNOWN_SERVING_HALT");
  assert.equal(healthyUnknown.reasonParams.amazonReportsHealthy, true);
  assert.equal(healthyUnknown.reasonParams.rawServingStatus, null);
});

test("evaluateZeroImpressionEntities skips target hours whose stream batch is incomplete (<25%)", () => {
  const slot = { reportDate: "2026-11-25", hourPrefix: "11", startTime: "11:00", hourKey: "2026-11-25 11:00" };
  const enabledCampaigns = [
    { adType: "SP", campaignId: 1, name: "C1", startDate: "2026-10-01" },
    { adType: "SP", campaignId: 2, name: "C2", startDate: "2026-10-01" },
  ];
  const hourlyBaselines = [
    { adType: "SP", campaignId: 1, adGroupId: 11, avgHourlyImpressions: 4000 },
    { adType: "SP", campaignId: 2, adGroupId: 22, avgHourlyImpressions: 4000 },
  ];
  // Only 200 out of 8000 expected impressions arrived so far (2.5% < 25%) -> incomplete hour!
  const hourlyActuals = [
    { adType: "SP", campaignId: 1, adGroupId: 11, impressions: 200 },
    { adType: "SP", campaignId: 2, adGroupId: 22, impressions: 0 },
  ];
  const res = evaluateZeroImpressionEntities({
    slot,
    streamHealthy: true,
    enabledCampaigns,
    enabledAdGroups: [],
    hourlyActuals,
    hourlyBaselines,
    totals7d: [],
    activeAlerts: [],
  });
  assert.equal(res.skippedReason, "TARGET_HOUR_STREAM_INCOMPLETE");
  assert.equal(res.zeroCampaigns.length, 0);
});

test("evaluateZeroImpressionEntities guards quiet streams, ignores night hours, groups by campaign, and auto-resolves", () => {
  const slot = { reportDate: "2026-11-25", hourPrefix: "13", startTime: "13:00", hourKey: "2026-11-25 13:00" };
  const enabledCampaigns = [
    { adType: "SP", campaignId: 101, name: "Main SP", startDate: "2026-10-01" },
    { adType: "SB", campaignId: 102, name: "Brand Video", startDate: "2026-10-01" },
    { adType: "SP", campaignId: 103, name: "Low Traffic Night", startDate: "2026-10-01" },
  ];
  const enabledAdGroups = [
    { adType: "SP", campaignId: 101, adGroupId: 201, name: "AG inside dead camp" },
    { adType: "SB", campaignId: 102, adGroupId: 202, name: "Dead AG in live camp" },
    { adType: "SB", campaignId: 102, adGroupId: 203, name: "Live AG in live camp" },
  ];
  const hourlyBaselines = [
    { adType: "SP", campaignId: 101, adGroupId: 201, avgHourlyImpressions: 500 },
    { adType: "SB", campaignId: 102, adGroupId: 202, avgHourlyImpressions: 250 },
    { adType: "SB", campaignId: 102, adGroupId: 203, avgHourlyImpressions: 300 },
    { adType: "SP", campaignId: 103, adGroupId: 204, avgHourlyImpressions: 12 }, // below 100 guard
  ];
  const hourlyActuals = [
    { adType: "SP", campaignId: 101, adGroupId: 201, impressions: 0 }, // whole camp 101 is 0
    { adType: "SB", campaignId: 102, adGroupId: 202, impressions: 0 }, // ag 202 is 0
    { adType: "SB", campaignId: 102, adGroupId: 203, impressions: 280 }, // ag 203 still serving -> camp 102 is 280 (>0)
    { adType: "SP", campaignId: 103, adGroupId: 204, impressions: 0 },
  ];
  const totals7d = [
    { adType: "SP", campaignId: 101, adGroupId: 201, sales: 12000, impressions: 50000, spend: 1500 },
    { adType: "SB", campaignId: 102, adGroupId: 202, sales: 4500, impressions: 18000, spend: 700 },
  ];
  const activeAlerts = [
    { _id: "old1", adType: "SB", entityLevel: "AD_GROUP", campaignId: 102, adGroupId: 203 }, // resumed traffic -> resolve
  ];

  // 1. Quiet stream guard prevents new detections, still resolves old1
  const quiet = evaluateZeroImpressionEntities({
    slot,
    streamHealthy: false,
    enabledCampaigns,
    enabledAdGroups,
    hourlyActuals,
    hourlyBaselines,
    totals7d,
    activeAlerts,
  });
  assert.equal(quiet.skippedReason, "AMS_STREAM_QUIET");
  assert.equal(quiet.zeroCampaigns.length, 0);
  assert.equal(quiet.zeroAdGroups.length, 0);
  assert.equal(quiet.alertsToResolve.length, 1);

  // 2. Healthy stream detects camp 101 (CAMPAIGN), ignores ag 201 (grouped), detects ag 202 (AD_GROUP), ignores low-baseline 103
  const healthy = evaluateZeroImpressionEntities({
    slot,
    streamHealthy: true,
    enabledCampaigns,
    enabledAdGroups,
    hourlyActuals,
    hourlyBaselines,
    totals7d,
    activeAlerts,
  });
  assert.equal(healthy.skippedReason, null);
  assert.equal(healthy.zeroCampaigns.length, 1);
  assert.equal(healthy.zeroCampaigns[0].campaignId, 101);
  assert.equal(healthy.zeroCampaigns[0].baseline.sales7d, 12000);
  assert.equal(healthy.zeroAdGroups.length, 1);
  assert.equal(healthy.zeroAdGroups[0].adGroupId, 202);
  assert.equal(healthy.alertsToResolve.length, 1);
  assert.equal(healthy.alertsToResolve[0]._id, "old1");
});

test("sanitizeAlert strips monetary baseline fields and keeps non-monetary hourly traffic context", () => {
  const sanitized = sanitizeAlert({
    _id: "695666084b7687741f926dda",
    adType: "SP",
    entityLevel: "CAMPAIGN",
    campaignId: 101,
    campaignName: "Main SP",
    status: "ACTIVE",
    detectedAt: new Date("2026-11-25T08:15:00Z"),
    firstBlackoutHour: "2026-11-25 13:00",
    lastZeroHour: "2026-11-25 13:00",
    lastCheckedHour: "2026-11-25 13:00",
    reasonCode: "BUY_BOX_LOST",
    reasonParams: { asin: "B09TEST123" },
    plainReason: "Product B09TEST123 lost the Buy Box.",
    affectedAsins: ["B09TEST123"],
    baseline: { avgHourlyImpressions: 450, sales7d: 99999, spend7d: 5000, impressions7d: 40000 },
  });
  assert.equal(sanitized.avgHourlyImpressions, 450);
  assert.equal(sanitized.baseline, undefined);
  assert.equal("sales7d" in sanitized, false);
  assert.equal("estimatedLoss" in sanitized, false);
});

test("adBlackout controller fetches sorted alerts and dismisses alerts", async () => {
  const alertId = new mongoose.Types.ObjectId();
  let sortPassed = null;

  const mockAlertModel = {
    countDocuments: async () => 1,
    find: () => ({
      sort: (s) => {
        sortPassed = s;
        return {
          skip: () => ({
            limit: () => ({
              lean: async () => [
                {
                  _id: alertId,
                  adType: "SB",
                  entityLevel: "CAMPAIGN",
                  campaignId: 500,
                  campaignName: "Hero Video",
                  status: "ACTIVE",
                  detectedAt: new Date(),
                  firstBlackoutHour: "2026-11-25 13:00",
                  lastZeroHour: "2026-11-25 13:00",
                  lastCheckedHour: "2026-11-25 13:00",
                  reasonCode: "CREATIVE_REJECTED",
                  reasonParams: { detail: "POLICY" },
                  plainReason: "Creative rejected.",
                  affectedAsins: [],
                  baseline: { avgHourlyImpressions: 320, sales7d: 5000 },
                },
              ],
            }),
          }),
        };
      },
    }),
    aggregate: async () => [{ _id: "CREATIVE_REJECTED", count: 1 }],
    findOneAndUpdate: async () => ({ _id: alertId, status: "DISMISSED" }),
  };

  const mockProfileModel = {
    findOne: () => ({ select: () => ({ lean: async () => ({ timezone: "Asia/Kolkata" }) }) }),
  };

  const controller = createAdBlackoutController({
    alertModel: mockAlertModel,
    profileModel: mockProfileModel,
  });

  const makeRes = () => {
    const out = { statusCode: null, body: null };
    return {
      status(code) {
        out.statusCode = code;
        return this;
      },
      send(payload) {
        out.body = payload;
        return out;
      },
      out,
    };
  };

  const r1 = makeRes();
  await controller.getAdBlackoutAlerts(
    { config: { configId: "695666084b7687741f926dda" }, body: { profileId: 12345, adType: "All", page: 1, limit: 6 } },
    r1
  );
  assert.equal(r1.out.body.isSuccess, true);
  assert.equal(r1.out.body.data.alerts.length, 1);
  assert.equal(sortPassed["baseline.sales7d"], -1);
  assert.equal(r1.out.body.data.alerts[0].baseline, undefined);

  const r2 = makeRes();
  await controller.dismissAdBlackoutAlert(
    { config: { configId: "695666084b7687741f926dda" }, body: { profileId: 12345, alertId: String(alertId) }, user: {} },
    r2
  );
  assert.equal(r2.out.body.isSuccess, true);
  assert.equal(r2.out.body.data.status, "DISMISSED");
});

test("BullMQ contract supports AD_BLACKOUT_MONITOR deterministic hourly jobId and schedule registry", () => {
  const scheduledFor = new Date("2026-11-25T08:15:00.000Z");
  const jobId = generateJobId({
    task: SYNC_TASKS.AD_BLACKOUT_MONITOR,
    configId: "695666084b7687741f926dda",
    profileId: 2630925322373862,
    scheduledFor,
  });
  assert.equal(jobId, "sync-ad-blackout-monitor-695666084b7687741f926dda-2630925322373862-20261125T08Z");

  const payload = validateJobPayload({
    schemaVersion: 1,
    task: SYNC_TASKS.AD_BLACKOUT_MONITOR,
    configId: "695666084b7687741f926dda",
    profileId: 2630925322373862,
    scheduledFor: scheduledFor.toISOString(),
    timeBlock: "20261125T08Z",
  });
  assert.equal(payload.task, "ad-blackout-monitor");

  const resolved = resolveMigratedSchedule("AdBlackoutMonitor");
  assert.deepEqual(resolved, { queue: QUEUES.HOURLY_SYNC, task: "ad-blackout-monitor", family: "sync" });
});

test("classifyBlackoutReason handles YYYYMMDD endDate, positive BUY_BOX_ELIGIBLE signal, and paused child entities", () => {
  const endedYmd = classifyBlackoutReason({
    campaignName: "Black Friday Deals",
    campaignState: "ENABLED",
    endDate: "20261124",
    todayDate: "2026-11-25",
  });
  assert.equal(endedYmd.reasonCode, "CAMPAIGN_END_DATE");
  assert.equal(endedYmd.reasonParams.endDate, "2026-11-24");

  const buyBoxEligibleOnly = classifyBlackoutReason({
    campaignName: "Healthy Buy Box Signal",
    campaignState: "ENABLED",
    servingSignals: ["CAMPAIGN_STATUS_ENABLED", "BUY_BOX_ELIGIBLE"],
    buyBoxInfo: { lostBuyBox: false },
  });
  assert.equal(buyBoxEligibleOnly.reasonCode, "UNKNOWN_SERVING_HALT");
  assert.equal(buyBoxEligibleOnly.reasonParams.amazonReportsHealthy, true);

  const pausedAds = classifyBlackoutReason({
    campaignName: "Paused Child ProductAds",
    campaignState: "ENABLED",
    allProductAdsPaused: true,
  });
  assert.equal(pausedAds.reasonCode, "CAMPAIGN_OR_ADGROUP_PAUSED");

  const pausedGroups = classifyBlackoutReason({
    campaignName: "Paused Child AdGroups",
    campaignState: "ENABLED",
    allAdGroupsPaused: true,
  });
  assert.equal(pausedGroups.reasonCode, "CAMPAIGN_OR_ADGROUP_PAUSED");
});
