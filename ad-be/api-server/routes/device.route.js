const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");
const { createToken, deleteToken } = require("../controllers/device.controller");

router.post("/createToken", verifyToken, createToken);
router.post("/deleteToken", verifyToken, deleteToken);

module.exports = router;
