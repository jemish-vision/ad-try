"use strict";

// Helpers for combining the product-centric dashboard reads across ad types.
//
// The dashboard aggregates ad performance per product (ASIN). For the combined
// "All" view the ad metrics must span SP + SB + SD AT THE SOURCE — running each
// type separately and merging whole product rows afterwards would double-count
// ASINs advertised in more than one type and corrupt derived fields
// (organic = total − ad, bucket classification, period-over-period %). So we
// union the per-type campaign/product_ads data *inside* each read.

const { resolveAdTypes } = require("./adTypeResolver");
const AD_TYPE_COLLECTIONS = require("./adTypeCollections");
const AD_TYPE_COLLECTION_NAMES = require("./adTypeCollectionNames");
const { mergeNumericById, buildProductAdsLookupStages } = require("./dashboardMerge");

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
// is applied). Single type → one model; "All" → SP+SB+SD, aggregated separately
// and merged by the caller. Safe because the group it feeds is purely additive.
function adsModelsForAdType(adType, hasProductFilter, campaignFallback, productAdsFallback) {
  return resolveAdTypes(adType).map((t) => {
    const bundle = AD_TYPE_COLLECTIONS?.[`${t}Model`] || {};
    return hasProductFilter
      ? (bundle.productAdsSchema || productAdsFallback)
      : (bundle.campaignSchema || campaignFallback);
  });
}

// Run the same aggregation pipeline across every resolved ad type's campaign
// collection and merge the results by _id, summing numeric fields. Single type →
// that model's result unchanged. Use only for ADDITIVE groups (sums of
// spend/sales/clicks/…); never for pre-derived ratios. Handles both a single
// {_id: null} rollup and a grouped-by-key (e.g. reportDate) result.
//
// The pipeline is shared across the per-type aggregates (never JSON-cloned):
// these are separate, non-discriminator collections, so Mongoose does not mutate
// the passed pipeline, and a structural clone would corrupt the BSON types it
// carries (an ObjectId configId / Date would become a plain string and match
// nothing → zeroed cards). This mirrors the graph path, which also shares.
async function aggregateCampaignsAcrossAdTypes(adType, fallbackModel, pipeline) {
  const models = campaignModelsForAdType(adType, fallbackModel);
  if (models.length === 1) return models[0].aggregate(pipeline);
  const perModel = await Promise.all(models.map((m) => m.aggregate(pipeline)));
  return mergeNumericById(perModel.flat());
}

// Collection names for product_ads across the resolved ad types. "All" →
// ["product_ads","sbproductads","sdproductads"]; single type → one name.
function productAdsCollectionsForAdType(adType) {
  return resolveAdTypes(adType).map(
    (t) => AD_TYPE_COLLECTION_NAMES?.[t]?.productAds || "product_ads",
  );
}

// Build the product_ads join as N SEPARATE correlated $lookup stages (one per
// resolved ad type) plus an $addFields that sums their per-ASIN {_id:null}
// aggregates into one `as` object. Deliberately NOT a $unionWith inside the
// $lookup — a correlated lookup sub-pipeline can't reliably union, and separate
// lookups work on every MongoDB version/topology. `requireAds` reproduces the
// original `$unwind "$ads"` behaviour (drop products with no ad docs in any type).
//   innerPipeline  the lookup's inner stages (match by $$asin + filters, then a
//                  {_id:null} $group) — identical for each ad type's collection
//   sumFields      the numeric fields the $group produces, to sum across types
//   as             combined output field (object holding sumFields); default "ads"
function productAdsLookupStages({ adType, innerPipeline, sumFields, as = "ads", requireAds = true }) {
  return buildProductAdsLookupStages({
    collections: productAdsCollectionsForAdType(adType),
    innerPipeline,
    sumFields,
    as,
    requireAds,
  });
}

module.exports = {
  campaignModelsForAdType,
  distinctCampaignIdsForAdType,
  adsModelsForAdType,
  aggregateCampaignsAcrossAdTypes,
  productAdsCollectionsForAdType,
  productAdsLookupStages,
};
