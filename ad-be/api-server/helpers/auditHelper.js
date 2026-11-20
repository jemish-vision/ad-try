'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const AuditLog = require('../models/auditLog.model');
const { events } = require('../constants/auditEvents');
const { validId, getAuditAccess } = require('./auditScope');
const requestStorage = new AsyncLocalStorage();
const eventSet = new Set(events);
const OUTCOMES = new Set(['SUCCESS', 'FAILURE', 'PARTIAL', 'PENDING', 'DENIED']);
const SOURCES = new Set(['api', 'ui', 'worker', 'webhook', 'integration', 'system']);

function safeString(value, limit = 1000) {
  return String(value).replace(/Bearer\s+[^\s,;]+/gi, '[REDACTED]')
    .replace(/\b(?:sk-|AIza)[a-zA-Z0-9_-]{15,}/g, '[REDACTED]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\b(password|otp|secret|token|authorization|oauth.?state)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, limit);
}

function sanitizeAuditValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return safeString(value);
  if (depth > 7 || typeof value !== 'object') return undefined;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeAuditValue(item, depth + 1, seen)).filter(item => item !== undefined);
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (/password|passwd|secret|seceret|token|authorization|cookie|otp|privatekey|apikey|clientcredential|(?:oauth|raw).*state|state(?:parameter|value|nonce)/.test(normalized)) continue;
    if (['body', 'requestbody', 'responsebody', 'rawrequest', 'rawresponse', 'headers', 'oauthstate', 'rawstate', 'stateparameter', 'proto', 'constructor', 'prototype'].includes(normalized)) continue;
    if (normalized === 'state' && !['ENABLED', 'PAUSED', 'ARCHIVED', 'ACTIVE', 'INACTIVE'].includes(item)) continue;
    const safe = sanitizeAuditValue(item, depth + 1, seen);
    if (safe !== undefined) Object.defineProperty(result, key, { value: safe, enumerable: true, configurable: true });
  }
  return result;
}

function runWithAuditRequest(req, fn) {
  return requestStorage.run(req, fn);
}

