const express = require("express");
const router = express.Router();
const {
} = require("../../controllers/customer.controller");
const { verifyToken } = require("../../middleware/user.auth");
const { supportTicketList, closeSupportTicket } = require("../../controllers/superAdmin/support.controller");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");

router.post("/supportTicketList", verifyToken, requireSuperAdmin, supportTicketList);
router.post("/closeSupportTicket", verifyToken, requireSuperAdmin, closeSupportTicket);

module.exports = router;
