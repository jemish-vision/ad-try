const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const {
  getCampaigns,
  getCampaignDataTable,
  getCampaignDetailsData,
  cronListCampaignsFromAmazon,
  listCampaignName,
  getKeywordByAdId,
  getPlacement,
  getHistory,
  getCampaignChartData,
  saveCampaignNotifySetting,
  AIAnalysis,
  addCampaigns,
  hourlyCampaignTracking,
  getCampaignBidThreshold,
  saveCamapignBidThreshold,
  savePLHistory,
  getPLHistory,
  removePLHistory,
  calculateCampaignMaxBid,
  hourlyPlacementTracking,
  addTargetings,
  addNegativeTargetings,
  createSPCampaigns,
  createSBCampaigns,
  getBrands,
  getPortfolios,
  getStores,
  getStorePages,
  getBrandDetails,
  fileUpload,
  previewSDCreative,
  getLatestCampaignHistory,
} = require("../controllers/campaign.controller");
const {
  getAdGroupsByCampaign,
  getProductAdsByAdGroup,
} = require("../controllers/adGroups.controller");
const { verifyToken } = require("../middleware/user.auth");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { campaignAssetsUpload } = require("../helper/campaignAssetsUpload");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.post("/getAdGroupsByCampaign/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getAdGroupsByCampaign);
router.post("/getProductAdsByAdGroup/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getProductAdsByAdGroup);

router.post("/createSPCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.CREATE), createSPCampaigns);

router.get("/getBrands", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getBrands);
router.get("/getPortfolios", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getPortfolios);
router.get("/getStores", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getStores);
router.post("/getStorePages", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getStorePages);
router.get("/getBrandDetails", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getBrandDetails);
router.post("/fileUpload", campaignAssetsUpload, fileUpload);

router.post("/createSBCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.CREATE), createSBCampaigns);

router.post("/previewSDCreative", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), previewSDCreative);

router.post("/getCampaignDataTable/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getCampaignDataTable);
router.post("/getCampaignIdData/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getCampaignDetailsData);
router.post("/getCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getCampaigns);
router.post("/getKeywordByAdId/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getKeywordByAdId);
router.post("/cronListCampaignsFromAmazon", verifyToken, verifyCronAuth, cronListCampaignsFromAmazon);
router.post("/listCampaignName", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), listCampaignName);

router.post("/addCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.CREATE), addCampaigns);

router.post("/getPlacement", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.PLACEMENT, actionType: PAGE_ACTIONS.VIEW_ONLY }]), getPlacement);

router.post("/getHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.HISTORY, actionType: PAGE_ACTIONS.VIEW_ONLY }]), AdTypeModels, getHistory);
router.post("/getLatestCampaignHistory", verifyToken, getLatestCampaignHistory);
router.post("/getCampaignChartData", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getCampaignChartData);

router.post("/saveCampaignNotifySetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE), saveCampaignNotifySetting);
router.post("/AIAnalysis", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AIAnalysis);

router.post("/hourlyCampaignTracking", verifyToken, hourlyCampaignTracking);
router.post("/hourlyPlacementTracking", verifyToken, hourlyPlacementTracking);

router.post("/saveCamapignBidThreshold", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE), saveCamapignBidThreshold);
router.post("/getCampaignBidThreshold", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getCampaignBidThreshold);

router.post("/getPLHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.PL_CALCULATOR, PAGE_ACTIONS.VIEW_ONLY), getPLHistory);
router.post("/savePLHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.PL_CALCULATOR, PAGE_ACTIONS.UPDATE), savePLHistory);
router.post("/removePLHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.PL_CALCULATOR, PAGE_ACTIONS.REMOVE), removePLHistory);

router.post("/calculateCampaignMaxBid", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), calculateCampaignMaxBid);

router.post("/addTargetings", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.CREATE), addTargetings);
router.post("/addNegativeTargetings", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.CREATE), addNegativeTargetings);

module.exports = router;
