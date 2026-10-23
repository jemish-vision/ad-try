const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { cronListCouponFromAmazon, listCouponsGrid } = require("../controllers/coupon.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.get("/cronListCouponFromAmazon", verifyToken, verifyCronAuth, cronListCouponFromAmazon);

router.post("/getAll", verifyToken, validateRoutePermission(SYSTEM_PAGES.COUPONS, PAGE_ACTIONS.VIEW_ONLY), listCouponsGrid);

module.exports = router;
