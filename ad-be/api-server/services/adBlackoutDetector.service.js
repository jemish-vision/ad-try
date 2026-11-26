const moment = require("moment-timezone");
const mongoose = require("mongoose");
const adBlackoutAlertSchema = require("../models/adBlackoutAlert.model");
const amsSubscriptionSchema = require("../models/amsSubscription.model");
const keywordsHourlyPerformanceSchema = require("../models/keywordsHourlyPerformanceSchema.model");
const campaignSchema = require("../models/campaign.model");
const sbCampaignSchema = require("../models/sbCampaign.model");
const sdCampaignSchema = require("../models/sdCampaign.model");
const adGroupSchema = require("../models/adGroups.model");
const sbAdGroupSchema = require("../models/sbAdGroups.model");
const sdAdGroupSchema = require("../models/sdAdGroups.model");
const productAdsSchema = require("../models/productAds.model");
const sbProductAdsSchema = require("../models/sbProductAds.model");
const sdProductAdsSchema = require("../models/sdProductAds.model");
const keywordSchema = require("../models/keyword.model");
const targetingSchema = require("../models/targeting.model");
const sbTargetingSchema = require("../models/sbTargeting.model");
const sdTargetingSchema = require("../models/sdTargeting.model");
const targetingRuleHistorySchema = require("../models/targetingRuleHistory.model");
const campaignOutOfBudgetHistorySchema = require("../models/campaignOutOfBudgetHistory.model");
const marketPlaceConfigSchema = require("../models/marketPlaceConfig.model");
const { getProfile, getAccessToken, getSPAccessToken } = require("../helper/common");
const {
  classifyBlackoutReason,
  fetchLiveAdsDiagnostics,
  fetchAdsProductEligibility,
  fetchSpApiDiagnostics,
} = require("./adBlackoutDiagnostics.service");

const MIN_BASELINE_HOURLY_IMPRESSIONS = 100;
const MIN_PROFILE_HOUR_COMPLETENESS_RATIO = 0.25;
const BASELINE_DAYS = 7;
const STREAM_HEALTH_WINDOW_MINUTES = 90;

const AD_TYPE_MODELS = {
  SP: { campaign: campaignSchema, adGroup: adGroupSchema, productAd: productAdsSchema, target: [keywordSchema, targetingSchema] },
  SB: { campaign: sbCampaignSchema, adGroup: sbAdGroupSchema, productAd: sbProductAdsSchema, target: [sbTargetingSchema] },
  SD: { campaign: sdCampaignSchema, adGroup: sdAdGroupSchema, productAd: sdProductAdsSchema, target: [sdTargetingSchema] },
};

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

function getTargetHourSlot(now = new Date(), timezone = "UTC", offsetHours = 1) {
  const tz = timezone || "UTC";
  const current = moment(now).tz(tz);
  const target = current.clone().subtract(offsetHours, "hours");
  const prevTarget = current.clone().subtract(offsetHours + 1, "hours");
  const reportDate = target.format("YYYY-MM-DD");
  const hourPrefix = target.format("HH");
  const startTime = `${hourPrefix}:00`;
  return {
    timezone: tz,
    reportDate,
    hourPrefix,
    startTime,
    hourKey: `${reportDate} ${startTime}`,
    prevReportDate: prevTarget.format("YYYY-MM-DD"),
    prevHourPrefix: prevTarget.format("HH"),
    currentDate: current.format("YYYY-MM-DD"),
    currentHourPrefix: current.format("HH"),
    baselineFrom: target.clone().subtract(BASELINE_DAYS, "days").format("YYYY-MM-DD"),
    baselineTo: target.clone().subtract(1, "days").format("YYYY-MM-DD"),
  };
}

/**
 * Pure core evaluator: decides which active alerts resolved and which ENABLED entities
 * dropped to 0 impressions during a normally active hour (>= minImpressions).
 */
