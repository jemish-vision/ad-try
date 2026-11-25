const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { write_logs } = require("../../winston/utility/logger");
const { getCacheWithLog, setCacheWithLog } = require("../services/redis.service");
const profileSchema = require("../models/profiles.model");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const campaignOutOfBudgetHistorySchema = require("../models/campaignOutOfBudgetHistory.model");
const outOfStockAdSchema = require("../models/outOfStockAd.model");
const asinSnapshotSchema = require("../models/asinSnapshot.model");
const camapignSettingSchema = require("../models/camapignSetting.model");
const spProductSchema = require("../models/product.model");
const pd = require("../services/performanceDecline.service");

const CACHE_TTL_SECONDS = 15 * 60;
const DEFAULT_LIMIT = 6;
const DEFAULT_PAGE = 1;
const MAX_LIMIT = 50;

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);

/** Daily campaign rows summed per campaign for the current and prior windows. */
async function aggregateCampaignWindows(model, base, w) {
  const sumFields = {
    impressions: { $sum: { $ifNull: ["$impressions", 0] } },
    clicks: { $sum: { $ifNull: ["$clicks", 0] } },
    spend: { $sum: { $ifNull: ["$spend", 0] } },
    sales: { $sum: { $ifNull: ["$sales", 0] } },
    orders: { $sum: { $ifNull: ["$orders", 0] } },
  };
  // Index-optimized: match -> sort by reportDate -1 (covered by { configId, profileId, reportDate: -1, ... })
  // Group evaluates isCurrent on the fly without an intermediate $project projection stage.
  const rows = await model
    .aggregate([
      { $match: { ...base, reportDate: { $gte: w.prior.start, $lte: w.current.end } } },
      { $sort: { reportDate: -1 } },
      {
        $group: {
          _id: { campaignId: "$campaignId", isCurrent: { $gte: ["$reportDate", w.current.start] } },
          name: { $first: "$name" },
          status: { $first: "$status" },
          budget: { $first: "$budget" },
          budgetType: { $first: "$budgetType" },
          targetingType: { $first: "$targetingType" },
          startDate: { $first: "$startDate" },
          endDate: { $first: "$endDate" },
          // Missing / 0 means Amazon didn't report it for that day.
          timeInBudget: { $avg: { $cond: [{ $and: [{ $gt: ["$timeInBudget", 0] }, { $lte: ["$timeInBudget", 100] }] }, "$timeInBudget", null] } },
          ...sumFields,
        },
      },
    ])
    .allowDiskUse(true);

  const byCampaign = new Map();
  for (const r of rows) {
    const id = r._id.campaignId;
    if (id === null || id === undefined) continue;
    if (!byCampaign.has(id)) byCampaign.set(id, { campaignId: id, current: null, prior: null, info: {} });
    const entry = byCampaign.get(id);
    const totals = { impressions: r.impressions, clicks: r.clicks, spend: r.spend, sales: r.sales, orders: r.orders, timeInBudget: r.timeInBudget };
    if (r._id.isCurrent) {
      entry.current = totals;
      entry.info = { name: r.name, status: r.status, budget: r.budget, budgetType: r.budgetType, targetingType: r.targetingType, startDate: r.startDate, endDate: r.endDate };
    } else {
      entry.prior = totals;
      if (!entry.info.name) entry.info = { name: r.name, status: r.status, budget: r.budget, budgetType: r.budgetType, targetingType: r.targetingType, startDate: r.startDate, endDate: r.endDate };
    }
  }
  return [...byCampaign.values()];
}

/** Each campaign's most-advertised ASIN (by spend over both windows), plus all its ASINs. */
async function campaignAsins(model, base, campaignIds, w) {
  if (!model || !campaignIds.length) return new Map();
  const rows = await model
    .aggregate([
      { $match: { ...base, campaignId: { $in: campaignIds }, reportDate: { $gte: w.prior.start, $lte: w.current.end }, asins: { $nin: [null, ""] } } },
      { $group: { _id: { campaignId: "$campaignId", asin: "$asins" }, sku: { $last: "$sku" }, spend: { $sum: { $ifNull: ["$spend", 0] } } } },
      { $sort: { spend: -1 } },
    ])
    .allowDiskUse(true);
  const out = new Map();
  for (const r of rows) {
    const id = r._id.campaignId;
    if (!out.has(id)) out.set(id, { main: { asin: String(r._id.asin).trim(), sku: r.sku || null }, asins: [] });
    out.get(id).asins.push(String(r._id.asin).trim());
  }
  return out;
}

