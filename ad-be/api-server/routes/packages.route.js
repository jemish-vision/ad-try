const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { getAllPackages, createPackages, changeStatusPackages, updatePackages, deletePackages, getSubscriptionHistory, getPackagePermissions, updatePackagePermissions } = require("../controllers/packages.controller");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");

router.post("/getAll", verifyToken, getAllPackages);

router.post("/create", verifyToken, requireSuperAdmin, createPackages);
router.post("/changeStatus", verifyToken, requireSuperAdmin, changeStatusPackages);
router.post("/update", verifyToken, requireSuperAdmin, updatePackages);
router.post("/delete", verifyToken, requireSuperAdmin, deletePackages);

router.post("/getSubscriptionHistory", verifyToken, requireSuperAdmin, getSubscriptionHistory);

router.post("/getPackagePermissions", verifyToken, requireSuperAdmin, getPackagePermissions);
router.post("/updatePackagePermissions", verifyToken, requireSuperAdmin, updatePackagePermissions);

module.exports = router;