function evaluateZeroImpressionEntities({
  slot,
  streamHealthy,
  enabledCampaigns = [],
  enabledAdGroups = [],
  hourlyActuals = [],
  hourlyBaselines = [],
  totals7d = [],
  activeAlerts = [],
  recentlyDismissedKeys = new Set(),
  minBaselineImpressions = MIN_BASELINE_HOURLY_IMPRESSIONS,
}) {
  const campActual = new Map();
  const agActual = new Map();
  for (const row of hourlyActuals) {
    const type = String(row.adType || row.type || "").toUpperCase();
    const cId = Number(row.campaignId);
    const agId = row.adGroupId != null ? Number(row.adGroupId) : null;
    const impr = Number(row.impressions || 0);
    if (!type || !Number.isFinite(cId)) continue;
    const ck = `${type}:${cId}`;
    campActual.set(ck, (campActual.get(ck) || 0) + impr);
    if (Number.isFinite(agId)) {
      const ak = `${type}:${cId}:${agId}`;
      agActual.set(ak, (agActual.get(ak) || 0) + impr);
    }
  }

  const campBase = new Map();
  const agBase = new Map();
  for (const row of hourlyBaselines) {
    const type = String(row.adType || row.type || "").toUpperCase();
    const cId = Number(row.campaignId);
    const agId = row.adGroupId != null ? Number(row.adGroupId) : null;
    const avg = Number(row.avgHourlyImpressions || 0);
    if (!type || !Number.isFinite(cId)) continue;
    const ck = `${type}:${cId}`;
    campBase.set(ck, (campBase.get(ck) || 0) + avg);
    if (Number.isFinite(agId)) {
      const ak = `${type}:${cId}:${agId}`;
      agBase.set(ak, (agBase.get(ak) || 0) + avg);
    }
  }

  const camp7d = new Map();
  const ag7d = new Map();
  for (const row of totals7d) {
    const type = String(row.adType || row.type || "").toUpperCase();
    const cId = Number(row.campaignId);
    const agId = row.adGroupId != null ? Number(row.adGroupId) : null;
    const add = (map, k) => {
      const prev = map.get(k) || { sales7d: 0, impressions7d: 0, spend7d: 0 };
      prev.sales7d += Number(row.sales || 0);
      prev.impressions7d += Number(row.impressions || 0);
      prev.spend7d += Number(row.spend || 0);
      map.set(k, prev);
    };
    if (type && Number.isFinite(cId)) {
      add(camp7d, `${type}:${cId}`);
      if (Number.isFinite(agId)) add(ag7d, `${type}:${cId}:${agId}`);
    }
  }

  const enabledCampMap = new Map(enabledCampaigns.map((c) => [`${c.adType}:${Number(c.campaignId)}`, c]));
  const enabledAgMap = new Map(enabledAdGroups.map((g) => [`${g.adType}:${Number(g.campaignId)}:${Number(g.adGroupId)}`, g]));

  // Auto-resolve active alerts where traffic resumed OR entity was intentionally paused
  const alertsToResolve = [];
  for (const alert of activeAlerts) {
    const ck = `${alert.adType}:${Number(alert.campaignId)}`;
    if (alert.entityLevel === "CAMPAIGN") {
      const impr = campActual.get(ck) || 0;
      if (impr > 0 || !enabledCampMap.has(ck)) alertsToResolve.push(alert);
    } else {
      const ak = `${alert.adType}:${Number(alert.campaignId)}:${Number(alert.adGroupId)}`;
      const impr = agActual.get(ak) || 0;
      const campImpr = campActual.get(ck) || 0;
      // Resolve if ad group has impressions, or entity paused, or parent campaign itself went down (promoted to CAMPAIGN alert)
      if (impr > 0 || !enabledCampMap.has(ck) || !enabledAgMap.has(ak) || (campImpr === 0 && (campBase.get(ck) || 0) >= minBaselineImpressions)) {
        alertsToResolve.push(alert);
      }
    }
  }

  if (!streamHealthy) {
    return { alertsToResolve, zeroCampaigns: [], zeroAdGroups: [], skippedReason: "AMS_STREAM_QUIET" };
  }

  // Guard against evaluating a target hour whose Marketing Stream batch has barely started arriving
  let profileBaselineImpr = 0;
  let profileActualImpr = 0;
  for (const [ck] of enabledCampMap.entries()) {
    profileBaselineImpr += campBase.get(ck) || 0;
    profileActualImpr += campActual.get(ck) || 0;
  }
  if (profileBaselineImpr >= 500 && profileActualImpr < profileBaselineImpr * MIN_PROFILE_HOUR_COMPLETENESS_RATIO) {
    return { alertsToResolve, zeroCampaigns: [], zeroAdGroups: [], skippedReason: "TARGET_HOUR_STREAM_INCOMPLETE" };
  }

  const zeroCampaigns = [];
  const deadCampaignKeys = new Set();

  for (const [ck, camp] of enabledCampMap.entries()) {
    if (camp.startDate && camp.startDate > slot.reportDate) continue;
    const avgImpr = campBase.get(ck) || 0;
    const actualImpr = campActual.get(ck) || 0;
    if (avgImpr >= minBaselineImpressions && actualImpr === 0) {
      deadCampaignKeys.add(ck);
      if (recentlyDismissedKeys.has(`CAMPAIGN:${ck}`)) continue;
      const t = camp7d.get(ck) || { sales7d: 0, impressions7d: 0, spend7d: 0 };
      zeroCampaigns.push({
        ...camp,
        entityLevel: "CAMPAIGN",
        baseline: {
          avgHourlyImpressions: Math.round(avgImpr),
          sales7d: Math.round(t.sales7d * 100) / 100,
          impressions7d: Math.round(t.impressions7d),
          spend7d: Math.round(t.spend7d * 100) / 100,
        },
      });
    }
  }

  // Only inspect individual Ad Groups when parent campaign is still serving (> 0)
  const zeroAdGroups = [];
  for (const [ak, ag] of enabledAgMap.entries()) {
    const ck = `${ag.adType}:${Number(ag.campaignId)}`;
    if (deadCampaignKeys.has(ck)) continue;
    const camp = enabledCampMap.get(ck);
    if (!camp || (camp.startDate && camp.startDate > slot.reportDate)) continue;
    const avgImpr = agBase.get(ak) || 0;
    const actualImpr = agActual.get(ak) || 0;
    if (avgImpr >= minBaselineImpressions && actualImpr === 0) {
      if (recentlyDismissedKeys.has(`AD_GROUP:${ak}`)) continue;
      const t = ag7d.get(ak) || { sales7d: 0, impressions7d: 0, spend7d: 0 };
      zeroAdGroups.push({
        ...ag,
        campaignName: camp.name || ag.campaignName || "",
        endDate: camp.endDate || null,
        portfolioId: camp.portfolioId || null,
        entityLevel: "AD_GROUP",
        baseline: {
          avgHourlyImpressions: Math.round(avgImpr),
          sales7d: Math.round(t.sales7d * 100) / 100,
          impressions7d: Math.round(t.impressions7d),
          spend7d: Math.round(t.spend7d * 100) / 100,
        },
      });
    }
  }

  return { alertsToResolve, zeroCampaigns, zeroAdGroups, skippedReason: null };
}

