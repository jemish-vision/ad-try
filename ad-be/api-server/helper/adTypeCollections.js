// ===== SP MODELS =====
const campaign = require("../models/campaign.model");
const adGroup = require("../models/adGroups.model");
const searchTerm = require("../models/searchTerm.model");
const targeting = require("../models/targeting.model");
const placement = require("../models/placement.model");
const product = require("../models/product.model");
const productAds = require("../models/productAds.model");

// ===== SB MODELS =====
const sbCampaign = require("../models/sbCampaign.model");
const sbAdgroup = require("../models/sbAdGroups.model");
const sbSearchTerm = require("../models/sbSearchTerm.model");
const sbTargeting = require("../models/sbTargeting.model");
const sbPlacement = require("../models/sbPlacement.model");
const sbProduct = require("../models/sbProduct.model");
const sbProductAds = require("../models/sbProductAds.model");

// ===== SD MODELS =====
const sdCampaign = require("../models/sdCampaign.model");
const sdAdgroup = require("../models/sdAdGroups.model");
const sdSearchTerm = require("../models/sdSearchTerm.model");
const sdTargeting = require("../models/sdTargeting.model");
const sdPlacement = require("../models/sdPlacement.model");
const sdProduct = require("../models/sdProduct.model");
const sdProductAds = require("../models/sdProductAds.model");

const AD_TYPE_COLLECTIONS = {
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

    SPModel: {
        campaignSchema: campaign,
        adGroupSchema: adGroup,
        searchTermSchema: searchTerm,
        targetingSchema: targeting,
        placementSchema: placement,
        productSchema: product,
        productAdsSchema: productAds,
    },

    SBModel: {
        campaignSchema: sbCampaign,
        adGroupSchema: sbAdgroup,
        searchTermSchema: sbSearchTerm,
        targetingSchema: sbTargeting,
        placementSchema: sbPlacement,
        productSchema: sbProduct,
        productAdsSchema: sbProductAds,
    },

    SDModel: {
        campaignSchema: sdCampaign,
        adGroupSchema: sdAdgroup,
        searchTermSchema: sdSearchTerm,
        targetingSchema: sdTargeting,
        placementSchema: sdPlacement,
        productSchema: sdProduct,
        productAdsSchema: sdProductAds,
    },
};

module.exports = AD_TYPE_COLLECTIONS;
