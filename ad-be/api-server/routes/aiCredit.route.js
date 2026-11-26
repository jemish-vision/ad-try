const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");
const c = require("../controllers/aiCredit.controller");

// User panel: the signed-in user's organization wallet
router.post("/summary", verifyToken, c.getMyCredits);
router.post("/usage", verifyToken, c.getMyUsage);
router.post("/transactions", verifyToken, c.getMyTransactions);

// Buying credits (organization owner)
router.post("/packages", verifyToken, c.getCreditPackages);
router.post("/purchase", verifyToken, c.purchaseCredits);
router.post("/purchase/verify", verifyToken, c.verifyCreditPurchase);
router.post("/purchase/cancel", verifyToken, c.cancelCreditPurchase);
router.post("/payments", verifyToken, c.getMyPayments);

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
router.post("/admin/packages", verifyToken, requireSuperAdmin, c.adminListPackages);
router.post("/admin/packages/create", verifyToken, requireSuperAdmin, c.adminCreatePackage);
router.post("/admin/packages/update", verifyToken, requireSuperAdmin, c.adminUpdatePackage);
router.post("/admin/packages/delete", verifyToken, requireSuperAdmin, c.adminDeletePackage);
router.post("/admin/custom-pricing/update", verifyToken, requireSuperAdmin, c.adminUpdateCustomPricing);
router.post("/admin/payments", verifyToken, requireSuperAdmin, c.adminPayments);

module.exports = router;
