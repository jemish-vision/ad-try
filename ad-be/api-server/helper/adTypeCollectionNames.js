"use strict";

// Pure map of ad type -> collection names. No Mongoose model requires, so this
// stays side-effect free and can be used by lightweight helpers and tests
// without loading the whole model layer. adTypeCollections.js composes its
// string halves from this; keep the two aligned.
const AD_TYPE_COLLECTION_NAMES = {
  SP: {
    campaign: "campaigns",
    adGroup: "ad_groups",
    searchTerm: "searchterms",
    targeting: "targetings",
    placement: "placements",
    product: "products",
    productAds: "product_ads",
  },
  SB: {
    campaign: "sbcampaigns",
    adGroup: "sbadgroups",
    searchTerm: "sbsearchterms",
    targeting: "sbtargetings",
    placement: "sbplacements",
    product: "sbproducts",
    productAds: "sbproductads",
  },
  SD: {
    campaign: "sdcampaigns",
    adGroup: "sdadgroups",
    searchTerm: "sdsearchterms",
    targeting: "sdtargetings",
    placement: "sdplacements",
    product: "sdproducts",
    productAds: "sdproductads",
  },
};

module.exports = AD_TYPE_COLLECTION_NAMES;