async function latestSnapshotDate(model, configId, profileId) {
  const doc = await model.findOne({ configId, profileId, reportDate: { $ne: null } }).sort({ reportDate: -1 }).select("reportDate").lean();
  return doc?.reportDate || null;
}

async function checkProfileStreamHealth({ configId, profileId, slot, now }) {
  const activeSub = await amsSubscriptionSchema.exists({
    configId,
    profileId,
    dataset: { $in: ["sp-traffic", "sb-traffic", "sd-traffic"] },
    status: "ACTIVE",
  });
  if (!activeSub) return { healthy: false, reason: "NO_ACTIVE_AMS_SUBSCRIPTION" };

  const recentThreshold = new Date(now.getTime() - STREAM_HEALTH_WINDOW_MINUTES * 60 * 1000);
  const [recentStreamCamp, recentHourlyRow] = await Promise.all([
    Promise.all([
      campaignSchema.exists({ configId, profileId, "streaming.lastSyncAt": { $gte: recentThreshold } }),
      sbCampaignSchema.exists({ configId, profileId, "streaming.lastSyncAt": { $gte: recentThreshold } }),
      sdCampaignSchema.exists({ configId, profileId, "streaming.lastSyncAt": { $gte: recentThreshold } }),
    ]).then((hits) => hits.some(Boolean)),
    keywordsHourlyPerformanceSchema.exists({
      configId,
      profileId,
      reportDate: { $in: [slot.reportDate, slot.currentDate] },
      impressions: { $gt: 0 },
      startTime: { $regex: `^(${slot.hourPrefix}|${slot.currentHourPrefix}):` },
    }),
  ]);
  if (recentStreamCamp || recentHourlyRow) return { healthy: true };
  return { healthy: false, reason: "AMS_STREAM_QUIET" };
}

async function loadEnabledEntities(configId, profileId) {
  const enabledCampaigns = [];
  const enabledAdGroups = [];

  await Promise.all(
    Object.entries(AD_TYPE_MODELS).map(async ([adType, m]) => {
      const [campDate, agDate] = await Promise.all([
        latestSnapshotDate(m.campaign, configId, profileId),
        latestSnapshotDate(m.adGroup, configId, profileId),
      ]);
      const [camps, ags] = await Promise.all([
        campDate
          ? m.campaign
              .find({ configId, profileId, reportDate: campDate, status: { $in: ["ENABLED", "enabled"] } })
              .select("campaignId name status startDate endDate portfolioId budgetTracking")
              .lean()
          : [],
        agDate
          ? m.adGroup
              .find({ configId, profileId, reportDate: agDate, status: { $in: ["ENABLED", "enabled"] } })
              .select("campaignId adGroupId name status")
              .lean()
          : [],
      ]);
      for (const c of camps) enabledCampaigns.push({ ...c, adType });
      for (const g of ags) enabledAdGroups.push({ ...g, adType });
    })
  );

  return { enabledCampaigns, enabledAdGroups };
}

