const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/user.auth");
const { cronGenerateShipmentQueueReport, cronGenerateReimbursementReport, getAllShippingQueue, getShippingQueueDetails, getReimbursement, getProfileSetting, updateProfileSetting, cronReminderForReimbursement } = require("../controllers/reconciliationReimbursement.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");

router.get("/cronGenerateShipmentQueueReport", verifyToken, verifyCronAuth, cronGenerateShipmentQueueReport);
router.get("/cronGenerateReimbursementReport", verifyToken, verifyCronAuth, cronGenerateReimbursementReport);

router.post("/getAllShippingQueue", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.VIEW_ONLY), getAllShippingQueue);
router.post("/getShippingQueueDetails/:shippingId", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.VIEW_ONLY), getShippingQueueDetails);
router.post("/getReimbursement", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.VIEW_ONLY), getReimbursement);

router.post("/getNotificationStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.VIEW_ONLY), getProfileSetting);
router.post("/updateNotificationStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.UPDATE), updateProfileSetting);

router.get("/cronReminderForReimbursement", verifyToken, verifyCronAuth, cronReminderForReimbursement);

module.exports = router;