/** Wasted search-term spend per campaign (current window): 0 orders and spend >= each campaign's limit. */
async function wastedSearchTerms(model, base, limits, w) {
  const ids = [...limits.keys()];
  if (!model || !ids.length) return new Map();
  const rows = await model
    .aggregate([
      { $match: { ...base, campaignId: { $in: ids }, reportDate: { $gte: w.current.start, $lte: w.current.end }, spend: { $gt: 0 } } },
      { $group: { _id: { campaignId: "$campaignId", searchTerm: "$searchTerm" }, spend: { $sum: { $ifNull: ["$spend", 0] } }, orders: { $sum: { $ifNull: ["$orders", 0] } } } },
      { $match: { orders: 0 } },
      { $sort: { spend: -1 } },
    ])
    .allowDiskUse(true);
  const out = new Map();
  for (const r of rows) {
    const id = r._id.campaignId;
    const limit = limits.get(id);
    if (!r._id.searchTerm || !(limit > 0) || r.spend < limit) continue;
    if (!out.has(id)) out.set(id, { terms: 0, spend: 0, topTerm: r._id.searchTerm, topSpend: r.spend, limit });
    const e = out.get(id);
    e.terms += 1;
    e.spend += r.spend;
  }
  for (const e of out.values()) {
    e.spend = Math.round(e.spend * 100) / 100;
    e.topSpend = Math.round(e.topSpend * 100) / 100;
  }
  return out;
}