async function checkLocalRuleAndTargetPause({ configId, profileId, adType, campaignId, adGroupId, now }) {
  const models = AD_TYPE_MODELS[adType];
  if (!models) return { allTargetsPaused: false };

  let enabledCount = 0;
  let pausedCount = 0;
  for (const tModel of models.target) {
    const latest = await latestSnapshotDate(tModel, configId, profileId);
    if (!latest) continue;
    const base = { configId, profileId, reportDate: latest, campaignId: Number(campaignId), ...(adGroupId ? { adGroupId: Number(adGroupId) } : {}) };
    const [eCount, pCount] = await Promise.all([
      tModel.countDocuments({ ...base, status: { $in: ["ENABLED", "enabled"] } }),
      tModel.countDocuments({ ...base, status: { $in: ["PAUSED", "paused"] } }),
    ]);
    enabledCount += eCount;
    pausedCount += pCount;
  }

  if (enabledCount > 0 || pausedCount === 0) return { allTargetsPaused: false };

  // Find latest targeting rule run within last 6 hours that affected this profile
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600 * 1000);
  const recentRule = await targetingRuleHistorySchema
    .findOne({ configId, profileId, createdAt: { $gte: sixHoursAgo }, status: { $nin: ["FAILED", "ERROR"] } })
    .sort({ createdAt: -1 })
    .select("ruleId ruleName remark")
    .lean();

  return {
    allTargetsPaused: true,
    pausedCount,
    ruleId: recentRule?.ruleId ? String(recentRule.ruleId) : null,
    ruleName: recentRule?.ruleName || null,
  };
}

async function loadCampaignAsinsAndSkus({ configId, profileId, adType, campaignId, adGroupId }) {
  const adModel = AD_TYPE_MODELS[adType]?.productAd;
  if (!adModel) return [];
  const latest = await latestSnapshotDate(adModel, configId, profileId);
  if (!latest) return [];
  const docs = await adModel
    .find({
      configId,
      profileId,
      reportDate: latest,
      campaignId: Number(campaignId),
      ...(adGroupId ? { adGroupId: Number(adGroupId) } : {}),
      asins: { $nin: [null, ""] },
    })
    .select("asins sku adGroupId status")
    .lean();
  const enabledDocs = docs.filter((d) => String(d.status || "").toUpperCase() === "ENABLED");
  return enabledDocs.length ? enabledDocs : docs;
}

async function fetchSlotHourlyData({ configId, profileId, slot, deps }) {
  return deps.queryHourlyStats
    ? await deps.queryHourlyStats({ configId, profileId, slot })
    : await Promise.all([
        keywordsHourlyPerformanceSchema.aggregate([
          {
            $match: {
              configId,
              profileId,
              reportDate: slot.reportDate,
              startTime: { $regex: `^${slot.hourPrefix}:` },
            },
          },
          {
            $group: {
              _id: { type: "$type", campaignId: "$campaignId", adGroupId: "$adGroupId" },
              impressions: { $sum: { $ifNull: ["$impressions", 0] } },
            },
          },
          { $project: { _id: 0, adType: "$_id.type", campaignId: "$_id.campaignId", adGroupId: "$_id.adGroupId", impressions: 1 } },
        ]),
        keywordsHourlyPerformanceSchema.aggregate([
          {
            $match: {
              configId,
              profileId,
              reportDate: { $gte: slot.baselineFrom, $lte: slot.baselineTo },
              startTime: { $regex: `^${slot.hourPrefix}:` },
            },
          },
          {
            $group: {
              _id: { type: "$type", campaignId: "$campaignId", adGroupId: "$adGroupId", reportDate: "$reportDate" },
              impressions: { $sum: { $ifNull: ["$impressions", 0] } },
            },
          },
          {
            $group: {
              _id: { type: "$_id.type", campaignId: "$_id.campaignId", adGroupId: "$_id.adGroupId" },
              totalImpressions: { $sum: "$impressions" },
            },
          },
          {
            $project: {
              _id: 0,
              adType: "$_id.type",
              campaignId: "$_id.campaignId",
              adGroupId: "$_id.adGroupId",
              avgHourlyImpressions: { $divide: ["$totalImpressions", BASELINE_DAYS] },
            },
          },
        ]),
        keywordsHourlyPerformanceSchema.aggregate([
          {
            $match: {
              configId,
              profileId,
              reportDate: { $gte: slot.baselineFrom, $lte: slot.baselineTo },
            },
          },
          {
            $group: {
              _id: { type: "$type", campaignId: "$campaignId", adGroupId: "$adGroupId" },
              sales: { $sum: { $ifNull: ["$sales", 0] } },
              impressions: { $sum: { $ifNull: ["$impressions", 0] } },
              spend: { $sum: { $ifNull: ["$spends", 0] } },
            },
          },
          { $project: { _id: 0, adType: "$_id.type", campaignId: "$_id.campaignId", adGroupId: "$_id.adGroupId", sales: 1, impressions: 1, spend: 1 } },
        ]),
        keywordsHourlyPerformanceSchema.aggregate([
          {
            $match: {
              configId,
              profileId,
              reportDate: slot.prevReportDate,
              startTime: { $regex: `^${slot.prevHourPrefix}:` },
            },
          },
          {
            $group: {
              _id: { type: "$type", campaignId: "$campaignId", adGroupId: "$adGroupId" },
              impressions: { $sum: { $ifNull: ["$impressions", 0] } },
            },
          },
          { $project: { _id: 0, adType: "$_id.type", campaignId: "$_id.campaignId", adGroupId: "$_id.adGroupId", impressions: 1 } },
        ]),
      ]);
}

