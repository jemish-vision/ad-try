const express = require("express");
const router = express.Router();
const {
  registortUser,
  createUser,
  updateUser,
  updateProfile,
  updateProfileAccess,
  deleteUser,
  changePassword,
  saveTrialSubscription,
  createSubscription,
  forgotPassword,
  resetPassword,
  sendOtp,
  verifyOtp,
  cancelSubscription,
  inviteUser,
  getInvitationList,
  cancelInvitation,
  resendInvitation,
  checkInvitation,
  acceptInvitation,
  rejectInvitation,
  superAdminLoginAsUser,
  generate2fa,
  verifyAndEnable2fa,
  disable2fa,
  verifyPaymentSession,
} = require("../controllers/user.controller");

const { requireSuperAdmin } = require("../middleware/superAdmin.auth");
const { verifyToken } = require("../middleware/user.auth");
const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const { profileFileUpload } = require("../helper/profileFileUpload");

router.post("/superAdminLoginAsUser", verifyToken, requireSuperAdmin, superAdminLoginAsUser);
router.post("/createUser", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.CREATE), createUser);
router.post("/updateUser", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE), updateUser);
router.post("/updateProfileAccess", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE), updateProfileAccess);
router.post("/deleteUser", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.REMOVE), deleteUser);
router.post("/changePassword", verifyToken, changePassword);
router.post("/updateProfile", verifyToken, profileFileUpload, updateProfile);

router.post("/generate2fa", verifyToken, generate2fa);
router.post("/verifyAndEnable2fa", verifyToken, verifyAndEnable2fa);
router.post("/disable2fa", verifyToken, disable2fa);

router.post("/inviteUser", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.CREATE), inviteUser);
router.post("/getInvitationList", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.VIEW_ONLY), getInvitationList);
router.post("/cancelInvitation", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.UPDATE), cancelInvitation);
router.post("/resendInvitation", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.CREATE), resendInvitation);
router.get("/checkInvitation/:token", checkInvitation);
router.post("/acceptInvitation", verifyToken, acceptInvitation);
router.post("/rejectInvitation", rejectInvitation);

const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");

router.post("/registortUser", authLimiter, registortUser);
router.post("/sendOtp", otpLimiter, sendOtp);
router.post("/verifyOtp", otpLimiter, verifyOtp);
router.post("/forgotPassword", otpLimiter, forgotPassword);
router.post("/resetPassword", authLimiter, resetPassword);

router.post("/saveTrialSubscription", verifyToken, saveTrialSubscription);
router.post("/createSubscription", verifyToken, createSubscription);
router.post("/verifyPaymentSession", verifyToken, verifyPaymentSession);
router.post("/cancelSubscription", verifyToken, cancelSubscription);

module.exports = router;
