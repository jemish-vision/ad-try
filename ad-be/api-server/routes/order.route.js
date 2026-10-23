const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");
const {
  getSPProduct,
  changeProductSetting,
  createProduct,
  generateProduct,
  AddProduct,
  getProductTypes,
  getProductDefinition,
  fileUpload,
  checkASIN,
  productSearchOnAmazon,
  parseFields,
  cronGenerateOrderReport,
  checkASINFromDB,
  updateProductPrice,
  bulkUpdateProductPrice,
  toggleProductFavorite,
  analyzeListingWithAI,
  applyListingOptimization,
  getListofCompetitorsProduct,
  cronGenerateRefundReport,
  refundGraphData,
  getRefundFilterDropdowns,
  refundGridData,
  cronGenerateOrderListing,
  getAllOrders,
  getOrderReport,
  getStateWiseOrderCount,
} = require("../controllers/order.controller");
const { uploadProductFiles } = require("../helper/fileUpload");
const { singleFileUpload } = require("../helper/singleFileUpload");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.post("/createProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.CREATE), uploadProductFiles, createProduct);
router.post("/fileUpload", verifyToken, singleFileUpload, fileUpload);

router.post("/generateProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.CREATE), generateProduct);
router.post("/AddProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.CREATE), AddProduct);
router.post("/updateProductPrice", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), updateProductPrice);
router.post("/bulkUpdateProductPrice", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), bulkUpdateProductPrice);
router.post("/toggleProductFavorite", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), toggleProductFavorite);

router.post("/getSPProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getSPProduct);

router.post("/changeProductSetting/:productId", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), changeProductSetting);

router.post("/getProductTypes", verifyToken, getProductTypes);
router.post("/getProductDefinition", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getProductDefinition);
router.post("/checkASIN", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), checkASIN);
router.post("/productSearchOnAmazon", verifyToken, productSearchOnAmazon);
router.post("/parseFields", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), parseFields);

router.post("/checkASINFromDB", verifyToken, checkASINFromDB);

router.post("/analyzeListingWithAI", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), analyzeListingWithAI);
router.post("/applyListingOptimization", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE), applyListingOptimization);

router.get("/cronGenerateOrderReport", verifyToken, verifyCronAuth, cronGenerateOrderReport);
router.get("/cronGenerateRefundReport", verifyToken, verifyCronAuth, cronGenerateRefundReport);

router.post("/refund-graph", verifyToken, validateRoutePermission(SYSTEM_PAGES.RETURNS_AND_REFUNDS, PAGE_ACTIONS.VIEW_ONLY), refundGraphData);
router.post("/refund-filter-dropdowns", verifyToken, validateRoutePermission(SYSTEM_PAGES.RETURNS_AND_REFUNDS, PAGE_ACTIONS.VIEW_ONLY), getRefundFilterDropdowns);
router.post("/refund-grid", verifyToken, validateRoutePermission(SYSTEM_PAGES.RETURNS_AND_REFUNDS, PAGE_ACTIONS.VIEW_ONLY), refundGridData);

router.post("/getListofCompetitorsProduct", verifyToken, validateRoutePermission(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY), getListofCompetitorsProduct);

router.get("/cronGenerateOrderListing", verifyToken, verifyCronAuth, cronGenerateOrderListing);

router.post("/getAllOrders", verifyToken, validateRoutePermission(SYSTEM_PAGES.ORDERS, PAGE_ACTIONS.VIEW_ONLY), getAllOrders);
router.post("/getOrderReport", verifyToken, validateRoutePermission(SYSTEM_PAGES.ORDER_REPORT, PAGE_ACTIONS.VIEW_ONLY), getOrderReport);
router.post("/getStateWiseOrderCount", verifyToken, validateRoutePermission(SYSTEM_PAGES.ORDER_REPORT, PAGE_ACTIONS.VIEW_ONLY), getStateWiseOrderCount);

module.exports = router;
