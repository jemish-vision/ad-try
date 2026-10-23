const express = require("express");
const router = express.Router();
const {
  getAdminPermission,
  updateCustomerPermission,
  getCustomerPermissions,
  updateCustomerPermissions
} = require("../../controllers/superAdmin/permission.controller");
const { verifyToken } = require("../../middleware/user.auth");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");
const { validateRoutePermission } = require("../../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../../constants/permissions");

router.get("/getAdminPermission", verifyToken, getAdminPermission);
router.post("/updateCustomerPermission", verifyToken, requireSuperAdmin, updateCustomerPermission);
router.post("/getCustomerPermissions", verifyToken, validateRoutePermission(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.VIEW_ONLY), getCustomerPermissions);
router.post("/updateCustomerPermissions", verifyToken, requireSuperAdmin, updateCustomerPermissions);

module.exports = router;
