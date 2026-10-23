const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const {
  checkConnectAccount,
  addMarketPlaceConfig,
  amazonRedirect,
  amazonCallback,
  listProfiles,
  amazonDisconnect,
  amazonSPRedirect,
  amazonSPCallback,
  amazonSPRefreshToken,
  amazonSPDisconnect,
  manageSubscribeAMS,
  syncLast30Days,
  getAllMarketplaces,
  getRuleSettings,
  saveRuleSettings,
  cronDisconnectReminder,
  addToFavoriteProfile,
  getAmazonProfiles,
  saveAmazonProfiles,
  getReportDetails,
  getCoreGroups,
  saveSynchronizationDetails,
  getRetentionDays,
  getSyncRequests,
  executeSync,
  getProfileSyncDetails,
  updateProfileSyncSettings,
  initiateAmazonSellerAuth,
  linkExistingSellerConfig,
  confirmDeactivateProfile
} = require("../controllers/config.controller");
const express = require("express");
const { verifyToken } = require("../middleware/user.auth");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { cronDeleteExpiredAccountsData } = require("../services/accountDataCleanup.service");
const router = express.Router();

router.get("/getAmazonProfiles", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY), getAmazonProfiles);
router.post("/saveAmazonProfiles", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE), saveAmazonProfiles);

router.get("/listProfiles", verifyToken, listProfiles);

router.post("/addToFavoriteProfile", verifyToken, addToFavoriteProfile);

router.post("/checkConnectAccount", verifyToken, checkConnectAccount);

router.get("/addMarketPlaceConfig", addMarketPlaceConfig);
router.get("/getAllMarketplaces", verifyToken, getAllMarketplaces);

router.post("/initiateAmazonSellerAuth", verifyToken, initiateAmazonSellerAuth);
router.post("/amazonRedirect", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.UPDATE }]), amazonRedirect);
router.get("/amazonCallback", amazonCallback);
router.post("/amazonDisconnect", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.REMOVE }]), amazonDisconnect);

router.post("/syncLast30Days", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE), syncLast30Days);

router.post("/amazonSPRedirect", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.UPDATE }]), amazonSPRedirect);
router.get("/amazonSPCallback", amazonSPCallback);
router.post("/amazonSPRefreshToken", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.CREATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.UPDATE }]), amazonSPRefreshToken);
router.post("/amazonSPDisconnect", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE, [{ pageName: SYSTEM_PAGES.SETTINGS, actionType: PAGE_ACTIONS.REMOVE }]), amazonSPDisconnect);

router.post("/manageSubscribeAMS", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE), manageSubscribeAMS);

router.post("/getRuleSettings", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY), getRuleSettings);
router.post("/saveRuleSettings", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE), saveRuleSettings);

router.get("/cronDisconnectReminder", verifyToken, verifyCronAuth, cronDisconnectReminder);
router.get("/cronDeleteExpiredAccountsData", verifyToken, verifyCronAuth, cronDeleteExpiredAccountsData);

router.get("/getReportDetails", verifyToken, getReportDetails);
router.get("/getCoreGroups", verifyToken, getCoreGroups);
router.get("/getRetentionDays", verifyToken, getRetentionDays);
router.get("/getSyncRequests", verifyToken, getSyncRequests);
router.post("/saveSynchronizationDetails", verifyToken, saveSynchronizationDetails);
router.post("/executeSync", verifyToken, executeSync);
router.get("/getProfileSyncDetails", verifyToken, getProfileSyncDetails);
router.post("/updateProfileSyncSettings", verifyToken, updateProfileSyncSettings);
router.post("/linkExistingSellerConfig", verifyToken, linkExistingSellerConfig);
router.post("/confirmDeactivateProfile", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.REMOVE), confirmDeactivateProfile);

module.exports = router;
