const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");
const { getAllBrandAnalytics, cronBrandAnalytics, getBrandAnalyticsFilters } = require("../controllers/brandAnalytics.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.get("/cronBrandAnalytics", verifyToken, verifyCronAuth, cronBrandAnalytics);

router.post("/getBrandAnalyticsFilters", verifyToken, validateRoutePermission(SYSTEM_PAGES.BRAND_ANALYTICS, PAGE_ACTIONS.VIEW_ONLY), getBrandAnalyticsFilters);
router.post("/getAllBrandAnalytics", verifyToken, validateRoutePermission(SYSTEM_PAGES.BRAND_ANALYTICS, PAGE_ACTIONS.VIEW_ONLY), getAllBrandAnalytics);

module.exports = router;