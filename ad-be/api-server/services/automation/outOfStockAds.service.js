/**
 * Out-of-stock products in running ads — daily job (queue task "out-of-stock-ads").
 *
 * For every active seller / vendor profile with Ads sync on:
 *   1. Running product ads = latest synced SP + SD product ads that are ENABLED, in an ENABLED
 *      campaign (and ENABLED ad group when the ad group is known).
 *   2. Availability of those ASINs from the Amazon Ads product metadata API (works for sellers and
 *      vendors; Seller Central is not needed). If that call fails, the availability stored by the
 *      "Products Meta Listing" sync is used instead.
 *   3. ASINs with availability OUT_OF_STOCK are saved to out_of_stock_ads with every running
 *      campaign they advertise in and their ad spend over the last 7 days. The previous list of the
 *      profile is replaced. The dashboard only reads this collection.
 */
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const pLimit = require("p-limit").default;

const outOfStockAdSchema = require("../../models/outOfStockAd.model");
const productAdsSchema = require("../../models/productAds.model");
const sdProductAdsSchema = require("../../models/sdProductAds.model");
const campaignSchema = require("../../models/campaign.model");
const sdCampaignSchema = require("../../models/sdCampaign.model");
const adGroupSchema = require("../../models/adGroups.model");
const sdAdGroupSchema = require("../../models/sdAdGroups.model");
const productSchema = require("../../models/product.model");
const cronJobHistorySchema = require("../../models/cronJobHistory.model");
const { getActivePlanProfiles, getAccessToken } = require("../../helper/common");
const amazonAxios = require("../../helper/amazonAxios");
const { retryWithBackoff } = require("../../helper/retryHelper");
const { cron_logs } = require("../../../winston/cronAutomation/logger");

const CRON_NAME = "Out Of Stock Ads";
const OUT_OF_STOCK = "OUT_OF_STOCK";
const ELIGIBLE_PROFILE_TYPES = new Set(["seller", "vendor"]);
const METADATA_CHUNK = 100; // ASINs per /product/metadata request (API max page size is 300)
const SPEND_DAYS = 7;
const PROFILE_CONCURRENCY = Number(process.env.OUT_OF_STOCK_ADS_CONCURRENCY) || 3;

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));
const isRunning = (status) => String(status || "").toUpperCase() === "ENABLED";
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

/** Latest reportDate stored for a profile in a collection (the latest listing snapshot). */
async function latestReportDate(model, configId, profileId) {
  const doc = await model.findOne({ configId, profileId, reportDate: { $ne: null } }).sort({ reportDate: -1 }).select("reportDate").lean();
  return doc?.reportDate || null;
}

/** Running product ads of one ad type with their campaign (and ad group) details. */
async function loadRunningAds({ adType, adModel, campaignModel, adGroupModel, configId, profileId }) {
  const adDate = await latestReportDate(adModel, configId, profileId);
  if (!adDate) return [];
  const ads = await adModel
    .find({ configId, profileId, reportDate: adDate, status: "ENABLED", asins: { $nin: [null, ""] } })
    .select("adId adGroupId campaignId campaignName asins sku")
    .lean();
  if (!ads.length) return [];

  const campaignIds = [...new Set(ads.map((a) => a.campaignId))];
  const adGroupIds = [...new Set(ads.map((a) => a.adGroupId).filter(Boolean))];
  const [campaignDate, adGroupDate] = await Promise.all([
    latestReportDate(campaignModel, configId, profileId),
    latestReportDate(adGroupModel, configId, profileId),
  ]);
  const [campaigns, adGroups] = await Promise.all([
    campaignDate
      ? campaignModel
          .find({ configId, profileId, reportDate: campaignDate, campaignId: { $in: campaignIds } })
          .select("campaignId name status targetingType budget budgetType startDate endDate")
          .lean()
      : [],
    adGroupDate && adGroupIds.length
      ? adGroupModel.find({ configId, profileId, reportDate: adGroupDate, adGroupId: { $in: adGroupIds } }).select("adGroupId status").lean()
      : [],
  ]);
  const campaignById = new Map(campaigns.map((c) => [Number(c.campaignId), c]));
  const adGroupStatus = new Map(adGroups.map((g) => [Number(g.adGroupId), g.status]));

  return ads
    .map((ad) => ({ ad, campaign: campaignById.get(Number(ad.campaignId)), adGroupState: adGroupStatus.get(Number(ad.adGroupId)) }))
    .filter(({ campaign, adGroupState }) => campaign && isRunning(campaign.status) && (adGroupState === undefined || isRunning(adGroupState)))
    .map(({ ad, campaign }) => ({
      adType,
      adId: ad.adId,
      adGroupId: ad.adGroupId,
      asin: String(ad.asins).trim(),
      sku: ad.sku || null,
      campaignId: Number(ad.campaignId),
      campaignName: campaign.name || ad.campaignName || null,
      campaignStatus: campaign.status,
      targetingType: campaign.targetingType || null,
      budget: campaign.budget ?? null,
      budgetType: campaign.budgetType || null,
      startDate: campaign.startDate || null,
      endDate: campaign.endDate || null,
    }));
}

