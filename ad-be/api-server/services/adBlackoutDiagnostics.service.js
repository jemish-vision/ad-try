const moment = require("moment-timezone");
const amazonAxios = require("../helper/amazonAxios");
const { retryWithBackoff } = require("../helper/retryHelper");
const { getCacheWithLog, setCacheWithLog } = require("./redis.service");
const { fetchPortfolios, fetchSBAdsList, fetchSDCreativesList } = require("../helper/amazonBrandApi");

const SP_OFFER_CACHE_TTL = 180; // 3 minutes, protects SP-API 0.5 req/s quota
const LISTING_CACHE_TTL = 180;
const HEALTHY_SERVING_STATUSES = new Set([
  "CAMPAIGN_STATUS_ENABLED",
  "CAMPAIGN_STATUS_ENABLED_DETAIL",
  "AD_GROUP_STATUS_ENABLED",
  "AD_GROUP_STATUS_ENABLED_DETAIL",
  "AD_STATUS_ENABLED",
  "AD_STATUS_ENABLED_DETAIL",
  "AD_STATUS_LIVE",
  "AD_STATUS_LIVE_DETAIL",
  "TARGET_STATUS_ENABLED",
  "TARGET_STATUS_ENABLED_DETAIL",
  "KEYWORD_STATUS_ENABLED",
  "KEYWORD_STATUS_ENABLED_DETAIL",
  "PORTFOLIO_STATUS_ENABLED",
  "PORTFOLIO_STATUS_ENABLED_DETAIL",
  "ADVERTISER_STATUS_ENABLED",
  "ADVERTISER_STATUS_ENABLED_DETAIL",
  "CAMPAIGN_STATUS_ELIGIBLE",
  "AD_GROUP_STATUS_ELIGIBLE",
  "AD_STATUS_ELIGIBLE",
  "ACCOUNT_ENABLED",
  "ENABLED",
  "DELIVERING",
  "SERVING",
  "ACTIVE",
  "ADVERTISING_ACTIVE",
  "BUY_BOX_ELIGIBLE",
  "AD_POLICING_APPROVED",
  "APPROVED",
  "ELIGIBLE",
]);

const BENIGN_SEVERITIES = new Set(["INFO", "NONE", "OK"]);

function selectEffectiveEntities(entities = []) {
  if (!Array.isArray(entities) || !entities.length) {
    return { active: [], allPaused: false };
  }
  const enabled = entities.filter((e) => String(e?.state || "").toUpperCase() === "ENABLED");
  const hasPaused = entities.some((e) => ["PAUSED", "ARCHIVED"].includes(String(e?.state || "").toUpperCase()));
  return {
    active: enabled.length ? enabled : entities,
    allPaused: !enabled.length && hasPaused,
  };
}

function extractServingStrings(entity) {
  if (!entity || typeof entity !== "object") return [];
  const out = [];
  const ext = entity.extendedData || {};
  for (const candidate of [entity.servingStatus, ext.servingStatus, entity.moderationStatus, ext.moderationStatus]) {
    if (candidate) out.push(String(candidate).toUpperCase());
  }
  const details = ext.servingStatusDetails || entity.servingStatusDetails || [];
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d?.name) out.push(String(d.name).toUpperCase());
      const sev = d?.severity ? String(d.severity).toUpperCase() : "";
      if (sev && !BENIGN_SEVERITIES.has(sev)) out.push(sev);
    }
  }
  const reasons = entity.moderationReasons || ext.moderationReasons || [];
  if (Array.isArray(reasons)) {
    for (const r of reasons) {
      if (typeof r === "string") out.push(r.toUpperCase());
      else if (r?.reason || r?.code) out.push(String(r.reason || r.code).toUpperCase());
    }
  }
  return [...new Set(out)];
}

/**
 * Pure deterministic classifier mapping collected Amazon Ads, SP-API, and internal rule signals
 * into a single plain-language blackout reason.
 */
function normalizeIsoDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function classifyBlackoutReason({
  campaignName = "",
  adGroupName = null,
  campaignState = null,
  adGroupState = null,
  allAdGroupsPaused = false,
  allProductAdsPaused = false,
  endDate = null,
  todayDate = null,
  servingSignals = [],
  portfolio = null,
  creatives = [],
  productMetadata = [],
  buyBoxInfo = null,
  listingInfo = null,
  rulePauseInfo = null,
  outOfBudget = false,
  asins = [],
}) {
  const sigText = servingSignals.join(" ");
  const primaryAsin = buyBoxInfo?.asin || listingInfo?.asin || productMetadata[0]?.asin || asins[0] || null;
  const nonHealthySignals = servingSignals.filter((s) => !HEALTHY_SERVING_STATUSES.has(String(s || "").toUpperCase()));
  const rawServingStatus = nonHealthySignals[0] || null;
  const normalizedEnd = normalizeIsoDate(endDate);
  const normalizedToday = normalizeIsoDate(todayDate);

  // 1. Live Amazon state is actually paused/archived (campaign, adGroup, or all child adGroups/productAds)
  if (
    ["PAUSED", "ARCHIVED"].includes(String(campaignState || "").toUpperCase()) ||
    ["PAUSED", "ARCHIVED"].includes(String(adGroupState || "").toUpperCase()) ||
    allAdGroupsPaused ||
    allProductAdsPaused
  ) {
    const entityLabel = adGroupName || campaignName || "Ad entity";
    const reasonDetail = allProductAdsPaused
      ? `All product ads inside ${entityLabel} are paused or archived on Amazon.`
      : allAdGroupsPaused
      ? `All ad groups inside ${entityLabel} are paused or archived on Amazon.`
      : `${entityLabel} is marked ${String(adGroupState || campaignState).toUpperCase()} on Amazon.`;
    return {
      reasonCode: "CAMPAIGN_OR_ADGROUP_PAUSED",
      reasonParams: { campaignState, adGroupState, allAdGroupsPaused, allProductAdsPaused, rawServingStatus },
      plainReason: reasonDetail,
    };
  }

  // 2. Campaign end date hit
  if (/CAMPAIGN_ENDED|\bENDED\b/.test(sigText) || (normalizedEnd && normalizedToday && normalizedEnd < normalizedToday)) {
    return {
      reasonCode: "CAMPAIGN_END_DATE",
      reasonParams: { endDate: normalizedEnd || normalizedToday, rawServingStatus },
      plainReason: `Campaign reached its scheduled end date${normalizedEnd ? ` (${normalizedEnd})` : ""}.`,
    };
  }

  // 3. Portfolio cap or portfolio ended/paused
  if (/PORTFOLIO_OUT_OF_BUDGET|PORTFOLIO_ENDED|PORTFOLIO_PAUSED|PORTFOLIO_CAP/.test(sigText) ||
      portfolio?.isOutOfBudget ||
      ["PORTFOLIO_OUT_OF_BUDGET", "PORTFOLIO_ENDED", "PORTFOLIO_PAUSED"].includes(String(portfolio?.servingStatus || "").toUpperCase())) {
    const pName = portfolio?.name ? `"${portfolio.name}"` : "Its portfolio";
    return {
      reasonCode: "PORTFOLIO_CAP_HIT",
      reasonParams: { portfolioId: portfolio?.portfolioId || null, portfolioName: portfolio?.name || null, rawServingStatus },
      plainReason: `${pName} hit its budget cap or date limit, stopping all campaigns inside it.`,
    };
  }

  // 4. SB / SD Creative moderation rejection
  const rejectedCreative = creatives.find((c) => {
    const s = [c.moderationStatus, c.servingStatus, ...(c.servingSignals || [])].join(" ").toUpperCase();
    return /REJECT|MODERATION|NOT_APPROVED|DISAPPROVED|POLICY|SUSPENDED/.test(s);
  });
  if (rejectedCreative || /CREATIVE_NOT_APPROVED|AD_POLICING_SUSPENDED|MODERATION|POLICY_VIOLATION/.test(sigText)) {
    const detail = rejectedCreative?.rejectionReason || rejectedCreative?.moderationStatus || rawServingStatus;
    return {
      reasonCode: "CREATIVE_REJECTED",
      reasonParams: { creativeId: rejectedCreative?.creativeId || rejectedCreative?.adId || null, detail, rawServingStatus },
      plainReason: detail
        ? `Creative was rejected or suspended in Amazon review (${detail}).`
        : "Sponsored Brands or Display creative was rejected in Amazon's review.",
    };
  }

  // 5. Buy Box lost to a reseller
  if (buyBoxInfo?.lostBuyBox || /LOST_BUY_BOX|NOT_IN_BUY_BOX|NO_BUY_BOX|MISSING_BUY_BOX|INELIGIBLE_FOR_BUY_BOX/.test(sigText)) {
    return {
      reasonCode: "BUY_BOX_LOST",
      reasonParams: {
        asin: primaryAsin,
        ourPrice: buyBoxInfo?.ourPrice ?? null,
        buyBoxPrice: buyBoxInfo?.buyBoxPrice ?? null,
        rawServingStatus,
      },
      plainReason: primaryAsin
        ? `Product ${primaryAsin} lost the Buy Box to another seller, so Amazon stopped serving its ads.`
        : "Advertised product lost the Buy Box to a reseller, halting ad delivery.",
    };
  }

  // 6. Product unbuyable / out of stock
  const unbuyableMeta = productMetadata.find((m) =>
    /OUT_OF_STOCK|NOT_BUYABLE|UNBUYABLE|NO_INVENTORY|ITEM_MISSING/.test(String(m?.availability || "").toUpperCase())
  );
  if (buyBoxInfo?.unbuyable || unbuyableMeta || /NOT_BUYABLE|ITEM_MISSING|OUT_OF_STOCK|UNBUYABLE/.test(sigText)) {
    const targetAsin = unbuyableMeta?.asin || primaryAsin;
    return {
      reasonCode: "PRODUCT_UNBUYABLE",
      reasonParams: { asin: targetAsin, availability: unbuyableMeta?.availability || null, rawServingStatus },
      plainReason: targetAsin
        ? `Product ${targetAsin} is out of stock or currently unbuyable on Amazon.`
        : "Advertised product is unbuyable or out of stock on Amazon.",
    };
  }

  // 7. Listing suppressed (variation/attribute error or missing BUYABLE/DISCOVERABLE)
  if (listingInfo?.suppressed || /SUPPRESSED|DETAIL_PAGE_NOT_AVAILABLE|MISSING_IMAGE|MISSING_ATTRIBUTE/.test(sigText)) {
    const issueMsg = listingInfo?.issueMessage || null;
    return {
      reasonCode: "LISTING_SUPPRESSED",
      reasonParams: { asin: primaryAsin, sku: listingInfo?.sku || null, issueMessage: issueMsg, rawServingStatus },
      plainReason: issueMsg
        ? `Listing ${primaryAsin || ""} is suppressed: ${issueMsg}`
        : `Product listing${primaryAsin ? ` (${primaryAsin})` : ""} is suppressed or missing required catalog attributes.`,
    };
  }

  // 8. Listing / ASIN ineligible for advertising
  const ineligibleMeta = productMetadata.find((m) =>
    (m?.eligibilityStatus && !/^ELIGIBLE$/i.test(String(m.eligibilityStatus).trim())) ||
    /INELIGIBLE|NOT_ELIGIBLE/.test(String(m?.availability || "").toUpperCase())
  );
  if (ineligibleMeta || listingInfo?.ineligible || /NOT_ELIGIBLE|INELIGIBLE/.test(sigText)) {
    const targetAsin = ineligibleMeta?.asin || primaryAsin;
    const msg = ineligibleMeta?.ineligibilityReason || listingInfo?.issueMessage || null;
    return {
      reasonCode: "LISTING_INELIGIBLE",
      reasonParams: { asin: targetAsin, detail: msg, rawServingStatus },
      plainReason: msg
        ? `Product ${targetAsin || ""} is ineligible for ads: ${msg}`
        : `Product ${targetAsin || ""} was flagged ineligible for advertising on Amazon.`,
    };
  }

  // 9. Rule paused every keyword/target in the campaign or ad group
  if (rulePauseInfo?.allTargetsPaused) {
    return {
      reasonCode: "RULE_PAUSED_ALL_TARGETS",
      reasonParams: {
        ruleId: rulePauseInfo.ruleId || null,
        ruleName: rulePauseInfo.ruleName || null,
        pausedCount: rulePauseInfo.pausedCount || 0,
      },
      plainReason: rulePauseInfo.ruleName
        ? `Automated rule "${rulePauseInfo.ruleName}" paused all active keywords/targets in this ad.`
        : "All active keywords and targets in this ad were paused (no enabled targets remain).",
    };
  }

  // 10. Campaign out of daily budget
  if (outOfBudget || /CAMPAIGN_OUT_OF_BUDGET|OUT_OF_BUDGET/.test(sigText)) {
    return {
      reasonCode: "CAMPAIGN_OUT_OF_BUDGET",
      reasonParams: { rawServingStatus },
      plainReason: "Campaign exhausted its daily budget and stopped serving.",
    };
  }

  // 11. Fallback with non-healthy Amazon serving status if present
  return {
    reasonCode: "UNKNOWN_SERVING_HALT",
    reasonParams: {
      asin: primaryAsin,
      rawServingStatus,
      rawReasons: nonHealthySignals.slice(0, 5),
      amazonReportsHealthy: nonHealthySignals.length === 0 && servingSignals.some((s) => HEALTHY_SERVING_STATUSES.has(s)),
    },
    plainReason: rawServingStatus
      ? `Impressions dropped to zero (Amazon status: ${rawServingStatus}).`
      : "Impressions abruptly dropped to zero despite normally active hourly traffic.",
  };
}

