const express = require("express");
const router = express.Router();
const {
} = require("../../controllers/customer.controller");
const { verifyToken } = require("../../middleware/user.auth");
const { getAllRuleBlockedTimes, createRuleBlockedTime, updateRuleBlockedTime, deleteRuleBlockedTime } = require("../../controllers/superAdmin/ruleBlockedTime.controller");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");

router.post("/get-all-rule-blocked-times", verifyToken, requireSuperAdmin, getAllRuleBlockedTimes);

router.post("/createRuleBlockedTime", verifyToken, requireSuperAdmin, createRuleBlockedTime);
router.post("/updateRuleBlockedTime", verifyToken, requireSuperAdmin, updateRuleBlockedTime);
router.post("/deleteRuleBlockedTime", verifyToken, requireSuperAdmin, deleteRuleBlockedTime);

module.exports = router;
