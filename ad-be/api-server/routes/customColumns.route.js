const express = require("express");
const router = express.Router();
const customColumnsController = require("../controllers/customColumns.controller");
const { verifyToken } = require("../middleware/user.auth");

// Get columns configuration
router.post("/getColumns", verifyToken, customColumnsController.getCustomColumns);

// Update or insert configuration
router.post("/updateColumns", verifyToken, customColumnsController.updateCustomColumns);

module.exports = router;
