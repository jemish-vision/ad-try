const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");

const {
    listInventory,
    cronGenerateInvetoryReport,
    cronGenerateSalesReport,
    getSalesDashboard,
    getSalesTrendGraph,
    getTopProductsGrid,
    getProductDecisionMatrix,
    getDashboardInsights,
    getInventoryList,
    getInventoryCards,
    getInventoryGraph,
    // Aging Tracker
    getAgingConfig,
    saveAgingConfig,
    getAgingCards,
    getAgingInventoryList,
    getASINInventorySettings,
    saveASINInventorySettings,
    deleteASINInventorySettings,
    getGlobalInventorySettings,
    saveGlobalInventorySettings,
    getInventoryForecastGrid,
    getInventoryForecastCards,
    getInventoryForecastGraphs,
    cronInventoryForecastAlerts,
    getWarehousePlanning,
    saveWarehousePlanning,
} = require("../controllers/inventory.controller");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.post("/getAll", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), listInventory);
router.post("/get-inventory-cards", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), getInventoryCards);
router.post("/get-inventory-graph", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), getInventoryGraph);
router.post("/get-inventory-grid", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), getInventoryList);

// Aging Tracker routes
router.post("/get-aging-config", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), getAgingConfig);
router.post("/save-aging-config", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.UPDATE), saveAgingConfig);
router.post("/get-aging-cards", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), getAgingCards);
router.post("/get-aging-grid", verifyToken, validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY), getAgingInventoryList);

router.post("/get-dashboard-cards", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getSalesDashboard);
router.post("/get-dashboard-graph", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getSalesTrendGraph);
router.post("/product-performance-matrix", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getProductDecisionMatrix);
router.post("/smart-insights", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getDashboardInsights);
router.post("/get-dashboard-grid", verifyToken, validateRoutePermission(SYSTEM_PAGES.DASHBOARD, PAGE_ACTIONS.VIEW_ONLY), AdTypeModels, getTopProductsGrid);

router.post("/get-ASIN-inventory-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), getASINInventorySettings)
router.post("/save-ASIN-inventory-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.UPDATE), saveASINInventorySettings)
router.post("/delete-ASIN-inventory-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.REMOVE), deleteASINInventorySettings)
router.post("/get-global-inventory-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), getGlobalInventorySettings)
router.post("/save-global-inventory-settings", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.UPDATE), saveGlobalInventorySettings)

router.post("/get-inventory-forecast-grid", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), getInventoryForecastGrid)
router.post("/get-inventory-forecast-cards", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), getInventoryForecastCards)
router.post("/get-inventory-forecast-graph", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), getInventoryForecastGraphs)

// Warehouse Planning routes
router.post("/get-warehouse-planning", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), getWarehousePlanning);
router.post("/save-warehouse-planning", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.UPDATE), saveWarehousePlanning);
router.post("/get-mfn-fba-recommendations", verifyToken, validateRoutePermission(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.VIEW_ONLY), require("../controllers/fcInventory.controller").getMfnToFbaRecommendations);

router.get("/cronGenerateInvetoryReport", verifyToken, verifyCronAuth, cronGenerateInvetoryReport);
router.get("/cronGenerateSalesReport", verifyToken, verifyCronAuth, cronGenerateSalesReport);
router.get("/cronInventoryForecastAlerts", verifyToken, verifyCronAuth, cronInventoryForecastAlerts);

module.exports = router;

