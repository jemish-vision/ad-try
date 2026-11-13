const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { cronFetchCompetitorsFromAmazon, getCompetitorBrands, getCompetitorsData } = require("../controllers/products.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { getProductComparison, getFeesEstimate } = require("../controllers/competitorComparison.controller");
const { getAsinHistory, getHistorySettings, updateHistorySettings } = require("../controllers/competitorHistory.controller");

router.get("/cronFetchCompetitorsFromAmazon", verifyToken, verifyCronAuth, cronFetchCompetitorsFromAmazon);

router.post("/competitors/brands", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getCompetitorBrands);
router.post("/competitors/list", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getCompetitorsData);

// Read-only fee estimates (Product Fees API) for the comparison page
router.post("/fees-estimate", verifyToken, validateRoutePermission(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.VIEW_ONLY), getFeesEstimate);

// Read-only same-ASIN comparison: our offer vs other sellers / Buy Box (getCatalogItem + getItemOffers)
router.get("/:asin/compare", verifyToken, validateRoutePermission(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.VIEW_ONLY), getProductComparison);

// Competitor Price History — part of the Competitor Comparison page (Enterprise plans)
router.get("/history-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.VIEW_ONLY), getHistorySettings);
router.put("/history-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.UPDATE), updateHistorySettings);
router.get("/:asin/history", verifyToken, validateRoutePermission(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.VIEW_ONLY), getAsinHistory);

module.exports = router;
