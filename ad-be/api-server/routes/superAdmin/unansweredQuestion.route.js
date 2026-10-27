'use strict';

const express = require('express');
const {
  createUnansweredQuestionController,
  createUnansweredQuestionProfilesController,
} = require('../../controllers/superAdmin/unansweredQuestion.controller');

function createUnansweredQuestionRouter({ authenticate, authorize, controller, profilesController } = {}) {
  const router = express.Router();
  const auth = authenticate || require('../../middleware/user.auth').verifyToken;
  const admin = authorize || require('../../middleware/superAdmin.auth').requireSuperAdmin;

  router.get('/unanswered-questions', auth, admin, controller || createUnansweredQuestionController());
  router.get('/unanswered-questions/profiles', auth, admin, profilesController || createUnansweredQuestionProfilesController());

  return router;
}

module.exports = { createUnansweredQuestionRouter };
