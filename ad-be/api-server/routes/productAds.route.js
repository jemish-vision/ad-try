const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const {
  listProductAds,
  cronListProductAdsFromAmazon,
  saveProductAdsData,
  bulkUpdateProductAds
} = require("../controllers/productAds.controller");

const validation = require("../validation/productAds.validation");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.post("/listProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_ADS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, listProductAds);

router.post("/cronListProductAdsFromAmazon", verifyToken, verifyCronAuth, cronListProductAdsFromAmazon);
router.post("/saveProductAdsData", verifyToken, verifyCronAuth, saveProductAdsData);

router.get("/bulkUpdateProductAds", verifyToken, verifyCronAuth, bulkUpdateProductAds);

module.exports = router;
