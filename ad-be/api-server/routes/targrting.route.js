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

router.post("/getTargeting", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTargeting);
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

router.post("/getTargetingChartData", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTargetingChartData);

router.post("/getTargetingByCampaigns", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING, PAGE_ACTIONS.VIEW_ONLY), getTargetingByCampaigns);

router.post("/exportTargetingRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.UPDATE), exportTargetingRule);
router.post("/importTargetingRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.TARGETING_RULE, PAGE_ACTIONS.CREATE), importTargetingRule);

router.post("/getLifeTimeTargetingMatrix", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getLifeTimeTargetingMatrix);
router.post("/getTargetingKeywordDetails", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTargetingKeywordDetails);
router.post("/getKeywordSuggestions", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getKeywordSuggestions);
router.post("/getKeywordUniqueFilterValues", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getKeywordUniqueFilterValues);

module.exports = router;
