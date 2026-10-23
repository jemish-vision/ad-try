const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const { getProfitAnalysisSummary, getProfitAnalysisMonthly, getProfitAnalysisProducts } = require("../controllers/profitAnalysis.controller");

router.post("/getProfitAnalysisSummary", verifyToken, validateRoutePermission(SYSTEM_PAGES.PROFIT_ANALYSIS, PAGE_ACTIONS.VIEW_ONLY), getProfitAnalysisSummary);
router.post("/getProfitAnalysisMonthly", verifyToken, validateRoutePermission(SYSTEM_PAGES.PROFIT_ANALYSIS, PAGE_ACTIONS.VIEW_ONLY), getProfitAnalysisMonthly);
router.post("/getProfitAnalysisProducts", verifyToken, validateRoutePermission(SYSTEM_PAGES.PROFIT_ANALYSIS, PAGE_ACTIONS.VIEW_ONLY), getProfitAnalysisProducts);

module.exports = router;
