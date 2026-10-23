const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");

const {
    manualGenerateReport,
    updatePlacementBid,
    updatePlacementBidInDB,
    updatePlacementBidApplyInAmazon,
    createRule,
    changeStatus,
    updateRule,
    deleteRule,
    getRule,
    getPlacementRules,
    manualRunPlacementRule,
    ruleHistory,
    exportBidPlacementRule,
    importBidPlacementRule,
    getAllPlacements,
    checkRuleBlockCampaign,
    ruleEffectedPlacement,
    ruleReverted
} = require("../controllers/placement.controller");
const { uploadExcelFile } = require("../helper/excelFileUpload");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");

router.post("/updatePlacementBid", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.PLACEMENT, actionType: PAGE_ACTIONS.UPDATE }]), updatePlacementBid);
router.post("/saveInDB", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.PLACEMENT, actionType: PAGE_ACTIONS.UPDATE }]), updatePlacementBidInDB);
router.post("/applyInAmazon", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.PLACEMENT, actionType: PAGE_ACTIONS.UPDATE }]), updatePlacementBidApplyInAmazon);

router.post("/createRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.CREATE), createRule);
router.post("/updateRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.UPDATE), updateRule);
router.post("/changeStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.UPDATE), changeStatus);
router.delete("/deleteRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.REMOVE), deleteRule);
router.get("/getRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.VIEW_ONLY), getRule);
router.post("/getPlacementRules", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.VIEW_ONLY), getPlacementRules);

router.get("/ruleEffectedPlacement/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.UPDATE), ruleEffectedPlacement);
router.post("/manualRunPlacementRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.UPDATE), manualRunPlacementRule);
router.post("/ruleReverted", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.UPDATE), ruleReverted);

router.post("/ruleHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY), ruleHistory);

router.post("/exportBidPlacementRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.UPDATE), exportBidPlacementRule);
router.post("/importBidPlacementRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT_RULE, PAGE_ACTIONS.CREATE), importBidPlacementRule);

router.post("/getAllPlacements", verifyToken, validateRoutePermission(SYSTEM_PAGES.PLACEMENT, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getAllPlacements);

router.post("/checkRuleBlockCampaign", verifyToken, checkRuleBlockCampaign);

module.exports = router;
