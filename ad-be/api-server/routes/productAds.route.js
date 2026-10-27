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
const { withAllAdTypes } = require("../helper/allAdTypeHandler");
const { verifyCronAuth } = require("../middleware/cron.auth");

// Product ads exist for all three ad types, so "All" merges SP + SB + SD here
// (nothing excluded). The single-type default sort is createdAt descending.
const allProductAds = withAllAdTypes(listProductAds, {
  dataKey: "getProductAds",
  totalKey: "totalRecords",
  totalRowKey: null,
  excludeSD: false,
  sortField: (body) => (body && body.sortType && body.fieldName) ? body.fieldName : "createdAt",
  pageNoKey: "currentPageNo",
  perPageKey: null,
  totalPagesKey: "totalPages",
});

router.post("/listProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_ADS, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, allProductAds);

router.post("/cronListProductAdsFromAmazon", verifyToken, verifyCronAuth, cronListProductAdsFromAmazon);
router.post("/saveProductAdsData", verifyToken, verifyCronAuth, saveProductAdsData);

router.get("/bulkUpdateProductAds", verifyToken, verifyCronAuth, bulkUpdateProductAds);

module.exports = router;
