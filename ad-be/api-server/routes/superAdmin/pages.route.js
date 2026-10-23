const express = require("express");
const router = express.Router();
const { verifyToken } = require("../../middleware/user.auth");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");
const { createPage, getAllPage, updatePage, removePage, statusChangePage } = require("../../controllers/superAdmin/pages.controller");

router.post("/getAll", verifyToken, requireSuperAdmin, getAllPage);

router.post("/create", verifyToken, requireSuperAdmin, createPage);
router.post("/update", verifyToken, requireSuperAdmin, updatePage);
router.post("/remove", verifyToken, requireSuperAdmin, removePage);
router.post("/statusChange", verifyToken, requireSuperAdmin, statusChangePage);

module.exports = router;
