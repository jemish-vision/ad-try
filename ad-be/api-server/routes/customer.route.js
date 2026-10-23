const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const {
  login,
  getProfile,
  getFilter,
  saveFilter,
  deleteFilter,
  getCampaignAndAdGroupAutoSearch,
  getadsNotification,
  readAdsNotification,
  readAllAdsNotification,
  getAllUsers,
  getAllConfigs,
  getAllSellerConfigs,
  customChatBot,
  createSupportTicket,
  getSupportTicket,
  sendSupportTicketMessage,
  getUserTickets,
  siteTourCompleted,
  fileUpload,
  getCampaignAndAdGroup,
  savePageFilter,
  getPageFilter,
  verify2faLogin,
  send2faEmailOtp,
  verify2faEmailOtp
} = require("../controllers/customer.controller");
const { verifyToken } = require("../middleware/user.auth");
const { supportFileUpload } = require("../helper/supportFileUpload");
const { AdTypeModels } = require("../middleware/adTypeModel.middleware");
const { authLimiter, chatbotLimiter, ticketLimiter } = require("../middleware/rateLimiter");
const {
  getChatSessions,
  saveChatSession,
  deleteChatSession,
  clearChatSessions,
  renameChatSession,
  migrateChatSessions,
} = require("../controllers/chatSession.controller");

router.post("/login", authLimiter, login);
router.post("/verify2faLogin", authLimiter, verify2faLogin);
router.post("/send2faEmailOtp", authLimiter, send2faEmailOtp);
router.post("/verify2faEmailOtp", authLimiter, verify2faEmailOtp);
router.post("/siteTourCompleted", verifyToken, siteTourCompleted);
router.get("/getProfile", verifyToken, getProfile);
router.post("/getFilter", verifyToken, getFilter);
router.post("/saveFilter", verifyToken, saveFilter);
router.post("/deleteFilter", verifyToken, deleteFilter);
router.post("/savePageFilter", verifyToken, savePageFilter);
router.post("/getPageFilter", verifyToken, getPageFilter);
router.post("/getCampaignAndAdGroupAutoSearch", verifyToken, AdTypeModels, getCampaignAndAdGroupAutoSearch);
router.post("/getCampaignAndAdGroup", verifyToken, AdTypeModels, getCampaignAndAdGroup);

router.post("/get-all-users", verifyToken, validateRoutePermission(SYSTEM_PAGES.USERS, PAGE_ACTIONS.VIEW_ONLY), getAllUsers)
router.post("/get-all-config", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.USERS, actionType: PAGE_ACTIONS.VIEW_ONLY }]), getAllConfigs)
router.post("/get-all-sellerConfig", verifyToken, validateRoutePermission(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY, [{ pageName: SYSTEM_PAGES.USERS, actionType: PAGE_ACTIONS.VIEW_ONLY }]), getAllSellerConfigs)

router.post("/getadsNotification", verifyToken, getadsNotification)
router.post("/readAdsNotification", verifyToken, readAdsNotification)
router.post("/reaAllAdsNotification", verifyToken, readAllAdsNotification)

router.post("/chatbot", verifyToken, customChatBot);
router.post("/createSupportTicket", ticketLimiter, verifyToken, createSupportTicket);
router.post("/getSupportTicket", verifyToken, getSupportTicket);
router.post("/sendSupportTicketMessage", ticketLimiter, verifyToken, sendSupportTicketMessage);
router.post("/getUserTickets", verifyToken, getUserTickets);
router.post("/fileUpload", verifyToken, supportFileUpload, fileUpload);

// AI Assistant Chat Sessions Backend Management
router.post("/getChatSessions", verifyToken, validateRoutePermission(SYSTEM_PAGES.AI_ASSISTANT, PAGE_ACTIONS.VIEW_ONLY), getChatSessions);
router.post("/saveChatSession", verifyToken, saveChatSession);
router.post("/deleteChatSession", verifyToken, validateRoutePermission(SYSTEM_PAGES.AI_ASSISTANT, PAGE_ACTIONS.REMOVE), deleteChatSession);
router.post("/clearChatSessions", verifyToken, validateRoutePermission(SYSTEM_PAGES.AI_ASSISTANT, PAGE_ACTIONS.REMOVE), clearChatSessions);
router.post("/renameChatSession", verifyToken, validateRoutePermission(SYSTEM_PAGES.AI_ASSISTANT, PAGE_ACTIONS.UPDATE), renameChatSession);
router.post("/migrateChatSessions", verifyToken, validateRoutePermission(SYSTEM_PAGES.AI_ASSISTANT, PAGE_ACTIONS.UPDATE), migrateChatSessions);

module.exports = router;
