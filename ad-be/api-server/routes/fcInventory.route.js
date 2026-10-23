const express = require("express");
const router = express.Router();

const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const { verifyToken } = require("../middleware/user.auth");
const { verifyCronAuth } = require("../middleware/cron.auth");

const {
  cronGenerateFcInventoryLedgerReport,
  cronGenerateFcStorageFeeReport,
  getFcInventoryCards,
  getFcGeoDistribution,
  getFcInventoryGrid,
  getFcStorageFees,
  syncFcStorageFees,
  getFcList,
  getWarehouseMasterList,
  saveWarehouseLocation,
  getFcSkuMatrix,
  getMfnToFbaRecommendations,
} = require("../controllers/fcInventory.controller");

router.post(
  "/get-sku-fc-matrix",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getFcSkuMatrix
);

router.post(
  "/get-mfn-fba-recommendations",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getMfnToFbaRecommendations
);

// ─── Frontend REST APIs ───────────────────────────────────────────────────────
router.post(
  "/get-fc-cards",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getFcInventoryCards
);

router.post(
  "/get-fc-geo-distribution",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getFcGeoDistribution
);

router.post(
  "/get-fc-grid",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getFcInventoryGrid
);

router.post(
  "/get-fc-storage-fees",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getFcStorageFees
);

router.post(
  "/sync-fc-storage-fees",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.UPDATE),
  syncFcStorageFees
);

router.post(
  "/get-fc-list",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getFcList
);

router.post(
  "/warehouse-master-list",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.VIEW_ONLY),
  getWarehouseMasterList
);

router.post(
  "/save-warehouse-location",
  verifyToken,
  validateRoutePermission(SYSTEM_PAGES.INVENTORY, PAGE_ACTIONS.UPDATE),
  saveWarehouseLocation
);

// ─── Background / Cron Trigger Endpoints ─────────────────────────────────────
router.get(
  "/cronGenerateFcInventoryLedgerReport",
  verifyToken,
  verifyCronAuth,
  cronGenerateFcInventoryLedgerReport
);

router.get(
  "/cronGenerateFcStorageFeeReport",
  verifyToken,
  verifyCronAuth,
  cronGenerateFcStorageFeeReport
);

module.exports = router;