/** Average time in budget and days out of budget, per campaign, from the out-of-budget history. */
async function budgetHistory(configId, profileId, campaignIds, w) {
  if (!campaignIds.length) return new Map();
  const rows = await campaignOutOfBudgetHistorySchema.aggregate([
    { $match: { configId, profileId, campaignId: { $in: campaignIds }, date: { $gte: w.current.start, $lte: w.current.end } } },
    {
      $group: {
        _id: "$campaignId",
        outOfBudgetDays: { $sum: { $cond: [{ $eq: ["$outOfBudget", true] }, 1, 0] } },
        timeInBudget: { $avg: { $cond: [{ $and: [{ $gt: ["$timeInBudget", 0] }, { $lte: ["$timeInBudget", 100] }] }, "$timeInBudget", null] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

/** Computes all declining campaigns and their root causes for a profile across the windows. */
async function computeAllPerformanceDeclineAlerts({ configId, profileId, adTypes, modelsByType, windowDays, customRange = null, timezone, now }) {
  const w = pd.buildEvaluationWindows(windowDays, timezone, now, customRange);
  const base = { configId, profileId };

  // 1. Campaign totals per window (per ad type) and target ACoS setting in parallel
  const [perType, setting] = await Promise.all([
    Promise.all(
      adTypes.map(async (adType) => {
        const models = modelsByType[adType] || {};
        if (!models.adTypeCampaignSchema) return [];
        const list = await aggregateCampaignWindows(models.adTypeCampaignSchema, base, w);
        return list.map((c) => ({ ...c, adType }));
      }),
    ),
    camapignSettingSchema.findOne({ configId, profileId }).select("targetAcos").lean().catch(() => null),
  ]);

  const targetAcos = Number(setting?.targetAcos) > 0 ? Number(setting.targetAcos) : null;

  // 2. Filter campaigns with enough volume and compute metric deltas
  const candidates = perType
    .flat()
    .filter((c) => c.prior && pd.hasEnoughVolume(c.prior))
    .map((c) => ({ ...c, metrics: pd.compareMetrics(c.current || {}, c.prior) }));

  const allIds = candidates.map((c) => c.campaignId);
  const budget = await budgetHistory(configId, profileId, allIds, w);

  // 3. Classify pattern per campaign
  const flagged = [];
  for (const c of candidates) {
    const hist = budget.get(c.campaignId);
    const timeInBudget = hist?.timeInBudget ?? c.current?.timeInBudget ?? null;
    const pattern = pd.classifyPattern(c.metrics, { timeInBudget, targetAcos });
    if (!pattern) continue;
    flagged.push({ ...c, pattern, timeInBudget, outOfBudgetDays: hist?.outOfBudgetDays ?? null });
  }

  if (!flagged.length) {
    return {
      windowDays: w.windowDays,
      evaluationWindow: { current: w.current, prior: w.prior, bufferedDays: w.bufferedDays, isCustom: Boolean(w.isCustom) },
      summary: pd.summarize([]),
      allAlerts: [],
      targetAcos,
    };
  }

  // 4. Evidence collection for flagged campaigns only
  const flaggedIds = flagged.map((c) => c.campaignId);
  const idsByType = flagged.reduce((acc, c) => ({ ...acc, [c.adType]: [...(acc[c.adType] || []), c.campaignId] }), {});
  const historyFrom = moment.tz(w.current.start, timezone || "UTC").subtract(pd.THRESHOLDS.HISTORY_LOOKBACK_DAYS, "days").startOf("day").toDate();
  const historyTo = moment.tz(w.current.end, timezone || "UTC").endOf("day").toDate();

  const [changeRows, oosRows, asinMaps, wasteMaps] = await Promise.all([
    campaignChangeHistorySchema
      .find({ configId, profileId, changeLevel: { $in: flaggedIds }, createdAt: { $gte: historyFrom, $lte: historyTo } })
      .select("changeLevel changeType oldValue newValue targeting createdAt")
      .lean(),
    outOfStockAdSchema
      .find({ configId, profileId, "campaigns.campaignId": { $in: flaggedIds } })
      .select("asin sku title imageUrl availability campaigns.campaignId checkedAt")
      .lean(),
    Promise.all(Object.entries(idsByType).map(([t, ids]) => campaignAsins(modelsByType[t]?.adTypeProductAdsSchema, base, ids, w))),
    Promise.all(
      Object.entries(idsByType).map(([t, ids]) => {
        // Optimization: Wasted search terms are only relevant for BLEEDING_AD campaigns
        const bleeding = flagged.filter((c) => c.adType === t && ids.includes(c.campaignId) && c.pattern === "BLEEDING_AD");
        if (!bleeding.length) return new Map();
        const limits = new Map(bleeding.map((c) => [c.campaignId, pd.wasteSpendLimit(c.metrics)]));
        return wastedSearchTerms(modelsByType[t]?.adTypeSearchTermSchema, base, limits, w);
      }),
    ),
  ]);

  const changesByCampaign = new Map();
  for (const r of changeRows) {
    const id = Number(r.changeLevel);
    if (!changesByCampaign.has(id)) changesByCampaign.set(id, []);
    changesByCampaign.get(id).push(r);
  }
  const oosByCampaign = new Map();
  for (const r of oosRows) {
    if (String(r.availability || "").toUpperCase() !== "OUT_OF_STOCK") continue;
    for (const c of r.campaigns || []) {
      if (!oosByCampaign.has(c.campaignId)) oosByCampaign.set(c.campaignId, { asin: r.asin, sku: r.sku, title: r.title, imageUrl: r.imageUrl, checkedAt: r.checkedAt });
    }
  }
  const asinByCampaign = new Map(asinMaps.flatMap((m) => [...m.entries()]));
  const wasteByCampaign = new Map(wasteMaps.flatMap((m) => [...m.entries()]));

  // Price / Buy Box snapshots for every ASIN involved
  const allAsins = [...new Set([...asinByCampaign.values()].flatMap((v) => v.asins))];
  const [ownSnaps, rivalSnaps, productRows] = allAsins.length
    ? await Promise.all([
        asinSnapshotSchema
          .find({ configId, profileId, kind: "OWN", asin: { $in: allAsins }, date: { $gte: w.prior.start, $lte: w.current.end } })
          .select("asin date ourPrice weHaveBuyBox")
          .lean(),
        asinSnapshotSchema
          .find({ configId, profileId, kind: "RIVAL", forAsins: { $in: allAsins }, date: { $gte: w.prior.start, $lte: w.current.end } })
          .select("asin forAsins date price")
          .lean(),
        spProductSchema.aggregate([
          { $match: { configId, profileId, asin: { $in: allAsins } } },
          { $sort: { reportDate: -1 } },
          { $group: { _id: "$asin", title: { $first: "$title" }, imageUrl: { $first: "$imageUrl" }, sku: { $first: "$sku" } } },
        ]),
      ])
    : [[], [], []];

  const ownByAsin = new Map();
  for (const r of ownSnaps) {
    if (!ownByAsin.has(r.asin)) ownByAsin.set(r.asin, []);
    ownByAsin.get(r.asin).push(r);
  }
  const productByAsin = new Map(productRows.map((p) => [p._id, p]));

  // 5. Root cause, loss, output
  const alerts = flagged.map((c) => {
    const asinInfo = asinByCampaign.get(c.campaignId);
    const asins = asinInfo?.asins || [];
    let own = null;
    for (const a of asins) {
      const s = pd.summarizeOwnSnapshots(ownByAsin.get(a) || [], w);
      if (!own) own = { ...s, asin: a };
      if (s.priceRaised || s.buyBoxLost) {
        own = { ...s, asin: a };
        break;
      }
    }
    if (own?.priceRaised) own.priceRaised.asin = own.asin;
    if (own?.buyBoxLost) own.buyBoxLost.asin = own.asin;
    const rivals = asins.length ? pd.summarizeRivalPrices(rivalSnaps.filter((r) => (r.forAsins || []).some((a) => asins.includes(a))), w) : null;
    const waste = wasteByCampaign.get(c.campaignId) || null;
    const changes = pd.summarizeChanges(changesByCampaign.get(Number(c.campaignId)) || []);
    const oos = oosByCampaign.get(c.campaignId) || null;

    const rootCause = pd.explainRootCause(c.pattern, c.metrics, {
      changes,
      own: own || {},
      rivals,
      outOfStock: oos,
      campaignStatus: c.info.status,
      waste,
      budget: { timeInBudget: c.timeInBudget !== null ? Math.round(c.timeInBudget) : null, outOfBudgetDays: c.outOfBudgetDays, windowDays: w.windowDays, budget: c.info.budget ?? null },
    });

    const mainAsin = oos?.asin || own?.priceRaised?.asin || own?.buyBoxLost?.asin || asinInfo?.main?.asin || null;
    const product = mainAsin ? productByAsin.get(mainAsin) || {} : {};
    const meta = pd.PATTERNS[c.pattern];
    return {
      campaignId: c.campaignId,
      campaignName: c.info.name || `Campaign #${c.campaignId}`,
      adType: c.adType,
      campaignStatus: c.info.status || null,
      budget: c.info.budget ?? null,
      budgetType: c.info.budgetType || null,
      targetingType: c.info.targetingType || null,
      startDate: c.info.startDate || null,
      endDate: c.info.endDate || null,
      severity: meta.severity,
      scenarioKey: c.pattern,
      productContext: mainAsin
        ? { asin: mainAsin, sku: oos?.sku || product.sku || asinInfo?.main?.sku || null, title: oos?.title || product.title || null, imageUrl: oos?.imageUrl || product.imageUrl || null }
        : null,
      metrics: c.metrics,
      timeInBudget: c.timeInBudget !== null ? Math.round(c.timeInBudget) : null,
      rootCause,
      wastedSpend: waste?.spend || 0,
      estimatedLoss: pd.estimateLoss(c.metrics, waste?.spend || 0),
    };
  });

  pd.sortAlerts(alerts);
  return {
    windowDays: w.windowDays,
    evaluationWindow: { current: w.current, prior: w.prior, bufferedDays: w.bufferedDays, isCustom: Boolean(w.isCustom) },
    summary: pd.summarize(alerts),
    allAlerts: alerts,
    targetAcos,
  };
}

/** Formats and paginates a computed dataset according to page, limit, and severity */
function paginateAndFilterPayload(fullData, { page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, severity = null } = {}) {
  const normalizedSeverity = severity && ["CRITICAL", "WARNING"].includes(String(severity).toUpperCase())
    ? String(severity).toUpperCase()
    : null;
  const eligibleAlerts = normalizedSeverity
    ? (fullData.allAlerts || []).filter((a) => a.severity === normalizedSeverity)
    : (fullData.allAlerts || []);

  const totalRecords = eligibleAlerts.length;
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * limit;
  const paginatedAlerts = eligibleAlerts.slice(startIndex, startIndex + limit);

  return {
    windowDays: fullData.windowDays,
    evaluationWindow: fullData.evaluationWindow,
    summary: fullData.summary,
    alerts: paginatedAlerts,
    activeSeverity: normalizedSeverity,
    pagination: {
      page: currentPage,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    },
    targetAcos: fullData.targetAcos,
  };
}

/** Build the full payload for one profile (all requested ad types). Exported for tests. */
async function buildPerformanceDeclinePayload({ configId, profileId, adTypes, modelsByType, windowDays, customRange = null, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, severity = null, timezone, now }) {
  const fullData = await computeAllPerformanceDeclineAlerts({ configId, profileId, adTypes, modelsByType, windowDays, customRange, timezone, now });
  return paginateAndFilterPayload(fullData, { page, limit, severity });
}

/**
 * Dashboard: campaigns whose performance fell versus the period before, with the likely cause.
 * Body: { profileId, windowDays: 7 | 14 | 30 (default 14), startDate, endDate, page (default 1), limit (default 6), severity: 'CRITICAL' | 'WARNING' | null, refresh, currencyCode, marketplace }
 * Ad type comes from the adType header (SP / SB / SD / All) via AdTypeModels.
 */
exports.getPerformanceDeclineAlerts = async (req, res) => {
  try {
    const configId = req?.config?.configId;
    const profileId = Number(req.body?.profileId);
    if (!configId || !profileId) return res.status(203).json({ isSuccess: false, message: "Profile Id is required" });

    const windowDays = pd.normalizeWindow(req.body?.windowDays);
    const startDate = req.body?.startDate ? String(req.body.startDate).trim() : null;
    const endDate = req.body?.endDate ? String(req.body.endDate).trim() : null;
    const customRange = startDate && endDate ? { startDate, endDate } : null;

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.body?.limit || req.body?.perPage, 10) || DEFAULT_LIMIT));
    const page = Math.max(1, parseInt(req.body?.page || req.body?.pageNo, 10) || DEFAULT_PAGE);
    const severity = req.body?.severity && ["CRITICAL", "WARNING"].includes(String(req.body.severity).toUpperCase())
      ? String(req.body.severity).toUpperCase()
      : null;
    const adTypes = req.adTypes?.length ? req.adTypes : ["SP"];
    const modelsByType = req.modelsByType || { [adTypes[0]]: req.models || {} };

    if (req.user?.isMockUser || req.isMockTestingUser) {
      const w = pd.buildEvaluationWindows(windowDays, "UTC", new Date(), customRange);
      return res.status(200).json({
        isSuccess: true,
        message: "Performance decline alerts retrieved successfully",
        data: {
          windowDays: w.windowDays,
          evaluationWindow: { current: w.current, prior: w.prior, bufferedDays: w.bufferedDays, isCustom: w.isCustom },
          summary: pd.summarize([]),
          alerts: [],
          activeSeverity: severity,
          pagination: { page: 1, limit, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
          targetAcos: null,
        },
      });
    }

    const profile = await profileSchema.findOne({ configId, profileId }).select("timezone").lean();
    const timezone = profile?.timezone || "UTC";
    const today = moment.tz(timezone).format("YYYY-MM-DD");
    // Shared cache key for the profile + window/custom range + adType + day
    const rangeKey = customRange ? `custom_${startDate}_${endDate}` : `${windowDays}`;
    const cacheKey = `perf_decline_all:${configId}:${profileId}:${adTypes.join("+")}:${rangeKey}:${today}`;

    let fullData = null;
    // refresh: true (the card's refresh button) skips the cached copy and recomputes.
    if (!req.body?.refresh) {
      try {
        const cached = await getCacheWithLog(cacheKey);
        if (cached) fullData = typeof cached === "string" ? JSON.parse(cached) : cached;
      } catch (_) {}
    }

    if (!fullData) {
      fullData = await computeAllPerformanceDeclineAlerts({
        configId: toObjectId(configId),
        profileId,
        adTypes,
        modelsByType,
        windowDays,
        customRange,
        timezone,
      });
      try {
        await setCacheWithLog(cacheKey, JSON.stringify(fullData), CACHE_TTL_SECONDS);
      } catch (_) {}
    }

    const data = paginateAndFilterPayload(fullData, { page, limit, severity });
    return res.status(200).json({ isSuccess: true, message: "Performance decline alerts retrieved successfully", data });
  } catch (err) {
    write_logs?.error?.(`[getPerformanceDeclineAlerts Error] ${err.message}`);
    return res.status(500).json({ isSuccess: false, message: err.message || "Internal server error occurred" });
  }
};

exports.buildPerformanceDeclinePayload = buildPerformanceDeclinePayload;
exports.CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
