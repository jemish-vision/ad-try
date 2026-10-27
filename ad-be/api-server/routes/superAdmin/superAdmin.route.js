const express = require("express");
const router = express.Router();
const {
  getSuperAdminProfile
} = require("../../controllers/superAdmin/superAdmin.controller");
const { verifyToken } = require("../../middleware/user.auth");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");
const { createUnansweredQuestionRouter } = require('./unansweredQuestion.route');

router.use(createUnansweredQuestionRouter());

router.get(
  "/getSuperAdminProfile",
  verifyToken,
  requireSuperAdmin,
  getSuperAdminProfile
);

module.exports = router;
