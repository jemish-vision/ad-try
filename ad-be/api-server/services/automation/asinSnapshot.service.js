/**
 * Competitor Price History — daily ASIN snapshots (Enterprise feature).
 *
 * Runs hourly from the SP-API queue (task "asin-snapshot"). Each profile is snapshotted once per
 * local day, at or after SNAPSHOT_LOCAL_HOUR in the profile's timezone. A profile is included only if
 *   1. its organization's plan contains the "Competitor Comparison" page (Enterprise; set in Super Admin → Plans),
 *   2. its SELLER_CATALOG sync is COMPLETED.
 *
 * Per profile:
 *   - OWN:   active (BUYABLE) ASINs → getItemOffersBatch (20 ASINs/request) + catalog ranks (20/request)
 *   - RIVAL: rival brand ASINs already collected by the competitor sync (no extra Amazon calls),
 *            top RIVALS_PER_ASIN per own ASIN, stored once per rival per day.
 * Each document expires after the organization's historyRetentionDays (TTL index on expiresAt).
 */
const moment = require("moment-timezone");
const pLimit = require("p-limit").default;

const asinSnapshotSchema = require("../../models/asinSnapshot.model");
const productListingModel = require("../../models/productListing.model");
const competitorModel = require("../../models/competitor.model");
const marketPlaceConfigSchema = require("../../models/marketPlaceConfig.model");
const packagesSchema = require("../../models/packages.model");
const pageSchema = require("../../models/superAdmin/pages.model");
const synchronizeDetailsSchema = require("../../models/synchronizeDetails.model");
const cronJobHistorySchema = require("../../models/cronJobHistory.model");
const { getActivePlanProfiles, getSPAccessToken } = require("../../helper/common");
const amazonAxios = require("../../helper/amazonAxios");
const { retryWithBackoff } = require("../../helper/retryHelper");
const { buildComparison, normalizeCatalog } = require("../../helpers/competitorComparison.helper");
const { SYSTEM_PAGES } = require("../../constants/permissions");
const { cron_logs } = require("../../../winston/cronAutomation/logger");

const CRON_NAME = "ASIN Snapshot";
const SNAPSHOT_LOCAL_HOUR = Number(process.env.ASIN_SNAPSHOT_LOCAL_HOUR) || 6;
const RIVALS_PER_ASIN = 20;
const MAX_OWN_ASINS_PER_PROFILE = Number(process.env.ASIN_SNAPSHOT_MAX_ASINS) || 1000;
const BATCH_SIZE = 20; // getItemOffersBatch and searchCatalogItems both take up to 20
const RETENTION_OPTIONS = Object.freeze([7, 14, 30, 60]);
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Stay inside the SP-API worker lock (30 min): profiles not started within the budget are deferred
// to the next hourly run, where they are still due.
const RUN_BUDGET_MS = Number(process.env.ASIN_SNAPSHOT_RUN_BUDGET_MS) || 25 * 60 * 1000;
const IN_PROGRESS_STALE_MS = 2 * 60 * 60 * 1000;
// getItemOffersBatch allows 0.1 requests/second (one every 10s, burst 1). Pace explicitly: the shared
// Redis rate limiter does not apply per-endpoint limits (see helper/rateLimiter.js), so without this
// the batches go out back-to-back and Amazon answers 429.
const OFFERS_BATCH_INTERVAL_MS = Number(process.env.ASIN_SNAPSHOT_OFFERS_INTERVAL_MS) || 10500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Amazon's own retail seller IDs, to flag "Amazon is selling this ASIN". Unknown marketplaces → null.
const AMAZON_RETAIL_SELLER_IDS = Object.freeze({
  ATVPDKIKX0DER: "ATVPDKIKX0DER", // US
  A2EUQ1WTGCTBG2: "A3DWYIK6Y9EEQB", // CA
  A1AM78C64UM0Y8: "AVDBXBAVVSXLQ", // MX
  A1F83G8C2ARO7P: "A3P5ROKL5A1OLE", // UK
  A1PA6795UKMFR9: "A3JWKAKR8XB7XF", // DE
  A13V1IB3VIYZZH: "A1X6FK5RDHNB96", // FR
  APJ6JRA9NG5V4: "A11IL2PNWYJU7H", // IT
  A1RKKUPIHCS9HS: "A1AT7YVPFBWXBL", // ES
  A1VC38T7YXB528: "AN1VRQENFRJN5", // JP
});