async function prepareAuditEvent(input, lookupCache = new Map()) {
  if (!input || !eventSet.has(input.event)) throw new Error('INVALID_AUDIT_EVENT');
  const req = input.req || requestStorage.getStore();
  const observedUserId = req?.user?._id || req?.user?.id;
  const actorType = input.actorType || (observedUserId || input.userId ? 'user' : 'system');
  if (!['user', 'system', 'integration', 'anonymous'].includes(actorType)) throw new Error('INVALID_AUDIT_ACTOR');
  const userId = actorType === 'user' ? (observedUserId || input.userId) : null;
  if (actorType === 'user' && !validId(userId)) throw new Error('INVALID_AUDIT_USER');
  const legacyOutcome = typeof input.metadata?.status === 'string' ? input.metadata.status.toUpperCase().replace(/^FAILED$/, 'FAILURE') : null;
  const outcome = String(input.outcome || (OUTCOMES.has(legacyOutcome) ? legacyOutcome : 'SUCCESS')).toUpperCase().replace(/^FAILED$/, 'FAILURE');
  if (!OUTCOMES.has(outcome)) throw new Error('INVALID_AUDIT_OUTCOME');
  if (input.source && !SOURCES.has(input.source)) throw new Error('INVALID_AUDIT_SOURCE');
  const metadata = sanitizeAuditValue(input.metadata);
  const accessFor = (actorRequest, organizationId) => {
    const key = `access:${userId}:${organizationId || ''}`;
    if (!lookupCache.has(key)) lookupCache.set(key, getAuditAccess(actorRequest, organizationId));
    return lookupCache.get(key);
  };
  const ids = {};
  for (const name of ['organizationId', 'configId', 'sellerConfigId']) {
    if (input[name] != null && !validId(input[name])) throw new Error('INVALID_AUDIT_SCOPE');
    if (input[name]) ids[name] = input[name];
  }
  if (req && actorType === 'user') {
    // OAuth callbacks may have resolved a verified actor without req.user.
    const actorRequest = observedUserId ? req : { user: { _id: userId }, role: req.role };
    const access = await accessFor(actorRequest, input.organizationId || req.organizationId);
    if (!access.allowed) throw new Error('INVALID_AUDIT_SCOPE');
    ids.organizationId = access.organizationId;
    if (ids.organizationId && input.organizationId && String(ids.organizationId) !== String(input.organizationId)) throw new Error('INVALID_AUDIT_SCOPE');
    const sameSelectedOrganization = !input.organizationId || !req.organizationId || String(input.organizationId) === String(req.organizationId);
    if (!ids.configId && !validId(metadata?.configId) && sameSelectedOrganization && validId(req.config?.configId)) ids.configId = req.config.configId;
  }
  const configId = ids.configId || (validId(metadata?.configId) ? metadata.configId : null);
  const sellerConfigId = ids.sellerConfigId || (validId(metadata?.sellerConfigId) ? metadata.sellerConfigId : null);
  for (const [name, id] of [['configId', configId], ['sellerConfigId', sellerConfigId]]) {
    if (!id) continue;
    const Model = require(name === 'configId' ? '../models/config.model' : '../models/sellerConfig.model');
    const lookupKey = `${name}:${id}`;
    if (!lookupCache.has(lookupKey)) lookupCache.set(lookupKey, Promise.resolve(Model.findOne({ _id: id }).select('_id organizationId configId profileId').lean()));
    const target = await lookupCache.get(lookupKey);
    if (target?.organizationId) {
      if (ids.organizationId && String(ids.organizationId) !== String(target.organizationId)) throw new Error('INVALID_AUDIT_SCOPE');
      if (actorType === 'user' && (!req || !ids.organizationId)) {
        const access = await accessFor({ user: { _id: userId }, role: req?.role }, target.organizationId);
        if (!access.allowed) throw new Error('INVALID_AUDIT_SCOPE');
      }
      ids.organizationId = target.organizationId;
    }
    if (target) ids[name] = id;
    else if (actorType !== 'system' && actorType !== 'integration') delete ids[name];
  }
  if (actorType === 'user' && !req && ids.organizationId) {
    const access = await accessFor({ user: { _id: userId } }, ids.organizationId);
    if (!access.allowed) throw new Error('INVALID_AUDIT_SCOPE');
  }
  const sameRequestOrganization = !input.organizationId || !req?.organizationId || String(input.organizationId) === String(req.organizationId);
  const profileId = input.profileId ?? metadata?.profileId ?? (sameRequestOrganization ? req?.config?.profileId : undefined);
  if (profileId != null && !/^\d{1,32}$/.test(String(profileId))) throw new Error('INVALID_AUDIT_PROFILE');
  const entry = {
    event: input.event, message: safeString(input.message || '', 2000), actorType,
    ...(userId && { userId }), ...ids,
    ...(profileId != null && { profileId: String(profileId) }),
    outcome, source: input.source || (req ? 'api' : actorType === 'user' ? 'api' : 'system'), metadata,
  };
  for (const field of ['previousValue', 'newValue']) {
    const value = input[field] !== undefined ? input[field] : metadata?.[field];
    if (value !== undefined) entry[field] = sanitizeAuditValue(value);
  }
  for (const field of ['resourceType', 'resourceId', 'operationId']) {
    const value = input[field] ?? metadata?.[field] ?? (field === 'operationId' ? req?.auditOperationId : undefined);
    if (value != null) {
      if (!['string', 'number'].includes(typeof value) || String(value).length > (field === 'resourceType' ? 100 : 200)) throw new Error('INVALID_AUDIT_RESOURCE');
      entry[field] = safeString(value, 200);
    }
  }
  if (req) {
    if (typeof req.ip === 'string') entry.ipAddress = safeString(req.ip, 100);
    const userAgent = req.get?.('user-agent') || req.headers?.['user-agent'];
    if (typeof userAgent === 'string') entry.userAgent = safeString(userAgent, 500);
  }
  return { entry, req };
}

function reportFailure() {
  console.error('Audit event persistence failed', { code: 'AUDIT_WRITE_FAILED' });
}

async function writeAuditEvent(input) {
  try {
    const { entry, req } = await prepareAuditEvent(input);
    const audit = new AuditLog(entry);
    await audit.save();
    if (req) {
      if (!(req.auditEvents instanceof Set)) req.auditEvents = new Set();
      req.auditEvents.add(entry.event);
    }
    return { success: true, id: audit._id };
  } catch (_) {
    reportFailure();
    return { success: false, code: 'AUDIT_WRITE_FAILED' };
  }
}

async function logAudit(event, message, metadata, userId) {
  return writeAuditEvent({ event, message, metadata, userId });
}

async function logAuditBatch(entries) {
  if (!Array.isArray(entries) || !entries.length) return;
  try {
    const cache = new Map();
    const prepared = await Promise.all(entries.map(entry => prepareAuditEvent(entry, cache)));
    await AuditLog.insertMany(prepared.map(item => item.entry), { ordered: false });
    for (const { entry, req } of prepared) {
      if (req) {
        if (!(req.auditEvents instanceof Set)) req.auditEvents = new Set();
        req.auditEvents.add(entry.event);
      }
    }
    return { success: true };
  } catch (_) {
    reportFailure();
    return { success: false, code: 'AUDIT_WRITE_FAILED' };
  }
}

module.exports = { logAudit, logAuditBatch, writeAuditEvent, runWithAuditRequest, sanitizeAuditValue };
