const express = require("express");
const router = express.Router();
const {
  getUserOrganizations,
  createOrganization,
  selectOrganization,
  toggleFavoriteOrganization,
  getAllOrganizationsForSuperAdmin,
  updateOrganizationBySuperAdmin,
  updateOrganization,
  executeProfileSyncCron,
} = require("../controllers/organization.controller");
const { verifyToken } = require("../middleware/user.auth");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");

router.get("/list", verifyToken, getUserOrganizations);
router.post("/create", verifyToken, createOrganization);
router.post("/select", verifyToken, selectOrganization);
router.post("/toggleFavorite", verifyToken, toggleFavoriteOrganization);
router.post("/update", verifyToken, updateOrganization);

router.post("/superAdmin/getAll", verifyToken, requireSuperAdmin, getAllOrganizationsForSuperAdmin);
router.get("/superAdmin/getAll", verifyToken, requireSuperAdmin, getAllOrganizationsForSuperAdmin);
router.post("/superAdmin/update", verifyToken, requireSuperAdmin, updateOrganizationBySuperAdmin);
router.post("/superAdmin/executeProfileSyncCron", verifyToken, requireSuperAdmin, executeProfileSyncCron);

module.exports = router;

