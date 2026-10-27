const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { getChangesByCampaign, getChangesByKeyword, getChangesByProduct, cronWeeklyPerformanceEmail, getAssignedCampaignComparison, getAdTypeBreakdown, getTimeBasedAnalytics } = require("../controllers/dashboard.controller");
const { getRecommendationsHub } = require("../controllers/recommendationsHub.controller");
const { getWasteAndScalingAlerts } = require("../controllers/wasteAndScaling.controller");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");

router.post("/getChangesByCampaign", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getChangesByCampaign);
router.post("/getChangesByKeyword", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getChangesByKeyword);
router.post("/getChangesByProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getChangesByProduct);
router.post("/recommendations-hub", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getRecommendationsHub);
router.post("/getAssignedCampaignComparison", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getAssignedCampaignComparison);
router.post("/getAdTypeBreakdown", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), getAdTypeBreakdown);
router.post("/getTimeBasedAnalytics", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTimeBasedAnalytics);
router.post("/getWasteAndScalingAlerts", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getWasteAndScalingAlerts);

router.get("/cronWeeklyPerformanceEmail", verifyToken, verifyCronAuth, cronWeeklyPerformanceEmail);

module.exports = router;