/* ───────────────────────────── pure helpers (unit-tested) ───────────────────────────── */

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const normalizeRetentionDays = (days) => (RETENTION_OPTIONS.includes(Number(days)) ? Number(days) : DEFAULT_RETENTION_DAYS);

const computeExpiresAt = (snapshotAt, retentionDays) => new Date(new Date(snapshotAt).getTime() + normalizeRetentionDays(retentionDays) * DAY_MS);

/** Local date to snapshot for, or null if it isn't time yet / already done today. */
const snapshotDateIfDue = ({ timezone, now = new Date(), alreadySnapshottedDates = [] }) => {
  const local = moment.tz(now, timezone || "UTC");
  if (local.hour() < SNAPSHOT_LOCAL_HOUR) return null;
  const date = local.format("YYYY-MM-DD");
  return alreadySnapshottedDates.includes(date) ? null : date;
};

/** OWN snapshot fields from a getItemOffers payload (same shape as the live comparison page). */
const buildOwnSnapshotFields = ({ offersPayload, ourSellerId, marketplaceId }) => {
  if (!offersPayload) return { hasActiveOffer: null };
  const cmp = buildComparison({ offersPayload, catalogItem: null, ourSellerId, marketplaceId });
  const lowest = (channel) => cmp.summary?.lowestPrices?.find((p) => p.fulfillmentChannel === channel)?.landedPrice ?? null;
  const amazonId = AMAZON_RETAIL_SELLER_IDS[marketplaceId];
  const offers = offersPayload.Offers || [];
  return {
    currency: cmp.currency,
    ourPrice: cmp.ourOffer?.landedPrice ?? null,
    ourFulfillment: cmp.ourOffer?.fulfillment ?? null,
    hasActiveOffer: Boolean(cmp.ourOffer),
    buyBoxPrice: cmp.summary?.buyBoxPrice?.landedPrice ?? cmp.buyBoxOffer?.landedPrice ?? null,
    buyBoxSellerId: cmp.buyBoxOffer?.sellerId ?? null,
    weHaveBuyBox: Boolean(cmp.comparison?.weHaveBuyBox),
    amazonSelling: amazonId ? offers.some((o) => o.SellerId === amazonId) : null,
    lowestFbaPrice: lowest("FBA"),
    lowestFbmPrice: lowest("FBM"),
    offerCount: cmp.summary?.newOfferCount ?? cmp.summary?.totalOfferCount ?? null,
    buyBoxEligibleCount: cmp.summary?.buyBoxEligibleCount ?? null,
  };
};

/**
 * Picks up to `cap` rivals per own ASIN (ranked rivals first by rank, then cheapest) and dedupes
 * rivals that compete with several of our ASINs into one entry with `forAsins`.
 */
const selectRivalsForSnapshot = (competitorDocs, cap = RIVALS_PER_ASIN) => {
  const byOwn = new Map();
  for (const c of competitorDocs) {
    if (!c?.asin || !c?.myAsin || !(Number(c.price) > 0)) continue;
    if (!byOwn.has(c.myAsin)) byOwn.set(c.myAsin, []);
    byOwn.get(c.myAsin).push(c);
  }
  const rankOf = (c) => (Number(c.classificationRanks) > 0 ? Number(c.classificationRanks) : Infinity);
  const rivals = new Map();
  for (const [ownAsin, list] of byOwn) {
    list
      .sort((a, b) => rankOf(a) - rankOf(b) || Number(a.price) - Number(b.price))
      .slice(0, cap)
      .forEach((c) => {
        if (!rivals.has(c.asin)) {
          rivals.set(c.asin, {
            asin: c.asin,
            brand: c.brand || null,
            price: Number(c.price),
            bsr: Number.isFinite(rankOf(c)) ? rankOf(c) : null,
            bsrCategory: typeof c.classification === "string" && isNaN(Number(c.classification)) ? c.classification : null,
            forAsins: new Set(),
          });
        }
        rivals.get(c.asin).forAsins.add(ownAsin);
      });
  }
  return [...rivals.values()].map((r) => ({ ...r, forAsins: [...r.forAsins] }));
};

