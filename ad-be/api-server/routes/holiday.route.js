const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const {
  getAllHolidays,
  createHolidays,
  updateHolidays,
  deleteHolidays,
  saveSpecialDaysReminder,
} = require("../controllers/holiday.controller");
const { verifyToken } = require("../middleware/user.auth");

router.post("/getAll", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.VIEW_ONLY), getAllHolidays);

router.post("/create", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.CREATE), createHolidays);
router.post("/update", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.UPDATE), updateHolidays);
router.post("/delete", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.REMOVE), deleteHolidays);

router.post("/saveSpecialDaysReminder", verifyToken, validateRoutePermission(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.UPDATE), saveSpecialDaysReminder);

module.exports = router;
