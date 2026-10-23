'use strict';

const {
  createSummaryService
} = require('../services/chatbotReporting.summary');
const {
  createReportService
} = require('../services/chatbotReporting.handlers');
const {
  createChatService
} = require('../services/chatbotReporting.chat');

function reportingController(reportService) {
  return async function getReport(req, res) {
    try {
      const report = await reportService(req.body, {
        userId: req.user?._id,
        configId: req.config?.configId,
        organizationId: req.organizationId
      });

      return res.status(200).json({
        isSuccess: true,
        data: report
      });
    } catch (error) {
      const known = [400, 401, 403, 422, 503].includes(error?.statusCode);

      return res.status(known ? error.statusCode : 500).json({
        isSuccess: false,
        error: {
          code: known && typeof error.code === 'string' ? error.code : 'REPORT_INTERNAL_ERROR',
          message: known ? error.message : 'The reporting request could not be completed'
        }
      });
    }
  };
}

function createSummaryController({
  summaryService = createSummaryService()
} = {}) {
  return reportingController(summaryService);
}

function createReportController({
  reportService = createReportService()
} = {}) {
  return reportingController(reportService);
}

function createChatController({
  chatService = createChatService()
} = {}) {
  return async function handleChat(req, res) {
    try {
      const profileIds = req.body?.profileIds || [];
      let activeProfile = req.body?.activeProfile;
      if (!activeProfile && profileIds.length) {
        try {
          const mongoose = require('mongoose');
          const p = await mongoose.connection.db?.collection('profiles').findOne({
            profileId: Number(profileIds[0]),
            isActive: true
          }, { projection: { profileId: 1, name: 1, currencyCode: 1, timezone: 1, countryCode: 1, type: 1 } });
          if (p) {
            activeProfile = {
              profileId: String(p.profileId),
              name: p.name,
              currencyCode: p.currencyCode,
              timezone: p.timezone,
              countryCode: p.countryCode,
              type: p.type
            };
          }
        } catch (_) {}
      }

      const result = await chatService(req.body, {
        userId: req.user?._id,
        configId: req.config?.configId,
        organizationId: req.organizationId,
        profileIds: req.body?.profileIds,
        activeProfile,
      });

      if (result.error) {
        return res.status(result.error.statusCode || 500).json({
          isSuccess: false,
          error: result.error,
          replyMessage: result.replyMessage,
        });
      }

      return res.status(200).json({
        isSuccess: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        isSuccess: false,
        error: {
          code: 'CHAT_INTERNAL_ERROR',
          message: 'An internal error occurred during chat processing',
        },
      });
    }
  };
}

module.exports = {
  createSummaryController,
  createReportController,
  createChatController,
};