/* ───────────────────────────── eligibility ───────────────────────────── */

let historyPageIdCache = { id: null, at: 0 };
const getHistoryPageId = async () => {
  if (historyPageIdCache.id && Date.now() - historyPageIdCache.at < 10 * 60 * 1000) return historyPageIdCache.id;
  const page = await pageSchema.findOne({ pageName: SYSTEM_PAGES.COMPETITOR_COMPARISON, isActive: { $ne: false } }).select("_id").lean();
  historyPageIdCache = { id: page?._id || null, at: Date.now() };
  return historyPageIdCache.id;
};

/** True if the plan includes the Competitor Comparison page (configured in Super Admin → Plans). */
const planHasHistoryFeature = async (planId) => {
  if (!planId) return false;
  const pageId = await getHistoryPageId();
  if (!pageId) return false;
  return Boolean(await packagesSchema.exists({ _id: planId, "pages.pageId": pageId }));
};

const sellerCatalogSyncCompleted = async ({ configId, profileId }) =>
  Boolean(
    await synchronizeDetailsSchema.exists({
      groupId: "SELLER_CATALOG",
      type: "seller",
      requestStatus: "COMPLETED",
      profileId: Number(profileId),
      configId,
    })
  );

/* ───────────────────────────── Amazon calls ───────────────────────────── */

const fetchOffersBatch = async ({ asins, marketplaceConfig, token, meta }) => {
  const { endPoint, marketPlaceId } = marketplaceConfig;
  const res = await retryWithBackoff(() =>
    amazonAxios({
      method: "post",
      url: `${endPoint}/batches/products/pricing/v0/itemOffers`,
      headers: { "x-amz-access-token": token, "Content-Type": "application/json" },
      data: {
        requests: asins.map((asin) => ({
          uri: `/products/pricing/v0/items/${asin}/offers`,
          method: "GET",
          MarketplaceId: marketPlaceId,
          ItemCondition: "New",
          CustomerType: "Consumer",
        })),
      },
      meta,
    })
  );
  const map = new Map();
  (res?.data?.responses || []).forEach((r, i) => {
    const payload = r?.body?.payload ?? r?.body;
    const asin = r?.request?.Asin || payload?.ASIN || asins[i];
    if (r?.status?.statusCode === 200 && payload) map.set(asin, payload);
  });
  return map;
};

const fetchRanksBatch = async ({ asins, marketplaceConfig, token, meta }) => {
  const { endPoint, marketPlaceId } = marketplaceConfig;
  const res = await retryWithBackoff(() =>
    amazonAxios({
      method: "get",
      url: `${endPoint}/catalog/2022-04-01/items?marketplaceIds=${marketPlaceId}&identifiers=${asins.join(",")}&identifiersType=ASIN&includedData=salesRanks&pageSize=${BATCH_SIZE}`,
      headers: { "x-amz-access-token": token },
      meta,
    })
  );
  const map = new Map();
  for (const item of res?.data?.items || []) {
    const n = normalizeCatalog(item, marketPlaceId);
    map.set(item.asin, n?.allRanks?.length ? n.allRanks : undefined);
  }
  return map;
};

/* ───────────────────────────── runner ───────────────────────────── */

