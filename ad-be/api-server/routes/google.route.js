const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/user.auth");
const {
    login,
    callBackGoogleAuth,
    disconnectGoogleAccount,
    getSheetLink,
    loginWithGoogle,
    generateToken,
    cronBestPerformerGoogleReportGenerate
} = require("../controllers/google.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { authLimiter } = require("../middleware/rateLimiter");

router.post("/getSheetLink", verifyToken, getSheetLink);

router.get("/login", verifyToken, login);
router.get("/loginWithGoogle", authLimiter, loginWithGoogle);
router.get("/callBackGoogleAuth", callBackGoogleAuth);
router.post("/generateToken", authLimiter, generateToken);

router.get("/disconnect", verifyToken, disconnectGoogleAccount);

router.get("/cronBestPerformerGoogleReportGenerate", verifyToken, verifyCronAuth, cronBestPerformerGoogleReportGenerate);

module.exports = router;
