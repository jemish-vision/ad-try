const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const {
  createRule,
  updateRule,
  getRule,
  changeStatus,
  deleteRule,
  getBudgetRules,
  getCampaignsName,
  ruleHistory,
  manualRun,
  exportBudgetRule,
  importBudgetRule,
  ruleEffectedBudget,
  ruleReverted,
} = require("../controllers/budgetRules.controller");
const { uploadExcelFile } = require("../helper/excelFileUpload");

router.post("/createRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.CREATE), createRule);
router.post("/updateRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE), updateRule);
router.get("/getRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.VIEW_ONLY), getRule);
router.post("/changeStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE), changeStatus);
router.delete("/deleteRule/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.REMOVE), deleteRule);
router.post("/getBudgetRules", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.VIEW_ONLY), getBudgetRules);
router.post("/getCampaignsName", verifyToken, getCampaignsName);
router.post("/ruleHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULE_HISTORY, PAGE_ACTIONS.VIEW_ONLY), ruleHistory);

router.get("/ruleEffectedBudget/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE), ruleEffectedBudget);
router.post("/manualRun/:ruleId", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE), manualRun);
router.post("/ruleReverted", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE), ruleReverted);

router.post("/exportBudgetRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.UPDATE), exportBudgetRule);
router.post("/importBudgetRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.BUDGET_RULES, PAGE_ACTIONS.CREATE), importBudgetRule);

module.exports = router;