/** Ad spend per adId over the last SPEND_DAYS days. */
async function spendByAdId(model, configId, profileId, adIds, timezone) {
  if (!adIds.length) return new Map();
  const to = moment.tz(timezone || "UTC").subtract(1, "day").format("YYYY-MM-DD");
  const from = moment.tz(timezone || "UTC").subtract(SPEND_DAYS, "days").format("YYYY-MM-DD");
  const rows = await model.aggregate([
    { $match: { configId, profileId, adId: { $in: adIds }, reportDate: { $gte: from, $lte: to } } },
    { $group: { _id: "$adId", spend: { $sum: { $ifNull: ["$spend", 0] } } } },
  ]);
  return new Map(rows.map((r) => [Number(r._id), Number(r.spend) || 0]));
}

/** Availability per ASIN from the Amazon Ads product metadata API. Returns null when the API is unavailable. */
async function fetchAvailability(profile, tokens, asins) {
  const byAsin = new Map();
  for (const part of chunk(asins, METADATA_CHUNK)) {
    try {
      const response = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${profile.amazonUrl}/product/metadata`,
          headers: {
            "Amazon-Advertising-API-ClientId": tokens.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            Authorization: `Bearer ${tokens.adsAccessToken}`,
            "Content-Type": "application/json",
          },
          data: { adType: "SP", asins: part, checkItemDetails: true, checkEligibility: true, pageIndex: 0, pageSize: part.length },
          meta: { configId: profile.configId, tokenKey: "adsAccessToken", profileId: profile.profileId, isBackgroundWorker: true },
        })
      );
      for (const item of response?.data?.ProductMetadataList || []) {
        if (item?.asin) {
          byAsin.set(item.asin, { availability: item.availability || null, title: item.title || null, imageUrl: item.imageUrl || null, sku: item.sku || null });
        }
      }
    } catch (error) {
      cron_logs({ message: `[OutOfStockAds] product metadata failed for profile ${profile.profileId}: ${error?.message || error}`, log_type: "error" });
      return null;
    }
  }
  return byAsin;
}

/** Fallback: availability saved by the "Products Meta Listing" sync (latest day). */
async function storedAvailability(configId, profileId, asins) {
  const date = await latestReportDate(productSchema, configId, profileId);
  if (!date) return new Map();
  const docs = await productSchema.find({ configId, profileId, reportDate: date, asin: { $in: asins } }).select("asin availability title imageUrl sku").lean();
  return new Map(docs.map((d) => [d.asin, { availability: d.availability || null, title: d.title || null, imageUrl: d.imageUrl || null, sku: d.sku || null }]));
}

/**
 * Pure: groups running ads by ASIN and keeps the out-of-stock ones.
 * @returns {Array<{asin, sku, title, imageUrl, availability, campaigns, campaignCount, spend7d}>}
 */
function buildOutOfStockList(runningAds, availabilityByAsin, spendByAd = new Map()) {
  const byAsin = new Map();
  for (const ad of runningAds) {
    const meta = availabilityByAsin.get(ad.asin);
    if (!meta || meta.availability !== OUT_OF_STOCK) continue;
    if (!byAsin.has(ad.asin)) {
      byAsin.set(ad.asin, { asin: ad.asin, sku: ad.sku || meta.sku || null, title: meta.title, imageUrl: meta.imageUrl, availability: meta.availability, campaigns: new Map() });
    }
    const entry = byAsin.get(ad.asin);
    const key = `${ad.adType}:${ad.campaignId}`;
    const spend = spendByAd.get(Number(ad.adId)) || 0;
    const existing = entry.campaigns.get(key);
    if (existing) {
      existing.spend7d += spend; // same ASIN in several ad groups of one campaign
    } else {
      entry.campaigns.set(key, {
        campaignId: ad.campaignId,
        campaignName: ad.campaignName,
        adType: ad.adType,
        campaignStatus: ad.campaignStatus,
        targetingType: ad.targetingType,
        budget: ad.budget,
        budgetType: ad.budgetType,
        startDate: ad.startDate,
        endDate: ad.endDate,
        adGroupId: ad.adGroupId,
        adId: ad.adId,
        spend7d: spend,
      });
    }
  }
  return [...byAsin.values()]
    .map((e) => {
      const campaigns = [...e.campaigns.values()]
        .map((c) => ({ ...c, spend7d: Math.round(c.spend7d * 100) / 100 }))
        .sort((a, b) => b.spend7d - a.spend7d);
      const spend7d = Math.round(campaigns.reduce((s, c) => s + c.spend7d, 0) * 100) / 100;
      return { ...e, campaigns, campaignCount: campaigns.length, spend7d };
    })
    .sort((a, b) => b.spend7d - a.spend7d || b.campaignCount - a.campaignCount);
}

async function processProfile(profile) {
  const configId = toObjectId(profile.configId);
  const profileId = Number(profile.profileId);
  const tokens = await getAccessToken(profile.configId);
  if (!tokens?.adsAccessToken) {
    cron_logs({ message: `[OutOfStockAds] ${profile.name || profileId}: Ads account disconnected, skipped.`, log_type: "warn" });
    return { status: "SKIPPED" };
  }

  const [spAds, sdAds] = await Promise.all([
    loadRunningAds({ adType: "SP", adModel: productAdsSchema, campaignModel: campaignSchema, adGroupModel: adGroupSchema, configId, profileId }),
    loadRunningAds({ adType: "SD", adModel: sdProductAdsSchema, campaignModel: sdCampaignSchema, adGroupModel: sdAdGroupSchema, configId, profileId }),
  ]);
  const runningAds = [...spAds, ...sdAds];
  const runId = new mongoose.Types.ObjectId().toString();
  const checkedAt = new Date();

  let list = [];
  let availabilitySource = "ads_api";
  if (runningAds.length) {
    const asins = [...new Set(runningAds.map((a) => a.asin))];
    let availability = await fetchAvailability(profile, tokens, asins);
    if (!availability) {
      availability = await storedAvailability(configId, profileId, asins);
      availabilitySource = "stored";
    }
    const [spSpend, sdSpend] = await Promise.all([
      spendByAdId(productAdsSchema, configId, profileId, spAds.map((a) => a.adId).filter(Boolean), profile.timezone),
      spendByAdId(sdProductAdsSchema, configId, profileId, sdAds.map((a) => a.adId).filter(Boolean), profile.timezone),
    ]);
    list = buildOutOfStockList(runningAds, availability, new Map([...spSpend, ...sdSpend]));
  }

  // Write the new list first, then drop what this run didn't find (no empty window for readers).
  if (list.length) {
    await outOfStockAdSchema.bulkWrite(
      list.map((item) => ({
        updateOne: {
          filter: { configId, profileId, asin: item.asin },
          update: { $set: { ...item, configId, profileId, availabilitySource, runId, checkedAt } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
  await outOfStockAdSchema.deleteMany({ configId, profileId, runId: { $ne: runId } });

  cron_logs({ message: `[OutOfStockAds] ${profile.name || profileId}: ${runningAds.length} running ads, ${list.length} out-of-stock products (${availabilitySource}).` });
  return { status: "COMPLETED", count: list.length };
}

/** Queue entry point. Optional { profileId, configId } limits the run to one profile. */
exports.cronOutOfStockAds = async ({ profileId, configId } = {}) => {
  cron_logs({ message: `[OutOfStockAds] start`, log_type: "info" });
  const profiles = (await getActivePlanProfiles(profileId, "ads", configId)).filter((p) =>
    ELIGIBLE_PROFILE_TYPES.has(String(p.type || "").toLowerCase())
  );
  const limit = pLimit(PROFILE_CONCURRENCY);
  let done = 0;
  await Promise.all(
    profiles.map((profile) =>
      limit(async () => {
        const historyDate = moment.tz(profile.timezone || "UTC").format("YYYY-MM-DD");
        try {
          const result = await processProfile(profile);
          if (result.status === "COMPLETED") done += 1;
          await cronJobHistorySchema.findOneAndUpdate(
            { configId: profile.configId, profileId: profile.profileId, cronName: CRON_NAME, historyDate },
            { $set: { status: result.status === "COMPLETED" ? "COMPLETED" : "FAILED", error: result.status === "COMPLETED" ? null : "Ads account disconnected" } },
            { upsert: true }
          );
        } catch (error) {
          cron_logs({ message: `[OutOfStockAds] ${profile.name || profile.profileId} failed: ${error?.message || error}`, log_type: "error" });
          await cronJobHistorySchema
            .findOneAndUpdate(
              { configId: profile.configId, profileId: profile.profileId, cronName: CRON_NAME, historyDate },
              { $set: { status: "FAILED", error: String(error?.message || error).slice(0, 500) } },
              { upsert: true }
            )
            .catch(() => {});
        }
      })
    )
  );
  cron_logs({ message: `[OutOfStockAds] done: ${done}/${profiles.length} profiles`, log_type: "info" });
  return { profiles: profiles.length, completed: done };
};

exports.CRON_NAME = CRON_NAME;
exports.ELIGIBLE_PROFILE_TYPES = ELIGIBLE_PROFILE_TYPES;
exports.buildOutOfStockList = buildOutOfStockList;