/**
 * Fetches live campaign/adGroup/productAd servingStatus from Amazon Ads API for a single campaign.
 */
async function fetchLiveAdsDiagnostics({ profile, tokens, adType, campaignId, adGroupId = null, portfolioId = null }) {
  if (!tokens?.adsAccessToken || !profile?.amazonUrl) return {};
  const headersBase = {
    "Amazon-Advertising-API-ClientId": tokens.adsClientId,
    "Amazon-Advertising-API-Scope": profile.profileId,
    Authorization: `Bearer ${tokens.adsAccessToken}`,
  };
  const meta = { configId: profile.configId, tokenKey: "adsAccessToken", profileId: profile.profileId, isBackgroundWorker: true };
  const result = {
    campaignState: null,
    adGroupState: null,
    allAdGroupsPaused: false,
    allProductAdsPaused: false,
    endDate: null,
    portfolioId: portfolioId || null,
    servingSignals: [],
    portfolio: null,
    creatives: [],
    asins: [],
    skuByAsin: {},
  };

  try {
    if (adType === "SP") {
      const campRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${profile.amazonUrl}/sp/campaigns/list`,
          headers: { ...headersBase, Accept: "application/vnd.spCampaign.v3+json", "Content-Type": "application/vnd.spCampaign.v3+json" },
          data: { campaignIdFilter: { include: [String(campaignId)] }, includeExtendedDataFields: true, maxResults: 10 },
          meta,
        })
      );
      const c = campRes?.data?.campaigns?.[0];
      if (c) {
        result.campaignState = c.state || null;
        result.endDate = c.endDate || null;
        result.portfolioId = c.portfolioId ? Number(c.portfolioId) : result.portfolioId;
        result.servingSignals.push(...extractServingStrings(c));
      }

      if (adGroupId) {
        const agRes = await retryWithBackoff(() =>
          amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sp/adGroups/list`,
            headers: { ...headersBase, Accept: "application/vnd.spAdGroup.v3+json", "Content-Type": "application/vnd.spAdGroup.v3+json" },
            data: { adGroupIdFilter: { include: [String(adGroupId)] }, includeExtendedDataFields: true, maxResults: 10 },
            meta,
          })
        );
        const ag = agRes?.data?.adGroups?.[0];
        if (ag) {
          result.adGroupState = ag.state || null;
          result.servingSignals.push(...extractServingStrings(ag));
        }
      } else {
        const agListRes = await retryWithBackoff(() =>
          amazonAxios({
            method: "POST",
            url: `${profile.amazonUrl}/sp/adGroups/list`,
            headers: { ...headersBase, Accept: "application/vnd.spAdGroup.v3+json", "Content-Type": "application/vnd.spAdGroup.v3+json" },
            data: { campaignIdFilter: { include: [String(campaignId)] }, includeExtendedDataFields: true, maxResults: 50 },
            meta,
          })
        ).catch(() => null);
        const agList = agListRes?.data?.adGroups || [];
        if (agList.length > 0) {
          const { active: activeAgs, allPaused } = selectEffectiveEntities(agList);
          if (allPaused) result.allAdGroupsPaused = true;
          for (const ag of activeAgs) result.servingSignals.push(...extractServingStrings(ag));
        }
      }

      const adRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${profile.amazonUrl}/sp/productAds/list`,
          headers: { ...headersBase, Accept: "application/vnd.spProductAd.v3+json", "Content-Type": "application/vnd.spProductAd.v3+json" },
          data: {
            ...(adGroupId ? { adGroupIdFilter: { include: [String(adGroupId)] } } : { campaignIdFilter: { include: [String(campaignId)] } }),
            includeExtendedDataFields: true,
            maxResults: 50,
          },
          meta,
        })
      );
      const spAds = adRes?.data?.productAds || [];
      const { active: activeSpAds, allPaused: allSpAdsPaused } = selectEffectiveEntities(spAds);
      if (allSpAdsPaused) result.allProductAdsPaused = true;
      for (const ad of activeSpAds) {
        const cleanAsin = ad.asin ? String(ad.asin).trim() : null;
        if (cleanAsin) {
          result.asins.push(cleanAsin);
          if (ad.sku && !result.skuByAsin[cleanAsin]) result.skuByAsin[cleanAsin] = String(ad.sku).trim();
        }
        result.servingSignals.push(...extractServingStrings(ad));
      }
    } else if (adType === "SB") {
      const campRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "POST",
          url: `${profile.amazonUrl}/sb/v4/campaigns/list`,
          headers: { ...headersBase, Accept: "application/vnd.sbcampaignresource.v4+json", "Content-Type": "application/vnd.sbcampaignresource.v4+json" },
          data: { campaignIdFilter: { include: [String(campaignId)] }, includeExtendedDataFields: true, maxResults: 10 },
          meta,
        })
      );
      const c = campRes?.data?.campaigns?.[0];
      if (c) {
        result.campaignState = c.state || null;
        result.endDate = c.endDate || null;
        result.portfolioId = c.portfolioId ? Number(c.portfolioId) : result.portfolioId;
        result.servingSignals.push(...extractServingStrings(c));
      }

      const ads = await fetchSBAdsList(profile, tokens, {
        campaignIdFilter: { include: [String(campaignId)] },
        ...(adGroupId ? { adGroupIdFilter: { include: [String(adGroupId)] } } : {}),
        includeExtendedDataFields: true,
        maxResults: 25,
      });
      const { active: activeSbAds, allPaused: allSbAdsPaused } = selectEffectiveEntities(ads);
      if (allSbAdsPaused) result.allProductAdsPaused = true;
      for (const ad of activeSbAds) {
        const sigs = extractServingStrings(ad);
        result.servingSignals.push(...sigs);
        result.creatives.push({
          adId: ad.adId,
          moderationStatus: ad.extendedData?.moderationStatus || ad.moderationStatus || null,
          servingStatus: ad.extendedData?.servingStatus || ad.servingStatus || null,
          rejectionReason: ad.extendedData?.servingStatusDetails?.[0]?.name || null,
          servingSignals: sigs,
        });
        for (const a of ad?.creative?.asins || []) result.asins.push(String(a).trim());
      }
    } else if (adType === "SD") {
      const campRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "GET",
          url: `${profile.amazonUrl}/sd/campaigns?campaignIdFilter=${campaignId}`,
          headers: { ...headersBase, "Content-Type": "application/json" },
          meta,
        })
      );
      const c = Array.isArray(campRes?.data) ? campRes.data[0] : null;
      if (c) {
        result.campaignState = c.state || null;
        result.endDate = c.endDate || null;
        result.portfolioId = c.portfolioId ? Number(c.portfolioId) : result.portfolioId;
        result.servingSignals.push(...extractServingStrings(c));
      }

      const sdAgRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "GET",
          url: `${profile.amazonUrl}/sd/adGroups?${adGroupId ? `adGroupIdFilter=${adGroupId}` : `campaignIdFilter=${campaignId}`}`,
          headers: { ...headersBase, "Content-Type": "application/json" },
          meta,
        })
      ).catch(() => null);
      const sdAdGroups = Array.isArray(sdAgRes?.data) ? sdAgRes.data : [];
      const { active: activeSdAgs, allPaused: allSdAgsPaused } = selectEffectiveEntities(sdAdGroups);
      if (adGroupId && sdAdGroups[0]) {
        result.adGroupState = sdAdGroups[0].state || null;
      } else if (!adGroupId && allSdAgsPaused) {
        result.allAdGroupsPaused = true;
      }
      for (const ag of adGroupId ? sdAdGroups : activeSdAgs) result.servingSignals.push(...extractServingStrings(ag));

      const sdProdRes = await retryWithBackoff(() =>
        amazonAxios({
          method: "GET",
          url: `${profile.amazonUrl}/sd/productAds?${adGroupId ? `adGroupIdFilter=${adGroupId}` : `campaignIdFilter=${campaignId}`}`,
          headers: { ...headersBase, "Content-Type": "application/json" },
          meta,
        })
      ).catch(() => null);
      const sdProductAds = Array.isArray(sdProdRes?.data) ? sdProdRes.data : [];
      const { active: activeSdAds, allPaused: allSdAdsPaused } = selectEffectiveEntities(sdProductAds);
      if (allSdAdsPaused) result.allProductAdsPaused = true;
      for (const ad of activeSdAds) {
        const cleanAsin = ad.asin ? String(ad.asin).trim() : null;
        if (cleanAsin) {
          result.asins.push(cleanAsin);
          if (ad.sku && !result.skuByAsin[cleanAsin]) result.skuByAsin[cleanAsin] = String(ad.sku).trim();
        }
        result.servingSignals.push(...extractServingStrings(ad));
      }

      const sdAdGroupIds = adGroupId
        ? [adGroupId]
        : activeSdAgs.map((ag) => ag.adGroupId).filter(Boolean).slice(0, 5);
      for (const targetAgId of sdAdGroupIds) {
        const sdCreatives = await fetchSDCreativesList(profile, tokens, targetAgId);
        for (const cr of sdCreatives) {
          const sigs = extractServingStrings(cr);
          result.servingSignals.push(...sigs);
          result.creatives.push({
            creativeId: cr.creativeId,
            moderationStatus: cr.moderationStatus || null,
            servingStatus: cr.servingStatus || null,
            rejectionReason: cr.moderationReasons?.[0] || null,
            servingSignals: sigs,
          });
        }
      }
    }

    if (result.portfolioId) {
      const portData = await fetchPortfolios(profile, tokens, {
        portfolioIdFilter: { include: [String(result.portfolioId)] },
        includeExtendedDataFields: true,
      }).catch(() => null);
      const p = portData?.portfolios?.[0];
      if (p) {
        result.portfolio = {
          portfolioId: p.portfolioId,
          name: p.name,
          servingStatus: p.extendedData?.servingStatus || p.servingStatus || null,
          isOutOfBudget: !p.inBudget,
        };
        result.servingSignals.push(...extractServingStrings(p));
      }
    }
  } catch {
    // Graceful degradation: partial signals or local signals still diagnose outage
  }

  result.servingSignals = [...new Set(result.servingSignals)];
  result.asins = [...new Set(result.asins)];
  return result;
}

/**
 * Checks Amazon Ads /product/metadata eligibility and availability for up to 25 ASINs.
 */
async function fetchAdsProductEligibility(profile, tokens, asins) {
  if (!tokens?.adsAccessToken || !asins.length) return [];
  try {
    const res = await retryWithBackoff(() =>
      amazonAxios({
        method: "POST",
        url: `${profile.amazonUrl}/product/metadata`,
        headers: {
          "Amazon-Advertising-API-ClientId": tokens.adsClientId,
          "Amazon-Advertising-API-Scope": profile.profileId,
          Authorization: `Bearer ${tokens.adsAccessToken}`,
          "Content-Type": "application/json",
        },
        data: { adType: "SP", asins: asins.slice(0, 50), checkItemDetails: true, checkEligibility: true, pageIndex: 0, pageSize: Math.min(asins.length, 50) },
        meta: { configId: profile.configId, tokenKey: "adsAccessToken", profileId: profile.profileId, isBackgroundWorker: true },
      })
    );
    return (res?.data?.ProductMetadataList || []).map((item) => ({
      asin: item.asin,
      availability: item.availability || null,
      eligibilityStatus: item.eligibilityStatus || null,
      ineligibilityReason: item.ineligibilityReason || item.ineligibleReasons?.[0] || null,
      sku: item.sku || null,
    }));
  } catch {
    return [];
  }
}

/**
 * On-demand SP-API Buy Box check (cached 3m) & Listings Issues check for the primary ASIN/SKU.
 */
async function fetchSpApiDiagnostics({ profile, spConfig, marketplaceConfig, asin, sku }) {
  if (!spConfig?.spAccessToken || !marketplaceConfig?.endPoint || !asin) {
    return { buyBoxInfo: null, listingInfo: null };
  }
  const { endPoint, marketPlaceId } = marketplaceConfig;
  const sellerId = spConfig.sellerId || profile.advertiserId;
  const headers = { "x-amz-access-token": spConfig.spAccessToken };
  const meta = { configId: profile.configId, tokenKey: "spAccessToken", sp: true, profileId: profile.profileId, isBackgroundWorker: true };

  let buyBoxInfo = null;
  let listingInfo = null;

  try {
    const offerKey = `blackout_offers_${profile.profileId}_${marketPlaceId}_${asin}`;
    let payload = null;
    try {
      const cached = await getCacheWithLog(offerKey);
      if (cached) payload = JSON.parse(cached);
    } catch {}

    if (!payload) {
      const res = await retryWithBackoff(() =>
        amazonAxios({
          method: "GET",
          url: `${endPoint}/products/pricing/v0/items/${asin}/offers?MarketplaceId=${marketPlaceId}&ItemCondition=New&CustomerType=Consumer`,
          headers,
          meta,
        })
      );
      payload = res?.data?.payload || null;
      if (payload) await setCacheWithLog(offerKey, JSON.stringify(payload), SP_OFFER_CACHE_TTL).catch(() => {});
    }

    if (payload) {
      const offers = payload.Offers || [];
      const summary = payload.Summary || {};
      const winner = offers.find((o) => o.IsBuyBoxWinner);
      const ourOffer = sellerId ? offers.find((o) => String(o.SellerId || "") === String(sellerId)) : null;
      const buyBoxPrice = summary.BuyBoxPrices?.[0]?.LandedPrice?.Amount ?? winner?.ListingPrice?.Amount ?? null;
      const totalOffers = Number(summary.TotalOfferCount ?? offers.length ?? 0);

      buyBoxInfo = {
        asin,
        unbuyable: totalOffers === 0 || (!winner && !ourOffer),
        lostBuyBox: Boolean(winner && sellerId && String(winner.SellerId || "") !== String(sellerId)),
        ourPrice: ourOffer?.ListingPrice?.Amount ?? null,
        buyBoxPrice,
      };
    }
  } catch {}

  if (sellerId && sku) {
    try {
      const listKey = `blackout_listing_${profile.profileId}_${marketPlaceId}_${sku}`;
      let listData = null;
      try {
        const cached = await getCacheWithLog(listKey);
        if (cached) listData = JSON.parse(cached);
      } catch {}

      if (!listData) {
        const res = await retryWithBackoff(() =>
          amazonAxios({
            method: "GET",
            url: `${endPoint}/listings/2021-08-01/items/${sellerId}/${encodeURIComponent(sku)}?marketplaceIds=${marketPlaceId}&includedData=summaries,issues`,
            headers,
            meta,
          })
        );
        listData = res?.data || null;
        if (listData) await setCacheWithLog(listKey, JSON.stringify(listData), LISTING_CACHE_TTL).catch(() => {});
      }

      if (listData) {
        const statuses = listData.summaries?.[0]?.status || [];
        const issues = listData.issues || [];
        const errIssue = issues.find((i) => String(i.severity || "").toUpperCase() === "ERROR") || issues[0];
        const isBuyable = statuses.includes("BUYABLE") && statuses.includes("DISCOVERABLE");
        listingInfo = {
          asin,
          sku,
          suppressed: !isBuyable && statuses.length > 0 && (!statuses.includes("DISCOVERABLE") || Boolean(errIssue)),
          ineligible: !isBuyable && statuses.length > 0 && !statuses.includes("BUYABLE"),
          issueMessage: errIssue?.message || null,
        };
      }
    } catch {}
  }

  return { buyBoxInfo, listingInfo };
}

module.exports = {
  selectEffectiveEntities,
  extractServingStrings,
  classifyBlackoutReason,
  fetchLiveAdsDiagnostics,
  fetchAdsProductEligibility,
  fetchSpApiDiagnostics,
};
