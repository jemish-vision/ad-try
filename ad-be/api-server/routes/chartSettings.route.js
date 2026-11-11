const express = require("express");
const router = express.Router();
const customColumnsController = require("../controllers/customColumns.controller");
const { verifyToken } = require("../middleware/user.auth");

router.post("/getChartSettings", verifyToken, customColumnsController.getChartSettings);
router.post("/updateChartSettings", verifyToken, customColumnsController.updateChartSettings);

module.exports = router;
