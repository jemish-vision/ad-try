'use strict';

const mongoose = require('mongoose');
const { write_logs } = require('../../winston/utility/logger');
const AuditLog = require('../models/auditLog.model');
const { catalog, events } = require('../constants/auditEvents');
const { getAuditAccess, validId } = require('../helpers/auditScope');
const { sanitizeAuditValue } = require('../helpers/auditHelper');
const eventSet = new Set(events);
const allowedOutcomes = new Set(['SUCCESS', 'FAILURE', 'PARTIAL', 'PENDING', 'DENIED']);
const allowedActors = new Set(['user', 'system', 'integration', 'anonymous']);
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getAuditEvents = (req, res) => res.status(200).json({ isSuccess: true, data: catalog });

exports.getAuditLog = async (req, res) => {
  try {
    const input = { ...(req.body || {}) };
    if (input.actorId && input.userId && String(input.actorId) !== String(input.userId)) return res.status(400).json({ isSuccess: false, message: 'Invalid audit actor filter' });
    if (input.actorId) input.userId = input.actorId;
    const pageNo = Number(input.pageNo ?? 1);
    const perPage = Number(input.perPage ?? 50);
    const sortType = Number(input.sortType ?? -1);
    const scope = input.scope || 'mine';
    const invalid = () => res.status(400).json({ isSuccess: false, message: 'Invalid audit log filters' });
    if (!Number.isSafeInteger(pageNo) || pageNo < 1 || pageNo > 1000000 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 200 || ![-1, 1].includes(sortType) || !['mine', 'organization'].includes(scope)) return invalid();
    for (const field of ['organizationId', 'userId', 'configId', 'sellerConfigId']) {
      if (input[field] != null && input[field] !== '' && !validId(input[field])) return invalid();
    }
    if (input.organizationId && String(input.organizationId) !== String(req.organizationId || '')) return res.status(403).json({ isSuccess: false, message: 'Audit organization access denied' });
    const access = await getAuditAccess(req);
    if (!access.allowed || (scope === 'organization' && (!access.organizationId || !access.canViewOrganization))) return res.status(403).json({ isSuccess: false, message: 'Audit organization access denied' });
    if (scope === 'mine' && input.userId && String(input.userId) !== String(access.userId)) return res.status(403).json({ isSuccess: false, message: 'Audit actor access denied' });
    const objectId = value => new mongoose.Types.ObjectId(String(value));
    // A null organization matches only legacy/unscoped rows for this actor.
    // Legacy ownership is never inferred into a selected organization's history.
    const query = { organizationId: access.organizationId ? objectId(access.organizationId) : null };
    if (scope === 'mine' || input.userId) query.userId = objectId(scope === 'mine' ? access.userId : input.userId);
    const asList = value => Array.isArray(value) ? value : value ? [value] : [];
    const eventFilter = asList(input.event);
    if (eventFilter.length > events.length || eventFilter.some(event => !eventSet.has(event))) return invalid();
    if (eventFilter.length) query.event = { $in: eventFilter };
    for (const [name, allowed] of [['actorType', allowedActors], ['outcome', allowedOutcomes]]) {
      const values = asList(input[name]).map(value => name === 'outcome' && typeof value === 'string' ? value.toUpperCase().replace(/^FAILED$/, 'FAILURE') : value);
      if (values.some(value => !allowed.has(value))) return invalid();
      if (values.length) query[name] = { $in: values };
    }
    for (const field of ['configId', 'sellerConfigId']) if (input[field]) query[field] = objectId(input[field]);
    if (input.profileId != null && input.profileId !== '') {
      if (!/^\d{1,32}$/.test(String(input.profileId))) return invalid();
      query.profileId = String(input.profileId);
    }
    for (const field of ['resourceType', 'resourceId', 'operationId']) {
      if (input[field] != null && input[field] !== '') {
        if (typeof input[field] !== 'string' || input[field].length > (field === 'resourceType' ? 100 : 200)) return invalid();
        query[field] = input[field];
      }
    }
    for (const [field, bound] of [['fromDate', '$gte'], ['toDate', '$lte']]) {
      if (!input[field]) continue;
      if (typeof input[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input[field])) return invalid();
      const date = new Date(`${input[field]}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input[field]) return invalid();
      if (field === 'toDate') date.setUTCHours(23, 59, 59, 999);
      query.createdAt = { ...query.createdAt, [bound]: date };
    }
    if (query.createdAt?.$gte && query.createdAt?.$lte && query.createdAt.$gte > query.createdAt.$lte) return invalid();
    if (input.search) {
      if (typeof input.search !== 'string' || input.search.length > 200) return invalid();
      const regex = new RegExp(escaped(input.search.trim()), 'i');
      query.$or = [{ message: { $regex: regex } }, { event: { $regex: regex } }];
    }
    const result = await AuditLog.aggregate([
      { $match: query },
      { $facet: {
        data: [
          { $sort: { createdAt: sortType, _id: sortType } },
          { $skip: (pageNo - 1) * perPage }, { $limit: perPage },
          { $project: {
            event: 1, message: 1, userId: 1, actorType: 1, organizationId: 1,
            configId: 1, sellerConfigId: 1, profileId: 1, resourceType: 1, resourceId: 1,
            outcome: 1, previousValue: 1, newValue: 1, source: 1, operationId: 1,
            ipAddress: 1, userAgent: 1, metadata: 1, createdAt: 1,
          } },
        ],
        totalCount: [{ $count: 'count' }],
      } },
    ]);
    const totalRecords = result?.[0]?.totalCount?.[0]?.count || 0;
    // Older records can contain raw credentials. Scrub them at the read boundary
    // as well; this does not rewrite or claim ownership of historical documents.
    const data = (result?.[0]?.data || []).map(row => sanitizeAuditValue(row));
    return res.status(200).json({ isSuccess: true, data, currentPageNo: pageNo, totalRecords, totalPages: Math.ceil(totalRecords / perPage), canViewOrganization: access.canViewOrganization });
  } catch (_) {
    write_logs({ message: '[getAuditLog Error] AUDIT_READ_FAILED', log_type: 'error' });
    return res.status(500).json({ isSuccess: false, message: 'Unable to load audit logs' });
  }
};
