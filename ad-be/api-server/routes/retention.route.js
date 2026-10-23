const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const {
  getAllRetention,
  createRetention,
  updateRetention,
  deleteRetention,
  changeStatusRetention,
} = require("../controllers/retention.controller");

// Retention routes (Protected by verifyToken)
router.post("/getAllRetention", verifyToken, getAllRetention);
router.post("/getAll", verifyToken, getAllRetention);

router.post("/createRetention", verifyToken, createRetention);
router.post("/create", verifyToken, createRetention);

router.post("/updateRetention", verifyToken, updateRetention);
router.post("/update", verifyToken, updateRetention);

router.post("/deleteRetention", verifyToken, deleteRetention);
router.post("/delete", verifyToken, deleteRetention);

router.post("/changeStatusRetention", verifyToken, changeStatusRetention);
router.post("/changeStatus", verifyToken, changeStatusRetention);

module.exports = router;
//validateRoutePermission(SYSTEM_PAGES.RETENTION, PAGE_ACTIONS.UPDATE),