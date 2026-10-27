const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const {
  getTargeting,
  adjustBid,
  getTargetingRule,
  createTargetingRule,
  updateTargetingRule,
  getTargetingRuleById,
  changeTargetingRuleStatus,
  deleteTargetingRule,
  manualRunTargetingRule,
  ruleHistory,
  changeStatus,
  getTargetingChartData,
  exportTargetingRule,
  importTargetingRule,
  getLifeTimeTargetingMatrix,
  getTargetingKeywordDetails,
  ruleEffectedTargeting,
  ruleReverted,
  getTargetingByCampaigns,
  createKeywords,
  getTargetingHistory
} = require("../controllers/targeting.controller");

const { getKeywordSuggestions, getKeywordUniqueFilterValues } = require("../controllers/keywordSuggestion.controller");

const { verifyToken } = require("../middleware/user.auth");
const { uploadExcelFile } = require("../helper/excelFileUpload");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { withAllAdTypes, withAllAdTypesChart, round } = require("../helper/allAdTypeHandler");

// Targeting exists for all three ad types, so "All" merges SP + SB + SD. The
// KPI total row sums the base metrics and derives the ratios; topOfSearch-
// ImpressionShare is combined as an impression-weighted average across types.
const allTargeting = withAllAdTypes(getTargeting, {
  dataKey: "getTargeting",
  totalKey: "totalRecords",
  totalRowKey: "totalRow",
  excludeSD: false,
  numericTotalFields: ["keywordBid", "impressions", "clicks", "spend", "orders", "sales"],
  sortField: (body) => (body && body.sortType && body.fieldName) ? body.fieldName : "targetId",
  pageNoKey: "currentPageNo",
  perPageKey: null,
  totalPagesKey: "totalPages",
  mergeTotalRow: (rows, sums) => {
    const impressions = sums.impressions || 0;
    const clicks = sums.clicks || 0;
    const spend = sums.spend || 0;
    const sales = sums.sales || 0;
    const orders = sums.orders || 0;
    const weightedTos = rows.reduce(
      (s, r) => s + (Number(r.topOfSearchImpressionShare) || 0) * (Number(r.impressions) || 0),
      0,
    );
    const cvr = clicks > 0 ? round((orders / clicks) * 100) : 0;
    return {
      action: "Total",
      name: "Total",
      keywordBid: round(sums.keywordBid || 0),
      impressions: round(impressions),
      topOfSearchImpressionShare: impressions > 0 ? round(weightedTos / impressions) : 0,
      clicks: round(clicks),
      spend: round(spend),
      orders: round(orders),
      sales: round(sales),
      conversionRate: cvr,
      cvr,
      cpc: clicks > 0 ? round(spend / clicks) : 0,
      ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
      acos: sales > 0 ? round((spend / sales) * 100) : 0,
      roas: spend > 0 ? round(sales / spend) : 0,
    };
  },
});

// Targeting performance chart: sum each date's metrics across the ad types.
const allTargetingChart = withAllAdTypesChart(getTargetingChartData, {
  dataKey: "data",
  groupKey: "reportDate",
  sumFields: ["impressions", "clicks", "orders", "spend", "sales"],
  excludeSD: false,
  mergeExtra: (bodies) => {
    const ids = [];
    for (const b of bodies) {
      if (Array.isArray(b.filteredTargetingIds)) ids.push(...b.filteredTargetingIds);
    }
    return { filteredTargetingIds: ids, totalFilteredTargetings: ids.length };
  },
});

router.post("/getTargeting", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, allTargeting);
router.post("/getTargetingHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTargetingHistory);
router.post("/createKeywords", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.CREATE), createKeywords);
router.post("/adjustBid", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE), adjustBid);
router.post("/changeStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.UPDATE), changeStatus);
router.post("/ruleHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY), ruleHistory);

router.post("/getTargetingRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.VIEW_ONLY), getTargetingRule);
router.post("/createTargetingRUle", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.CREATE), createTargetingRule);
router.post("/updateTargetingRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), updateTargetingRule);
router.get("/getTargetingRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.VIEW_ONLY), getTargetingRuleById);
router.post("/changeTargetingRuleStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), changeTargetingRuleStatus);
router.delete("/deleteTargetingRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.REMOVE), deleteTargetingRule);

router.get("/ruleEffectedTargeting/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), ruleEffectedTargeting);
router.post("/manualRunTargetingRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), manualRunTargetingRule);
router.post("/ruleReverted", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), ruleReverted);

router.post("/getTargetingChartData", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, allTargetingChart);

router.post("/getTargetingByCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), getTargetingByCampaigns);

router.post("/exportTargetingRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), exportTargetingRule);
router.post("/importTargetingRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.CREATE), importTargetingRule);

router.post("/getLifeTimeTargetingMatrix", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getLifeTimeTargetingMatrix);
router.post("/getTargetingKeywordDetails", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTargetingKeywordDetails);
router.post("/getKeywordSuggestions", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getKeywordSuggestions);
router.post("/getKeywordUniqueFilterValues", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getKeywordUniqueFilterValues);

module.exports = router;