async function runAsinSnapshotForProfile({ profile, date, now = new Date() }) {
  const configId = profile.configId;
  const profileId = Number(profile.profileId);
  const retentionDays = normalizeRetentionDays(profile.organization?.historyRetentionDays);
  const expiresAt = computeExpiresAt(now, retentionDays);
  const organizationId = profile.organization?._id || null;

  const marketplaceConfig = await marketPlaceConfigSchema.findOne({ marketPlaceId: profile.marketplaceStringId }).lean();
  if (!marketplaceConfig?.endPoint) throw new Error(`Marketplace configuration not found for ${profile.marketplaceStringId}`);

  const spConfig = await getSPAccessToken(configId, profileId);
  if (!spConfig?.spAccessToken) throw new Error("Seller Central account is not connected");
  const meta = { configId, tokenKey: "spAccessToken", sp: true, profileId, isBackgroundWorker: true };

  // Own active ASINs
  const ownAsins = (await productListingModel.distinct("asin", { configId, profileId, status: "BUYABLE" })).filter(Boolean);
  const truncated = ownAsins.length > MAX_OWN_ASINS_PER_PROFILE;
  const asins = ownAsins.slice(0, MAX_OWN_ASINS_PER_PROFILE);

  const offers = new Map();
  const ranks = new Map();
  let failedBatches = 0;
  let lastOffersCallAt = 0;
  for (const group of chunk(asins, BATCH_SIZE)) {
    const waitMs = lastOffersCallAt + OFFERS_BATCH_INTERVAL_MS - Date.now();
    if (lastOffersCallAt && waitMs > 0) await sleep(waitMs);
    lastOffersCallAt = Date.now();
    try {
      for (const [k, v] of await fetchOffersBatch({ asins: group, marketplaceConfig, token: spConfig.spAccessToken, meta })) offers.set(k, v);
    } catch (err) {
      failedBatches++;
      cron_logs({ message: `[${CRON_NAME}] Offers batch failed (profile ${profileId}): ${err.message}`, log_type: "warn" });
    }
    try {
      for (const [k, v] of await fetchRanksBatch({ asins: group, marketplaceConfig, token: spConfig.spAccessToken, meta })) ranks.set(k, v);
    } catch (err) {
      cron_logs({ message: `[${CRON_NAME}] Ranks batch failed (profile ${profileId}): ${err.message}`, log_type: "warn" });
    }
  }

  const base = { organizationId, configId, profileId, date, snapshotAt: now, expiresAt };
  const ownOps = asins.map((asin) => ({
    updateOne: {
      filter: { configId, profileId, kind: "OWN", asin, date },
      update: {
        $set: {
          ...base,
          asin,
          kind: "OWN",
          ...buildOwnSnapshotFields({ offersPayload: offers.get(asin), ourSellerId: spConfig.sellerId, marketplaceId: marketplaceConfig.marketPlaceId }),
          ...(ranks.get(asin) && { ranks: ranks.get(asin) }),
        },
      },
      upsert: true,
    },
  }));

  // Rivals from the competitor sync (no Amazon calls)
  const competitorDocs = asins.length
    ? await competitorModel.find({ configId, profileId, myAsin: { $in: asins } }).select("myAsin asin brand price classification classificationRanks").lean()
    : [];
  const rivalOps = selectRivalsForSnapshot(competitorDocs).map((r) => ({
    updateOne: {
      filter: { configId, profileId, kind: "RIVAL", asin: r.asin, date },
      update: { $set: { ...base, kind: "RIVAL", ...r } },
      upsert: true,
    },
  }));

  if (asins.length && failedBatches === Math.ceil(asins.length / BATCH_SIZE)) {
    // Nothing saved, so the next hourly run retries this profile.
    throw new Error(`All ${failedBatches} offer batch request(s) failed; nothing saved, will retry next run.`);
  }

  for (const ops of chunk([...ownOps, ...rivalOps], 1000)) {
    if (ops.length) await asinSnapshotSchema.bulkWrite(ops, { ordered: false });
  }

  return { ownCount: ownOps.length, rivalCount: rivalOps.length, offersFound: offers.size, truncated, totalActiveAsins: ownAsins.length };
}

/**
 * Hourly entry point (SP-API queue). Snapshots every eligible profile that is due.
 */
