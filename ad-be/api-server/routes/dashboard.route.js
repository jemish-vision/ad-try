const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { getChangesByCampaign, getChangesByKeyword, getChangesByProduct, cronWeeklyPerformanceEmail } = require("../controllers/dashboard.controller");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");

router.post("/getChangesByCampaign", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getChangesByCampaign);
router.post("/getChangesByKeyword", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getChangesByKeyword);
router.post("/getChangesByProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getChangesByProduct);

router.get("/cronWeeklyPerformanceEmail", verifyToken, verifyCronAuth, cronWeeklyPerformanceEmail);

module.exports = router;
