const express = require("express");
const router = express.Router();

const {
  asanaCallback,
  fetchAllUsers,
  getAllUsers,
  addWebhook,
  handleWebhook,
  assignSupportUser
} = require("../controllers/asana.controller");
const { verifyToken } = require("../middleware/user.auth");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");

router.get("/callback", asanaCallback);

router.get("/addWebhook", addWebhook);
router.post("/handleWebhook", handleWebhook);

router.post("/fetchAllUsers", verifyToken, requireSuperAdmin, fetchAllUsers);
router.post("/getAllUsers", verifyToken, requireSuperAdmin, getAllUsers);
router.post("/assignSupportUser", verifyToken, requireSuperAdmin, assignSupportUser);

module.exports = router;
