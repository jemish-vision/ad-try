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
  getDeletionQueueForSuperAdmin,
  toggleStopDataDeletionBySuperAdmin,
  getOrgDeletionProfilesForSuperAdmin,
  toggleProfileDataDeletionBySuperAdmin,
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
router.get("/superAdmin/getDeletionQueue", verifyToken, requireSuperAdmin, getDeletionQueueForSuperAdmin);
router.post("/superAdmin/getDeletionQueue", verifyToken, requireSuperAdmin, getDeletionQueueForSuperAdmin);
router.post("/superAdmin/toggleStopDataDeletion", verifyToken, requireSuperAdmin, toggleStopDataDeletionBySuperAdmin);

router.get("/superAdmin/getOrgDeletionProfiles", verifyToken, requireSuperAdmin, getOrgDeletionProfilesForSuperAdmin);
router.post("/superAdmin/getOrgDeletionProfiles", verifyToken, requireSuperAdmin, getOrgDeletionProfilesForSuperAdmin);
router.post("/superAdmin/toggleProfileDataDeletion", verifyToken, requireSuperAdmin, toggleProfileDataDeletionBySuperAdmin);

module.exports = router;

