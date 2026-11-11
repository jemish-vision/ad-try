const express = require("express");
const router = express.Router();
const {
  getSuperAdminProfile,
} = require("../../controllers/superAdmin/superAdmin.controller");
const {
  getSystemDiagnostic,
  drainStagedBatches,
  get15DayReconciliation,
} = require("../../controllers/superAdmin/systemDiagnostic.controller");
const { verifyToken } = require("../../middleware/user.auth");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");
const { createUnansweredQuestionRouter } = require("./unansweredQuestion.route");

router.use(createUnansweredQuestionRouter());

router.get(
  "/getSuperAdminProfile",
  verifyToken,
  requireSuperAdmin,
  getSuperAdminProfile
);

router.get(
  "/system-diagnostic",
  verifyToken,
  requireSuperAdmin,
  getSystemDiagnostic
);

router.get(
  "/system-diagnostic/reconciliation-15days",
  verifyToken,
  requireSuperAdmin,
  get15DayReconciliation
);

router.post(
  "/system-diagnostic/drain-staged",
  verifyToken,
  requireSuperAdmin,
  drainStagedBatches
);

module.exports = router;
