const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");
const c = require("../controllers/aiCredit.controller");

// User panel: the signed-in user's organization wallet
router.post("/summary", verifyToken, c.getMyCredits);
router.post("/usage", verifyToken, c.getMyUsage);
router.post("/transactions", verifyToken, c.getMyTransactions);

// Super Admin
router.post("/admin/overview", verifyToken, requireSuperAdmin, c.adminOverview);
router.post("/admin/organizations", verifyToken, requireSuperAdmin, c.adminOrganizations);
router.post("/admin/organization", verifyToken, requireSuperAdmin, c.adminOrganizationDetail);
router.post("/admin/usage", verifyToken, requireSuperAdmin, c.adminUsage);
router.post("/admin/transactions", verifyToken, requireSuperAdmin, c.adminTransactions);
router.post("/admin/settings", verifyToken, requireSuperAdmin, c.adminGetSettings);
router.post("/admin/settings/update", verifyToken, requireSuperAdmin, c.adminUpdateSettings);
router.post("/admin/adjust", verifyToken, requireSuperAdmin, c.adminAdjustCredits);
router.post("/admin/monthly-limit", verifyToken, requireSuperAdmin, c.adminSetMonthlyLimit);

module.exports = router;
