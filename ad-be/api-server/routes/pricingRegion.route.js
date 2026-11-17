const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");
const {
  getRegions,
  createRegion,
  updateRegion,
  changeRegionStatus,
  deleteRegion,
  getOrganizationBilling,
  updateOrganizationBilling,
  detectCountry,
  getPlanRegionPrices,
  updatePlanRegionPrices,
} = require("../controllers/pricingRegion.controller");

router.get("/detect", verifyToken, detectCountry);

router.post("/getAll", verifyToken, requireSuperAdmin, getRegions);
router.post("/create", verifyToken, requireSuperAdmin, createRegion);
router.post("/update", verifyToken, requireSuperAdmin, updateRegion);
router.post("/changeStatus", verifyToken, requireSuperAdmin, changeRegionStatus);
router.post("/delete", verifyToken, requireSuperAdmin, deleteRegion);
router.post("/plan-prices", verifyToken, requireSuperAdmin, getPlanRegionPrices);
router.post("/plan-prices/update", verifyToken, requireSuperAdmin, updatePlanRegionPrices);
router.post("/organizations", verifyToken, requireSuperAdmin, getOrganizationBilling);
router.post("/organizations/update", verifyToken, requireSuperAdmin, updateOrganizationBilling);

module.exports = router;
