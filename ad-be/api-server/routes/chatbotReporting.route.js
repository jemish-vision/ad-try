'use strict';

const express = require('express');
const {
  createSummaryController,
  createReportController,
  createChatController,
} = require('../controllers/chatbotReporting.controller');

function createSummaryRouter({
  authenticate,
  limiter,
  controller,
  queryController,
  chatController,
} = {}) {
  const router = express.Router();
  const auth = authenticate || require('../middleware/user.auth').verifyToken;
  const rateLimit = limiter || require('../middleware/rateLimiter').chatbotLimiter;
  router.post('/summary', auth, rateLimit, controller || createSummaryController());
  router.post('/query', auth, rateLimit, queryController || createReportController());
  router.post('/chat', auth, rateLimit, chatController || createChatController());

  return router;
}

module.exports = {
  createSummaryRouter,
};
