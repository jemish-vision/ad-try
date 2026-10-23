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

const AdTypeModels = (req, res, next) => {
  const adType = req.adType;
  let models = {};
  switch (adType) {
    // ================= SP =================
    case "SP":
      models = {
        adTypeCampaignSchema: campaign,
        adTypeAdGroupSchema: adGroup,
        adTypeSearchTermSchema: searchTerm,
        adTypeTargetingSchema: targeting,
        adTypePlacementSchema: placement,
        adTypeProductSchema: product,
        adTypeProductAdsSchema: productAds,
      };
      break;

    // ================= SB =================
    case "SB":
      models = {
        adTypeCampaignSchema: sbCampaign,
        adTypeAdGroupSchema: sbAdgroup,
        adTypeSearchTermSchema: sbSearchTerm,
        adTypeTargetingSchema: sbTargeting,
        adTypePlacementSchema: sbPlacement,
        adTypeProductSchema: sbProduct,
        adTypeProductAdsSchema: sbProductAds,
      };
      break;

    // ================= SD =================
    case "SD":
      models = {
        adTypeCampaignSchema: sdCampaign,
        adTypeAdGroupSchema: sdAdgroup,
        adTypeSearchTermSchema: sdSearchTerm,
        adTypeTargetingSchema: sdTargeting,
        adTypePlacementSchema: sdPlacement,
        adTypeProductSchema: sdProduct,
        adTypeProductAdsSchema: sdProductAds,
      };
      break;

    default:
      return res.status(400).send({
        isSuccess: false,
        message: "Invalid adtype header. Allowed: SP, SB, SD",
      });
  }

  req.models = models;
  next();
};

module.exports = { AdTypeModels };
