const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const c = require("../controllers/aiKey.controller");

// AI API Keys: the organization's own provider keys (owner manages, everyone can see the status)
router.post("/", verifyToken, c.getKeys);
router.post("/save", verifyToken, c.saveKey);
router.post("/validate", verifyToken, c.validateKey);
router.post("/remove", verifyToken, c.removeKey);
router.post("/settings", verifyToken, c.updateSettings);

module.exports = router;
