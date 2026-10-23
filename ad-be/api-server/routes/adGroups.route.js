const express = require("express");
const { verifyToken } = require("../middleware/user.auth");
const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { cronListAdGroupsFromAmazon, getAdGroupsByCampaign, getProductAdsByAdGroup } = require('../controllers/adGroups.controller');
const router = express.Router();
const { verifyCronAuth } = require("../middleware/cron.auth");

router.get("/cronListAdGroupsFromAmazon", verifyToken, verifyCronAuth, cronListAdGroupsFromAmazon);
router.post("/getAdGroupsByCampaign/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getAdGroupsByCampaign);
router.post("/getProductAdsByAdGroup/:id", verifyToken, validateRoutePermission(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getProductAdsByAdGroup);

module.exports = router;
