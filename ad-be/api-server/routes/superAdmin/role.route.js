const express = require("express");
const router = express.Router();
const {
  getAllRoles,
  createRole,
  updateRole,
  updatePermission,
  deleteRole
} = require("../../controllers/superAdmin/role.controller");

const { verifyToken } = require("../../middleware/user.auth");
const { validateRoutePermission } = require("../../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../../constants/permissions");

router.post("/getAllRoles", verifyToken, validateRoutePermission(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.USERS, actionType: PAGE_ACTIONS.VIEW_ONLY }]), getAllRoles);
router.post("/createRole", verifyToken, validateRoutePermission(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.CREATE), createRole);
router.post("/updateRole", verifyToken, validateRoutePermission(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.UPDATE), updateRole);
router.post("/deleteRole", verifyToken, validateRoutePermission(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.REMOVE), deleteRole);
router.post("/updatePermission", verifyToken, validateRoutePermission(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.UPDATE), updatePermission);

module.exports = router;
