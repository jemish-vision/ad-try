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

// Per-ad-type model bundles, keyed by code, so the "All" path can hand each
// migrated controller the models for every type at once.
const MODELS_BY_TYPE = {
  SP: {
    adTypeCampaignSchema: campaign,
    adTypeAdGroupSchema: adGroup,
    adTypeSearchTermSchema: searchTerm,
    adTypeTargetingSchema: targeting,
    adTypePlacementSchema: placement,
    adTypeProductSchema: product,
    adTypeProductAdsSchema: productAds,
  },
  SB: {
    adTypeCampaignSchema: sbCampaign,
    adTypeAdGroupSchema: sbAdgroup,
    adTypeSearchTermSchema: sbSearchTerm,
    adTypeTargetingSchema: sbTargeting,
    adTypePlacementSchema: sbPlacement,
    adTypeProductSchema: sbProduct,
    adTypeProductAdsSchema: sbProductAds,
  },
  SD: {
    adTypeCampaignSchema: sdCampaign,
    adTypeAdGroupSchema: sdAdgroup,
    adTypeSearchTermSchema: sdSearchTerm,
    adTypeTargetingSchema: sdTargeting,
    adTypePlacementSchema: sdPlacement,
    adTypeProductSchema: sdProduct,
    adTypeProductAdsSchema: sdProductAds,
  },
};

const AdTypeModels = (req, res, next) => {
  const adType = req.adType;

  // "All" = SP + SB + SD. Controllers migrated for "All" read req.isAllAdTypes /
  // req.adTypes / req.modelsByType and union the collections themselves. req.models
  // is kept pointing at SP so any not-yet-migrated controller stays functional
  // (only migrated screens ever send "All" — the frontend guard enforces that).
  if (adType === "All") {
    req.adTypes = ["SP", "SB", "SD"];
    req.isAllAdTypes = true;
    req.modelsByType = MODELS_BY_TYPE;
    req.models = MODELS_BY_TYPE.SP;
    return next();
  }

  let models = {};
  switch (adType) {
    // ================= SP =================
    case "SP":
      models = MODELS_BY_TYPE.SP;
      break;

    // ================= SB =================
    case "SB":
      models = MODELS_BY_TYPE.SB;
      break;

    // ================= SD =================
    case "SD":
      models = MODELS_BY_TYPE.SD;
      break;

    default:
      return res.status(400).send({
        isSuccess: false,
        message: "Invalid adtype header. Allowed: SP, SB, SD, All",
      });
  }

  req.models = models;
  req.adTypes = [adType];
  req.isAllAdTypes = false;
  next();
};

module.exports = { AdTypeModels, MODELS_BY_TYPE };
