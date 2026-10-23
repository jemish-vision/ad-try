const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { createDayparting, getAllDayparting, statusChangeDayparting, deleteDayparting, updateDayparting, cronDaypartingRule, ruleHistory, exportDaypartingRule, importDaypartingRule } = require("../controllers/daypartingstretegy.controller");
const { uploadExcelFile } = require("../helper/excelFileUpload");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.post("/getAll", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.VIEW_ONLY), getAllDayparting);

router.post("/create", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.CREATE), createDayparting);

router.post("/update", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.UPDATE), updateDayparting);
router.post("/statusChange", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.UPDATE), statusChangeDayparting);

router.post("/delete", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.REMOVE), deleteDayparting);

router.post("/cronDaypartingRule", verifyToken, verifyCronAuth, cronDaypartingRule);
router.post("/ruleHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING_HISTORY, PAGE_ACTIONS.VIEW_ONLY), ruleHistory);

router.post("/exportDaypartingRule", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.UPDATE), exportDaypartingRule);
router.post("/importDaypartingRule", uploadExcelFile, verifyToken, validateRoutePermission(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING, PAGE_ACTIONS.CREATE), importDaypartingRule);

module.exports = router;
