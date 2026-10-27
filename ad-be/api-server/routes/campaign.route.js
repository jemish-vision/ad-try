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
const { withAllAdTypes, withAllAdTypesChart, round } = require("../helper/allAdTypeHandler");
const { campaignAssetsUpload } = require("../helper/campaignAssetsUpload");
const { verifyCronAuth } = require("../middleware/cron.auth");

// Campaigns exist for all three ad types, so "All" merges SP + SB + SD. The KPI
// total row sums budget + the base metrics; timeInBudget is combined as a
// campaign-count-weighted average across types.
const allCampaigns = withAllAdTypes(getCampaigns, {
  dataKey: "getCampaign",
  totalKey: "totalRecords",
  totalRowKey: "totalRow",
  excludeSD: false,
  numericTotalFields: ["budget", "impressions", "clicks", "orders", "spend", "sales"],
  sortField: (body) => (body && body.sortType && body.fieldName) ? body.fieldName : "acos",
  pageNoKey: "currentPageNo",
  perPageKey: null,
  totalPagesKey: "totalPages",
  mergeTotalRow: (rows, sums, bodies) => {
    const counts = bodies.map((b) => Number(b.totalRecords) || 0);
    const totalCount = counts.reduce((a, b) => a + b, 0);
    const weightedTib = rows.reduce(
      (s, r, i) => s + (Number(r.timeInBudget) || 0) * (counts[i] || 0),
      0,
    );
    const impressions = sums.impressions || 0;
    const clicks = sums.clicks || 0;
    const spend = sums.spend || 0;
    const sales = sums.sales || 0;
    const orders = sums.orders || 0;
    return {
      action: "Total",
      name: "Total",
      budget: round(sums.budget || 0),
      timeInBudget: totalCount > 0 ? round(weightedTib / totalCount) : 0,
      impressions: round(impressions),
      clicks: round(clicks),
      orders: round(orders),
      spend: round(spend),
      sales: round(sales),
      acos: sales > 0 ? round((spend / sales) * 100) : 0,
      roas: spend > 0 ? round(sales / spend) : 0,
      cpc: clicks > 0 ? round(spend / clicks) : 0,
      ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
    };
  },
});

// Campaign performance chart: sum each date's metrics across the ad types.
// The single-type series carries only cpc/acos/roas (no ctr/conversionRate),
// so mirror exactly that set.
const allCampaignChart = withAllAdTypesChart(getCampaignChartData, {
  dataKey: "data",
  groupKey: "reportDate",
  sumFields: ["impressions", "clicks", "orders", "spend", "sales"],
  excludeSD: false,
  deriveRatios: (t) => {
    const clicks = Number(t.clicks) || 0;
    const spend = Number(t.spend) || 0;
    const sales = Number(t.sales) || 0;
    return {
      cpc: clicks > 0 ? round(spend / clicks) : 0,
      acos: sales > 0 ? round((spend / sales) * 100) : 0,
      roas: spend > 0 ? round(sales / spend) : 0,
    };
  },
  mergeExtra: (bodies) => {
    const ids = [];
    for (const b of bodies) {
      if (Array.isArray(b.filteredCampaignIds)) ids.push(...b.filteredCampaignIds);
    }
    return { filteredCampaignIds: ids, totalFilteredCampaigns: ids.length };
  },
});

// Change history spans all three ad types (legacy untyped records count as SP),
// so "All" merges SP + SB + SD. Each type runs its own query so the per-type
// campaign/adGroup/targeting lookups resolve against the right collections.
const allHistory = withAllAdTypes(getHistory, {
  dataKey: "data",
  totalKey: "totalRecords",
  totalRowKey: null,
  excludeSD: false,
  sortField: (body) => (body && body.fieldName) || "createdAt",
  sortDir: (body) => (body && (body.sortType === "ASC" || body.sortType === 1)) ? "asc" : "desc",
  pageNoKey: "currentPageNo",
  perPageKey: null,
  totalPagesKey: "totalPages",
});

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
router.post("/getCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, allCampaigns);
router.post("/getKeywordByAdId/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), getKeywordByAdId);
router.post("/cronListCampaignsFromAmazon", verifyToken, verifyCronAuth, cronListCampaignsFromAmazon);
router.post("/listCampaignName", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), listCampaignName);

router.post("/addCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.CREATE), addCampaigns);

router.post("/getPlacement", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.PLACEMENT, actionType: PAGE_ACTIONS.VIEW_ONLY }]), getPlacement);

router.post("/getHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.HISTORY, actionType: PAGE_ACTIONS.VIEW_ONLY }]), AdTypeModels, allHistory);
router.post("/getLatestCampaignHistory", verifyToken, getLatestCampaignHistory);
router.post("/getCampaignChartData", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, allCampaignChart);

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
