const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { cronFetchCompetitorsFromAmazon, getCompetitorBrands, getCompetitorsData } = require("../controllers/products.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { getProductComparison } = require("../controllers/competitorComparison.controller");

router.get("/cronFetchCompetitorsFromAmazon", verifyToken, verifyCronAuth, cronFetchCompetitorsFromAmazon);

router.post("/competitors/brands", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getCompetitorBrands);
router.post("/competitors/list", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getCompetitorsData);

// Read-only same-ASIN comparison: our offer vs other sellers / Buy Box (getCatalogItem + getItemOffers)
router.get("/:asin/compare", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getProductComparison);

module.exports = router;
