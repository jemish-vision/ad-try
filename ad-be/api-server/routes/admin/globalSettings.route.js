const express = require("express");
const router = express.Router();
const {
  getGlobalSettings,
  updateMaintenanceMode,
} = require("../../controllers/admin/globalSettings.controller");
const { verifyToken } = require("../../middleware/user.auth");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");

router.get("/", verifyToken, getGlobalSettings);
router.put("/maintenance-mode", verifyToken, requireSuperAdmin, updateMaintenanceMode);

module.exports = router;
