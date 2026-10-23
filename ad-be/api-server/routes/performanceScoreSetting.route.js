const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { getAllPerformanceScoreSetting, createPerformanceScoreSetting, updatePerformanceScoreSetting, deletePerformanceScoreSetting } = require("../controllers/performanceScoreSetting.controller");

router.post("/getAllPerformanceScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY), getAllPerformanceScoreSetting);

router.post("/createPerformanceScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE), createPerformanceScoreSetting);
router.post("/updatePerformanceScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE), updatePerformanceScoreSetting);
router.post("/deletePerformanceScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.REMOVE), deletePerformanceScoreSetting);

module.exports = router;