async function cronAsinSnapshot({ now = new Date() } = {}) {
  const profiles = await getActivePlanProfiles("ALL", "sp");
  const stats = { profiles: profiles.length, due: 0, notOnPlan: 0, syncIncomplete: 0, notDue: 0, inProgress: 0, deferred: 0, completed: 0, failed: 0 };
  const runStarted = Date.now();
  const limit = pLimit(Number(process.env.ASIN_SNAPSHOT_CONCURRENCY) || 2);

  await Promise.all(
    profiles.map((profile) =>
      limit(async () => {
        const configId = profile.configId;
        const profileId = Number(profile.profileId);
        try {
          if (!(await planHasHistoryFeature(profile.organization?.planId))) {
            stats.notOnPlan++;
            return;
          }
          const tz = profile.timezone || "UTC";
          const todayLocal = moment.tz(now, tz).format("YYYY-MM-DD");
          const done = await asinSnapshotSchema.exists({ configId, profileId, kind: "OWN", date: todayLocal });
          const date = snapshotDateIfDue({ timezone: tz, now, alreadySnapshottedDates: done ? [todayLocal] : [] });
          if (!date) {
            stats.notDue++;
            return;
          }
          if (!(await sellerCatalogSyncCompleted({ configId, profileId }))) {
            stats.syncIncomplete++;
            cron_logs({
              message: `[${CRON_NAME}] Skipped profile ${profile.name || profileId} (${profileId}): SELLER_CATALOG sync is not COMPLETED.`,
              log_type: "warn",
            });
            return;
          }

          // Another (overlapping) run is already snapshotting this profile today
          const running = await cronJobHistorySchema.exists({
            configId,
            profileId,
            cronName: CRON_NAME,
            historyDate: date,
            status: "PENDING",
            updatedAt: { $gte: new Date(Date.now() - IN_PROGRESS_STALE_MS) },
          });
          if (running) {
            stats.inProgress++;
            return;
          }
          if (Date.now() - runStarted > RUN_BUDGET_MS) {
            stats.deferred++;
            return;
          }

          stats.due++;
          const history = await cronJobHistorySchema.findOneAndUpdate(
            { configId, profileId, cronName: CRON_NAME, historyDate: date },
            { $set: { status: "PENDING", error: null, "details.startedAt": new Date().toISOString() } },
            { upsert: true, new: true }
          );
          const started = Date.now();
          try {
            const result = await runAsinSnapshotForProfile({ profile, date, now });
            stats.completed++;
            await cronJobHistorySchema.updateOne(
              { _id: history._id },
              {
                $set: {
                  status: "COMPLETED",
                  recordsCount: result.ownCount + result.rivalCount,
                  durationMs: Date.now() - started,
                  "details.result": result,
                  ...(result.truncated && { message: `Only the first ${MAX_OWN_ASINS_PER_PROFILE} of ${result.totalActiveAsins} active ASINs were snapshotted.` }),
                },
              }
            );
          } catch (err) {
            stats.failed++;
            await cronJobHistorySchema.updateOne(
              { _id: history._id },
              { $set: { status: "FAILED", error: err.message, durationMs: Date.now() - started } }
            );
            cron_logs({ message: `[${CRON_NAME}] Profile ${profileId} failed: ${err.message}`, log_type: "error" });
          }
        } catch (err) {
          stats.failed++;
          cron_logs({ message: `[${CRON_NAME}] Profile ${profileId} error: ${err.message}`, log_type: "error" });
        }
      })
    )
  );

  cron_logs({ message: `[${CRON_NAME}] Run finished: ${JSON.stringify(stats)}`, log_type: "info" });
  return stats;
}

/**
 * Applies a new retention setting to all of an organization's existing snapshots
 * (expiresAt = snapshotAt + days). Documents already past the new expiry are removed by the TTL monitor.
 */
async function applyRetentionToOrganization(organizationId, retentionDays) {
  const days = normalizeRetentionDays(retentionDays);
  return asinSnapshotSchema.updateMany({ organizationId }, [
    { $set: { expiresAt: { $add: ["$snapshotAt", days * DAY_MS] } } },
  ]);
}

module.exports = {
  CRON_NAME,
  RETENTION_OPTIONS,
  DEFAULT_RETENTION_DAYS,
  SNAPSHOT_LOCAL_HOUR,
  RIVALS_PER_ASIN,
  chunk,
  normalizeRetentionDays,
  computeExpiresAt,
  snapshotDateIfDue,
  buildOwnSnapshotFields,
  selectRivalsForSnapshot,
  planHasHistoryFeature,
  runAsinSnapshotForProfile,
  cronAsinSnapshot,
  applyRetentionToOrganization,
};
