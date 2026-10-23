const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { cronGenerateTransactionsReport } = require("../controllers/transactions.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.get("/cronGenerateTransactionsReport", verifyToken, verifyCronAuth, cronGenerateTransactionsReport);

module.exports = router;
