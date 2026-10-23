const express = require("express");
const router = express();
const { verifyToken } = require("../middleware/user.auth");
const {
  getAllCronJobHistory,
  changeStatus,
  changeStatusByProfile,
  getAllCronJobByProfile,
  manuallyRunCronJob,
  createMasterCronJob,
  updateMasterCronJob,
  getAllMarsterCronJob
} = require("../controllers/cronJob.controller");

const { SyncPastData } = require("../controllers/config.controller");
const { verifyCronAuth } = require("../middleware/cron.auth");
const { requireSuperAdmin } = require("../middleware/superAdmin.auth");
const { validateRoutePermission } = require("../middleware/routePermission");
const { SYSTEM_PAGES, PAGE_ACTIONS } = require("../constants/permissions");

router.post("/getAllCronJobHistory", verifyToken, validateRoutePermission(SYSTEM_PAGES.CRON_JOB_HISTORY, PAGE_ACTIONS.VIEW_ONLY), getAllCronJobHistory);
router.post("/changeStatus", verifyToken, validateRoutePermission(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.UPDATE), changeStatus);
router.post("/changeStatusByProfile", verifyToken, validateRoutePermission(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.UPDATE), changeStatusByProfile);
router.post("/getAllCronJobByProfile", verifyToken, validateRoutePermission(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.VIEW_ONLY), getAllCronJobByProfile);

router.post("/SyncPastData", verifyToken, verifyCronAuth, SyncPastData);

router.post("/manuallyRunCronJob", verifyToken, validateRoutePermission(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.VIEW_ONLY), manuallyRunCronJob);

router.post("/createMasterCronJob", verifyToken, requireSuperAdmin, createMasterCronJob);
router.post("/updateMasterCronJob", verifyToken, requireSuperAdmin, updateMasterCronJob);
router.post("/getAllMarsterCronJob", verifyToken, requireSuperAdmin, getAllMarsterCronJob);

module.exports = router;