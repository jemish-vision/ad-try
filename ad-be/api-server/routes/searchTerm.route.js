const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const { getSearchTermDetailsData, getAllSearchTerms, getSearchTermsProductView, addToNegative, addNegativeToCampaign, addToNegativeProduct, ruleHistory, getSearchTermRule, createSearchTermRule, updateSearchTermRule, getSearchTermRuleById, changeSearchTermRuleStatus, deleteSearchTermRule, manualRunSearchTermRule, ruleEffectedSearchTerm, suggestedTargetingBid, removeSearchTerm, getKeywordAnalysisData, exportSearchTermRule, importSearchTermRule } = require("../controllers/searchTerm.controller");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { withAllAdTypes } = require("../helper/allAdTypeHandler");
const { uploadExcelFile } = require("../helper/excelFileUpload");

// Search terms exist only for SP + SB (Sponsored Display has none), so "All"
// here merges SP + SB and reports SD as excluded.
const allSearchTerms = withAllAdTypes(getAllSearchTerms, {
    dataKey: "getSearchTerm",
    totalKey: "totalSearchTerm",
    totalRowKey: "totalRow",
    numericTotalFields: ["impressions", "clicks", "orders", "spend", "sales"],
    excludeSD: true,
});

router.post("/getSearchTermIdData/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getSearchTermDetailsData);

router.post("/getAllSearchTerms", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, allSearchTerms);
router.post("/getSearchTermsProductView", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getSearchTermsProductView);
router.post("/addToNegative", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.CREATE), addToNegative);
router.post("/addToNegativeProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.CREATE), addToNegativeProduct);
router.post("/addNegativeToCampaign", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM, PAGE_ACTIONS.CREATE), addNegativeToCampaign);

router.post("/ruleHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY), ruleHistory);

router.post("/getSearchTermRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.VIEW_ONLY), getSearchTermRule);
router.post("/createSearchTermRUle", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.CREATE), createSearchTermRule);
router.post("/updateSearchTermRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE), updateSearchTermRule);
router.get("/getSearchTermRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.VIEW_ONLY), getSearchTermRuleById);
router.post("/changeSearchTermRuleStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE), changeSearchTermRuleStatus);
router.delete("/deleteSearchTermRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.REMOVE), deleteSearchTermRule);
router.get("/ruleEffectedSearchTerm/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE), ruleEffectedSearchTerm);
router.post("/manualRunSearchTermRule/", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE), manualRunSearchTermRule);

router.post("/exportSearchTermRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.UPDATE), exportSearchTermRule);
router.post("/importSearchTermRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.SEARCH_TERM_RULE, PAGE_ACTIONS.CREATE), importSearchTermRule);

router.post("/suggestedTargetingBid", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.VIEW_ONLY), suggestedTargetingBid);
router.post("/removeSearchTerm", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.REMOVE), AdTypeModels, removeSearchTerm);

router.post("/keywordAnalysis", verifyToken, validateRoutePermission(SYSTEM_PAGES.KEYWORD_ANALYSIS, PAGE_ACTIONS.VIEW_ONLY), getKeywordAnalysisData);

module.exports = router;
