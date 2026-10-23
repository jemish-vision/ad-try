const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { getAuditLog } = require("../controllers/auditLog.controller");

router.post("/get", verifyToken, validateRoutePermission(SYSTEM_PAGES.AUDIT_LOG, PAGE_ACTIONS.VIEW_ONLY), getAuditLog);

module.exports = router;
