const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const dealsController = require("../controllers/deals.controller");
const { verifyToken } = require("../middleware/user.auth");

router.get("/stats", verifyToken, validateRoutePermission(SYSTEM_PAGES.DEALS, PAGE_ACTIONS.VIEW_ONLY), dealsController.getDealsDashboardStats);
router.get("/list", verifyToken, validateRoutePermission(SYSTEM_PAGES.DEALS, PAGE_ACTIONS.VIEW_ONLY), dealsController.getDealsList);


module.exports = router;
