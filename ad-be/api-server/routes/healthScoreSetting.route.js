const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { getAllHealthScoreSetting, createHealthScoreSetting, updateHealthScoreSetting, deleteHealthScoreSetting } = require("../controllers/healthScoreSetting.controller");

router.post("/getAllHealthScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY), getAllHealthScoreSetting);

router.post("/createHealthScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE), createHealthScoreSetting);
router.post("/updateHealthScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE), updateHealthScoreSetting);
router.post("/deleteHealthScoreSetting", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.REMOVE), deleteHealthScoreSetting);

module.exports = router;
