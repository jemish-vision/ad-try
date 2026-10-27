'use strict';

const SORT_FIELDS = new Set(['lastAskedAt', 'firstAskedAt', 'count']);
const REASONS = new Set(['unsupported', 'unanswered', 'error']);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const badRequest = message => Object.assign(new Error(message), { statusCode: 400 });

function scalar(query, key, fallback = '') {
  const value = query[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw badRequest(`${key} must be a string.`);
  return value.trim();
}

function integer(query, key, fallback, max) {
  const value = scalar(query, key, String(fallback));
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw badRequest(`${key} must be an integer between 1 and ${max}.`);
  }
  return Number(value);
}

function dateBoundary(value, key) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${key} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${key} must be a valid date.`);
  }
  return date;
}

function parseUnansweredQuestionQuery(query = {}) {
  const page = integer(query, 'page', 1, 100000);
  const pageSize = integer(query, 'pageSize', 10, 100);
  const search = scalar(query, 'search');
  const profileId = scalar(query, 'profileId');
  const reason = scalar(query, 'reason');
  const sortBy = scalar(query, 'sortBy', 'lastAskedAt');
  const sortOrder = scalar(query, 'sortOrder', 'desc');
  if (search.length > 200) throw badRequest('search must not exceed 200 characters.');
  if (profileId.length > 100) throw badRequest('profileId must not exceed 100 characters.');
  if (reason && !REASONS.has(reason)) throw badRequest('Invalid reason.');
  if (!SORT_FIELDS.has(sortBy)) throw badRequest('Invalid sortBy.');
  if (!['asc', 'desc'].includes(sortOrder)) throw badRequest('Invalid sortOrder.');
  let includeProfiles = false;
  if (query.includeProfiles !== undefined) {
    const raw = scalar(query, 'includeProfiles');
    if (!['true', 'false'].includes(raw)) throw badRequest('includeProfiles must be a boolean.');
    includeProfiles = raw === 'true';
  }
  const from = dateBoundary(scalar(query, 'fromDate'), 'fromDate');
  const to = dateBoundary(scalar(query, 'toDate'), 'toDate');
  if (from && to && from > to) throw badRequest('fromDate must be before or equal to toDate.');
  const match = {};
  if (profileId) match.profileId = profileId;
  if (reason) match.reason = reason;
  if (from || to) {
    match.lastAskedAt = {};
    if (from) match.lastAskedAt.$gte = from;
    if (to) match.lastAskedAt.$lt = new Date(to.getTime() + 86400000);
  }
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    match.$or = [{ question: expression }, { profileName: expression }, { profileId: expression }];
  }
  const direction = sortOrder === 'asc' ? 1 : -1;
  return { page, pageSize, match, sort: { [sortBy]: direction, _id: direction }, includeProfiles };
}

function parseProfileQuery(query = {}) {
  const page = integer(query, 'page', 1, 10000);
  const pageSize = integer(query, 'pageSize', 20, 100);
  const search = scalar(query, 'search');
  if (search.length > 100) throw badRequest('search must not exceed 100 characters.');
  return { page, pageSize, search };
}

function createUnansweredQuestionController({ model, profileModel } = {}) {
  return async (req, res) => {
    try {
      const { page, pageSize, match, sort, includeProfiles } = parseUnansweredQuestionQuery(req.query);
      const Question = model || require('../../models/unansweredQuestion.model');
      // Keep the indexed sort before the facet; only the selected page is materialized.
      const listing = Question.aggregate([
        { $match: match },
        { $sort: sort },
        { $facet: {
          data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }, { $project: {
            question: 1, questionTruncated: 1, profileId: 1, profileName: 1, reason: 1, count: 1,
            firstAskedAt: 1, lastAskedAt: 1, userId: 1, organizationId: 1,
          } }],
          total: [{ $count: 'count' }],
        } },
      ]).option({ maxTimeMS: 15000, allowDiskUse: true });

      let profilePromise = null;
      if (includeProfiles) {
        const Profile = profileModel || require('../../models/profiles.model');
        profilePromise = Profile.aggregate([
          { $match: { profileId: { $ne: null } } },
          { $group: {
            _id: { $toString: '$profileId' },
            profileName: { $first: '$name' },
          } },
          { $project: {
            _id: 0,
            profileId: '$_id',
            profileName: { $ifNull: ['$profileName', '$_id'] },
          } },
          { $sort: { profileName: 1 } },
          { $limit: 200 },
        ]).option({ maxTimeMS: 10000, allowDiskUse: true });
      }

      const [[result = {}], profileResult] = await Promise.all([listing, profilePromise]);
      const totalRecords = result.total?.[0]?.count || 0;
      const responsePayload = {
        isSuccess: true, data: result.data || [], totalRecords, page, pageSize,
        totalPages: Math.ceil(totalRecords / pageSize),
      };
      if (includeProfiles && Array.isArray(profileResult)) {
        responsePayload.profiles = profileResult;
        responsePayload.profilesTruncated = profileResult.length >= 200;
      }
      return res.status(200).json(responsePayload);
    } catch (error) {
      return res.status(error.statusCode === 400 ? 400 : 500).json({
        isSuccess: false,
        message: error.statusCode === 400 ? error.message : 'Unable to retrieve unanswered questions. Please try again.',
      });
    }
  };
}

function createUnansweredQuestionProfilesController({ profileModel } = {}) {
  return async (req, res) => {
    try {
      const { page, pageSize, search } = parseProfileQuery(req.query);
      const Profile = profileModel || require('../../models/profiles.model');
      const pipeline = [
        { $match: { profileId: { $ne: null } } },
        {
          $group: {
            _id: { $toString: '$profileId' },
            profileName: { $first: '$name' },
            isActive: { $first: '$isActive' },
          }
        },
        {
          $project: {
            _id: 0,
            profileId: '$_id',
            profileName: { $ifNull: ['$profileName', '$_id'] },
            isActive: 1,
          }
        },
      ];

      if (search) {
        const rx = new RegExp(escapeRegex(search), 'i');
        pipeline.push({
          $match: {
            $or: [
              { profileName: rx },
              { profileId: rx },
            ]
          }
        });
      }

      pipeline.push({
        $facet: {
          data: [
            { $sort: { profileName: 1 } },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
          ],
          total: [{ $count: 'count' }],
        }
      });

      const [result = {}] = await Profile.aggregate(pipeline).option({ maxTimeMS: 10000, allowDiskUse: true });
      const totalRecords = result.total?.[0]?.count || 0;
      const totalPages = Math.ceil(totalRecords / pageSize);
      return res.status(200).json({
        isSuccess: true,
        data: result.data || [],
        totalRecords,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      });
    } catch (error) {
      return res.status(error.statusCode === 400 ? 400 : 500).json({
        isSuccess: false,
        message: error.statusCode === 400 ? error.message : 'Unable to retrieve profiles.',
      });
    }
  };
}

module.exports = {
  createUnansweredQuestionController,
  createUnansweredQuestionProfilesController,
  parseUnansweredQuestionQuery,
  parseProfileQuery
};
