const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { runRecommendationSnapshot, getRules, getRuleById, updateRules, addRules, statusChange, deleteRule, getRecommendation, getRecommendationData, deleteRecommendation, applyRuleRecommendation, cronRecommendationSnapshot, getTotalRecommendationCount, exportRecommandationRule, importRecommandationRule } = require("../controllers/recommendation.controller");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { uploadExcelFile } = require("../helper/excelFileUpload");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.post("/runRecommendationSnapshot", verifyToken, verifyCronAuth, runRecommendationSnapshot);
router.post("/cronRecommendationSnapshot", verifyToken, verifyCronAuth, cronRecommendationSnapshot);

router.post("/getRules", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.VIEW_ONLY), getRules);
router.post("/getRuleById/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.VIEW_ONLY), getRuleById);
router.post("/updateRules/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE), updateRules);
router.post("/addRules", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.CREATE), addRules);
router.post("/statusChange", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE), statusChange);
router.post("/deleteRule/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.REMOVE), deleteRule);

router.post("/exportRecommandationRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE), exportRecommandationRule);
router.post("/importRecommandationRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.CREATE), importRecommandationRule);

router.post("/getRecommendation", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getRecommendation);
router.post("/getTotalRecommendationCount", verifyToken, AdTypeModels, getTotalRecommendationCount);
router.post("/getRecommendationData/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getRecommendationData);
router.post("/deleteRecommendation/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.REMOVE), AdTypeModels, deleteRecommendation);

router.post("/applyRuleRecommendation/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE), AdTypeModels, applyRuleRecommendation);

module.exports = router;