function buildPositiveEntitySet(hourlyActuals = []) {
  const positive = new Set();
  for (const row of hourlyActuals) {
    const type = String(row.adType || row.type || "").toUpperCase();
    const cId = Number(row.campaignId);
    const agId = row.adGroupId != null ? Number(row.adGroupId) : null;
    const impr = Number(row.impressions || 0);
    if (!type || !Number.isFinite(cId) || impr <= 0) continue;
    positive.add(`CAMPAIGN:${type}:${cId}`);
    if (Number.isFinite(agId)) positive.add(`AD_GROUP:${type}:${cId}:${agId}`);
  }
  return positive;
}

/**
 * Full hourly blackout evaluation entry point for a single Amazon profile.
 */
async function evaluateProfileBlackouts({ configId, profileId, scheduledFor = new Date(), dryRun = false, deps = {} } = {}) {
  const objConfigId = toObjectId(configId);
  const numProfileId = Number(profileId);
  const now = new Date(scheduledFor);

  const profile = deps.getProfile ? await deps.getProfile(objConfigId, numProfileId) : await getProfile(objConfigId, numProfileId);
  if (!profile) return { skipped: true, reason: "PROFILE_NOT_FOUND" };

  const tz = profile.timezone || "UTC";
  let slot = getTargetHourSlot(now, tz, 1);
  const streamCheck = deps.checkStreamHealth
    ? await deps.checkStreamHealth({ configId: objConfigId, profileId: numProfileId, slot, now })
    : await checkProfileStreamHealth({ configId: objConfigId, profileId: numProfileId, slot, now });

  const [{ enabledCampaigns, enabledAdGroups }, initialActiveAlerts, dismissedRecent] = await Promise.all([
    deps.loadEnabledEntities ? deps.loadEnabledEntities(objConfigId, numProfileId) : loadEnabledEntities(objConfigId, numProfileId),
    adBlackoutAlertSchema.find({ configId: objConfigId, profileId: numProfileId, status: "ACTIVE" }).lean(),
    adBlackoutAlertSchema
      .find({
        configId: objConfigId,
        profileId: numProfileId,
        status: "DISMISSED",
        dismissedAt: { $gte: new Date(now.getTime() - 12 * 3600 * 1000) },
      })
      .select("entityLevel adType campaignId adGroupId dismissedAt")
      .lean(),
  ]);

  let activeAlerts = initialActiveAlerts;
  const recentlyDismissedKeys = new Set(
    dismissedRecent.map((d) =>
      d.entityLevel === "CAMPAIGN"
        ? `CAMPAIGN:${d.adType}:${Number(d.campaignId)}`
        : `AD_GROUP:${d.adType}:${Number(d.campaignId)}:${Number(d.adGroupId)}`
    )
  );

  // Resolve any existing ACTIVE alert that later received impressions in its firstBlackoutHour..currentDate
  if (!dryRun && activeAlerts.length && !deps.queryHourlyStats) {
    const resolvedByLateTraffic = [];
    for (const alert of activeAlerts) {
      const [firstDate, firstTime] = String(alert.firstBlackoutHour || "").split(" ");
      if (!firstDate || !firstTime) continue;
      const hadLateImpr = await keywordsHourlyPerformanceSchema.exists({
        configId: objConfigId,
        profileId: numProfileId,
        type: alert.adType,
        campaignId: Number(alert.campaignId),
        ...(alert.entityLevel === "AD_GROUP" && alert.adGroupId != null ? { adGroupId: Number(alert.adGroupId) } : {}),
        impressions: { $gt: 0 },
        $or: [
          { reportDate: firstDate, startTime: { $gte: `${firstTime.slice(0, 2)}:00` } },
          { reportDate: { $gt: firstDate, $lte: slot.currentDate } },
        ],
      });
      if (hadLateImpr) resolvedByLateTraffic.push(alert);
    }
    if (resolvedByLateTraffic.length) {
      const resolvedIds = new Set(resolvedByLateTraffic.map((a) => String(a._id)));
      await adBlackoutAlertSchema.updateMany(
        { _id: { $in: resolvedByLateTraffic.map((a) => a._id) }, status: "ACTIVE" },
        { $set: { status: "RESOLVED", resolvedAt: now, lastCheckedHour: slot.hourKey } }
      );
      activeAlerts = activeAlerts.filter((a) => !resolvedIds.has(String(a._id)));
    }
  }

  let [hourlyActuals, hourlyBaselines, totals7d, prevHourActuals] = await fetchSlotHourlyData({
    configId: objConfigId,
    profileId: numProfileId,
    slot,
    deps,
  });

  let evalResult = evaluateZeroImpressionEntities({
    slot,
    streamHealthy: streamCheck.healthy,
    enabledCampaigns,
    enabledAdGroups,
    hourlyActuals,
    hourlyBaselines,
    totals7d,
    activeAlerts,
    recentlyDismissedKeys,
  });

  let resolvedCount = 0;
  // Auto-resolve active alerts whose traffic returned or entity was paused on the latest slot
  if (!dryRun && evalResult.alertsToResolve.length) {
    const resolvedIds = new Set(evalResult.alertsToResolve.map((a) => String(a._id)));
    await adBlackoutAlertSchema.updateMany(
      { _id: { $in: evalResult.alertsToResolve.map((a) => a._id) }, status: "ACTIVE" },
      { $set: { status: "RESOLVED", resolvedAt: now, lastCheckedHour: slot.hourKey } }
    );
    resolvedCount += evalResult.alertsToResolve.length;
    activeAlerts = activeAlerts.filter((a) => !resolvedIds.has(String(a._id)));
  }

  // If the most recent hour (now - 1h) stream batch hasn't finished arriving yet, fall back once to (now - 2h)
  // while ignoring entities that already showed impressions in the partial (now - 1h) stream.
  let recoveredInNewerPartialHour = new Set();
  if (evalResult.skippedReason === "TARGET_HOUR_STREAM_INCOMPLETE") {
    recoveredInNewerPartialHour = buildPositiveEntitySet(hourlyActuals);
    const prevSlot = getTargetHourSlot(now, tz, 2);
    const [prevActuals, prevBaselines, prevTotals7d, prev2Actuals] = await fetchSlotHourlyData({
      configId: objConfigId,
      profileId: numProfileId,
      slot: prevSlot,
      deps,
    });
    const prevEval = evaluateZeroImpressionEntities({
      slot: prevSlot,
      streamHealthy: streamCheck.healthy,
      enabledCampaigns,
      enabledAdGroups,
      hourlyActuals: prevActuals,
      hourlyBaselines: prevBaselines,
      totals7d: prevTotals7d,
      activeAlerts,
      recentlyDismissedKeys,
    });
    if (!prevEval.skippedReason) {
      slot = prevSlot;
      hourlyActuals = prevActuals;
      hourlyBaselines = prevBaselines;
      totals7d = prevTotals7d;
      prevHourActuals = prev2Actuals;
      evalResult = prevEval;
      if (!dryRun && evalResult.alertsToResolve.length) {
        await adBlackoutAlertSchema.updateMany(
          { _id: { $in: evalResult.alertsToResolve.map((a) => a._id) }, status: "ACTIVE" },
          { $set: { status: "RESOLVED", resolvedAt: now, lastCheckedHour: slot.hourKey } }
        );
        resolvedCount += evalResult.alertsToResolve.length;
      }
    }
  }

  const prevCampImpr = new Map();
  const prevAgImpr = new Map();
  for (const row of prevHourActuals || []) {
    const type = String(row.adType || row.type || "").toUpperCase();
    const cId = Number(row.campaignId);
    const agId = row.adGroupId != null ? Number(row.adGroupId) : null;
    const impr = Number(row.impressions || 0);
    if (!type || !Number.isFinite(cId)) continue;
    prevCampImpr.set(`${type}:${cId}`, (prevCampImpr.get(`${type}:${cId}`) || 0) + impr);
    if (Number.isFinite(agId)) prevAgImpr.set(`${type}:${cId}:${agId}`, (prevAgImpr.get(`${type}:${cId}:${agId}`) || 0) + impr);
  }

  const filterCandidate = (c) => {
    const key =
      c.entityLevel === "AD_GROUP"
        ? `AD_GROUP:${c.adType}:${Number(c.campaignId)}:${Number(c.adGroupId)}`
        : `CAMPAIGN:${c.adType}:${Number(c.campaignId)}`;
    return !recoveredInNewerPartialHour.has(key);
  };
  const zeroCampaigns = evalResult.zeroCampaigns.filter(filterCandidate);
  const zeroAdGroups = evalResult.zeroAdGroups.filter(filterCandidate);

  if (dryRun) {
    return {
      dryRun: true,
      slot: slot.hourKey,
      skippedReason: evalResult.skippedReason,
      toResolve: evalResult.alertsToResolve.length,
      zeroCampaigns: zeroCampaigns.length,
      zeroAdGroups: zeroAdGroups.length,
    };
  }

  if (evalResult.skippedReason) {
    return {
      skipped: true,
      reason: evalResult.skippedReason,
      resolvedCount,
      slot: slot.hourKey,
    };
  }

  const candidates = [...zeroCampaigns, ...zeroAdGroups];
  if (!candidates.length) {
    return { status: "COMPLETED", slot: slot.hourKey, activeAlerts: 0, resolvedCount };
  }

  // 2. Load credentials & marketplace config once if we have flagged entities
  const [tokens, spConfig, marketplaceConfig] = await Promise.all([
    deps.getAccessToken ? deps.getAccessToken(objConfigId) : getAccessToken(objConfigId).catch(() => null),
    deps.getSPAccessToken ? deps.getSPAccessToken(objConfigId, numProfileId) : getSPAccessToken(objConfigId, numProfileId).catch(() => null),
    profile.marketplaceStringId ? marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean() : null,
  ]);

  let detectedNew = 0;
  let updatedActive = 0;

  for (const item of candidates) {
    const adDocs = await loadCampaignAsinsAndSkus({
      configId: objConfigId,
      profileId: numProfileId,
      adType: item.adType,
      campaignId: item.campaignId,
      adGroupId: item.entityLevel === "AD_GROUP" ? item.adGroupId : null,
    });
    const localAsins = [...new Set(adDocs.map((d) => String(d.asins || "").trim()).filter(Boolean))];

    const liveAds = deps.fetchLiveAdsDiagnostics
      ? await deps.fetchLiveAdsDiagnostics({ profile, tokens, adType: item.adType, campaignId: item.campaignId, adGroupId: item.adGroupId || null, portfolioId: item.portfolioId })
      : await fetchLiveAdsDiagnostics({ profile, tokens, adType: item.adType, campaignId: item.campaignId, adGroupId: item.adGroupId || null, portfolioId: item.portfolioId });

    const allAsins = liveAds.asins?.length ? [...new Set(liveAds.asins)] : localAsins;
    const [productMetadata, rulePauseInfo, oobToday] = await Promise.all([
      allAsins.length
        ? deps.fetchAdsProductEligibility
          ? deps.fetchAdsProductEligibility(profile, tokens, allAsins)
          : fetchAdsProductEligibility(profile, tokens, allAsins)
        : [],
      checkLocalRuleAndTargetPause({ configId: objConfigId, profileId: numProfileId, adType: item.adType, campaignId: item.campaignId, adGroupId: item.entityLevel === "AD_GROUP" ? item.adGroupId : null, now }),
      campaignOutOfBudgetHistorySchema.exists({
        configId: objConfigId,
        profileId: numProfileId,
        campaignId: Number(item.campaignId),
        reportDate: slot.reportDate,
      }),
    ]);

    const skuForAsin = (targetAsin) =>
      adDocs.find((d) => String(d.asins || "").trim() === targetAsin)?.sku ||
      liveAds.skuByAsin?.[targetAsin] ||
      productMetadata.find((m) => m.asin === targetAsin)?.sku ||
      adDocs[0]?.sku ||
      null;

    let buyBoxInfo = null;
    let listingInfo = null;
    for (const targetAsin of allAsins.slice(0, 3)) {
      const spDiag = deps.fetchSpApiDiagnostics
        ? await deps.fetchSpApiDiagnostics({ profile, spConfig, marketplaceConfig, asin: targetAsin, sku: skuForAsin(targetAsin) })
        : await fetchSpApiDiagnostics({ profile, spConfig, marketplaceConfig, asin: targetAsin, sku: skuForAsin(targetAsin) });
      if (!buyBoxInfo && spDiag.buyBoxInfo) buyBoxInfo = spDiag.buyBoxInfo;
      if (!listingInfo && spDiag.listingInfo) listingInfo = spDiag.listingInfo;
      if (spDiag.buyBoxInfo?.lostBuyBox || spDiag.buyBoxInfo?.unbuyable || spDiag.listingInfo?.suppressed || spDiag.listingInfo?.ineligible) {
        buyBoxInfo = spDiag.buyBoxInfo || buyBoxInfo;
        listingInfo = spDiag.listingInfo || listingInfo;
        break;
      }
    }

    const diagnosis = classifyBlackoutReason({
      campaignName: item.campaignName || item.name || "",
      adGroupName: item.entityLevel === "AD_GROUP" ? item.name || null : null,
      campaignState: liveAds.campaignState,
      adGroupState: liveAds.adGroupState,
      allAdGroupsPaused: Boolean(liveAds.allAdGroupsPaused),
      allProductAdsPaused: Boolean(liveAds.allProductAdsPaused),
      endDate: liveAds.endDate || item.endDate,
      todayDate: slot.currentDate,
      servingSignals: liveAds.servingSignals || [],
      portfolio: liveAds.portfolio,
      creatives: liveAds.creatives || [],
      productMetadata,
      buyBoxInfo,
      listingInfo,
      rulePauseInfo,
      outOfBudget: Boolean(item.budgetTracking?.isOutOfBudget || oobToday),
      asins: allAsins,
    });

    const filter = {
      configId: objConfigId,
      profileId: numProfileId,
      adType: item.adType,
      entityLevel: item.entityLevel,
      campaignId: Number(item.campaignId),
      adGroupId: item.entityLevel === "AD_GROUP" ? Number(item.adGroupId) : null,
      status: "ACTIVE",
    };

    const prevImpr =
      item.entityLevel === "AD_GROUP"
        ? prevAgImpr.get(`${item.adType}:${Number(item.campaignId)}:${Number(item.adGroupId)}`) || 0
        : prevCampImpr.get(`${item.adType}:${Number(item.campaignId)}`) || 0;

    const existing = await adBlackoutAlertSchema.findOne(filter).lean();

    // If Amazon reports the ad is healthy & serving and no fault was found in Buy Box,
    // creatives, listings, rules, portfolio, or budget, require 2 consecutive zero hours
    // before raising an UNKNOWN_SERVING_HALT alert (delete any unconfirmed single-hour one rather than marking it recovered).
    if (diagnosis.reasonCode === "UNKNOWN_SERVING_HALT" && diagnosis.reasonParams?.amazonReportsHealthy && prevImpr > 0) {
      if (existing) {
        await adBlackoutAlertSchema.deleteOne({ _id: existing._id, status: "ACTIVE" });
      }
      continue;
    }
    await adBlackoutAlertSchema.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          detectedAt: now,
          firstBlackoutHour: slot.hourKey,
        },
        $set: {
          campaignName: item.campaignName || item.name || "",
          adGroupName: item.entityLevel === "AD_GROUP" ? item.name || null : null,
          portfolioId: liveAds.portfolioId || item.portfolioId || null,
          lastZeroHour: slot.hourKey,
          lastCheckedHour: slot.hourKey,
          reasonCode: diagnosis.reasonCode,
          reasonParams: diagnosis.reasonParams,
          plainReason: diagnosis.plainReason,
          affectedAsins: allAsins.slice(0, 10),
          baseline: item.baseline,
        },
      },
      { upsert: true, new: true }
    );

    if (existing) updatedActive += 1;
    else detectedNew += 1;
  }

  return {
    status: "COMPLETED",
    slot: slot.hourKey,
    detectedNew,
    updatedActive,
    resolvedCount,
  };
}

module.exports = {
  MIN_BASELINE_HOURLY_IMPRESSIONS,
  BASELINE_DAYS,
  getTargetHourSlot,
  evaluateZeroImpressionEntities,
  evaluateProfileBlackouts,
};
