"use strict";

// Helpers for combining the product-centric dashboard reads across ad types.
//
// The dashboard aggregates ad performance per product (ASIN) by (a) collecting
// the active campaign IDs for an ad type and (b) $lookup-ing that type's
// product_ads collection, filtered to those campaigns. For the combined "All"
// view both must span SP + SB + SD AT THE SOURCE (union the collections before
// aggregating) — running each type separately and merging afterwards would
// double-count products advertised in more than one type and corrupt derived
// fields (organic = total − ad, bucket classification, period-over-period %).

const { resolveAdTypes } = require("./adTypeResolver");
const AD_TYPE_COLLECTIONS = require("./adTypeCollections");
const AD_TYPE_COLLECTION_NAMES = require("./adTypeCollectionNames");
const { mergeNumericById, buildUnionSource } = require("./dashboardMerge");

// Campaign models (Mongoose) for the resolved ad types. "All" → SP+SB+SD.
function campaignModelsForAdType(adType, fallbackModel) {
  return resolveAdTypes(adType).map(
    (t) => AD_TYPE_COLLECTIONS?.[`${t}Model`]?.campaignSchema || fallbackModel,
  );
}

// Distinct campaign IDs across every resolved ad type's campaign collection.
// (Amazon campaign IDs are globally unique, so the union never collides.)
async function distinctCampaignIdsForAdType(adType, fallbackModel, field, query) {
  const models = campaignModelsForAdType(adType, fallbackModel);
  const perModel = await Promise.all(models.map((m) => m.distinct(field, query)));
  const set = new Set();
  for (const ids of perModel) for (const id of (ids || [])) set.add(id);
  return Array.from(set);
}

// The ad-performance models to aggregate for the resolved ad types. Picks the
// campaign or product_ads model per type (depending on whether a product filter
// is applied). For a single type it is a one-element list; for "All" it is the
// SP+SB+SD models, aggregated separately and merged by the caller. Safe to merge
// because the ad group this feeds is purely additive (spend/sales/clicks/…).
function adsModelsForAdType(adType, hasProductFilter, campaignFallback, productAdsFallback) {
  return resolveAdTypes(adType).map((t) => {
    const bundle = AD_TYPE_COLLECTIONS?.[`${t}Model`] || {};
    return hasProductFilter
      ? (bundle.productAdsSchema || productAdsFallback)
      : (bundle.campaignSchema || campaignFallback);
  });
}

// Run the same aggregation pipeline across every resolved ad type's campaign
// collection and merge the results by _id, summing numeric fields. For a single
// type it returns that model's result unchanged. Use only for ADDITIVE groups
// (sums of spend/sales/clicks/…); never for pre-derived ratios. Handles both a
// single {_id: null} rollup and a grouped-by-key (e.g. reportDate) result.
async function aggregateCampaignsAcrossAdTypes(adType, fallbackModel, pipeline) {
  const models = campaignModelsForAdType(adType, fallbackModel);
  const perModel = await Promise.all(models.map((m) => m.aggregate(pipeline)));
  if (models.length === 1) return perModel[0];
  return mergeNumericById(perModel.flat());
}

// A $lookup source for product_ads spanning the resolved ad types. For a single
// type it is just that collection; for "All" it starts on SP's product_ads and
// $unionWith's the others, so the lookup's existing inner stages (match/group)
// then aggregate over the combined set. Usage:
//   const src = productAdsLookupSource(adType);
//   { $lookup: { from: src.from, let: {...}, pipeline: [ ...src.prependStages, ...innerStages ], as: "ads" } }
function productAdsLookupSource(adType) {
  const names = resolveAdTypes(adType).map(
    (t) => AD_TYPE_COLLECTION_NAMES?.[t]?.productAds || "product_ads",
  );
  return buildUnionSource(names);
}

module.exports = {
  campaignModelsForAdType,
  distinctCampaignIdsForAdType,
  productAdsLookupSource,
};
