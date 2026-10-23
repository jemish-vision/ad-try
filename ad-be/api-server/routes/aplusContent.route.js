const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { cronFetchAPlusContentFromAmazon, createAIAPlusContent, getAPlusContentByReferenceKey, submitAPlusContentForApproval, editAIAPlusContent, cronProcessPendingAPlusBatchJobs } = require("../controllers/aplusContent.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.get("/cronFetchAPlusContentFromAmazon", verifyToken, verifyCronAuth, cronFetchAPlusContentFromAmazon);
router.get("/cronProcessPendingAPlusBatchJobs", verifyToken, verifyCronAuth, cronProcessPendingAPlusBatchJobs);

router.post("/get", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getAPlusContentByReferenceKey);
router.post("/create", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.CREATE), createAIAPlusContent);
router.post("/edit", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), editAIAPlusContent);

router.post("/submitForApproval", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), submitAPlusContentForApproval);

module.exports = router;
