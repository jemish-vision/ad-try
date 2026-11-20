'use strict';

const validId = value => value != null && /^[a-fA-F0-9]{24}$/.test(String(value));
const requestAccess = new WeakMap();

async function getAuditAccess(req, requestedOrganizationId = req?.organizationId) {
  let cache = requestAccess.get(req);
  if (!cache) { cache = new Map(); requestAccess.set(req, cache); }
  const key = `${req?.user?._id || req?.user?.id || ''}:${requestedOrganizationId || ''}:${req?.role?.roleName || ''}`;
  if (!cache.has(key)) cache.set(key, resolveAuditAccess(req, requestedOrganizationId));
  return cache.get(key);
}

async function resolveAuditAccess(req, requestedOrganizationId) {
  const userId = req?.user?._id || req?.user?.id;
  if (!validId(userId)) return { allowed: false, canViewOrganization: false };
  if (!requestedOrganizationId) return { allowed: true, canViewOrganization: false, userId, organizationId: null };
  if (!validId(requestedOrganizationId)) return { allowed: false, canViewOrganization: false };
  const Organization = require('../models/organization.model');
  const organization = await Organization.findOne({ _id: requestedOrganizationId }).select('_id userId').lean();
  if (!organization) return { allowed: false, canViewOrganization: false };
  const base = { userId, organizationId: organization._id };
  if (String(organization.userId) === String(userId)) return { ...base, allowed: true, canViewOrganization: true };
  if (req?.role?.roleName === 'SUPER_ADMIN') return { ...base, allowed: true, canViewOrganization: true };
  const Membership = require('../models/roleBasedPermission.model');
  const membership = await Membership.findOne({ userId, organizationId: organization._id }).select('roleId').lean();
  if (!membership) return { ...base, allowed: false, canViewOrganization: false };
  const Role = require('../models/superAdmin/role.model');
  const role = membership.roleId && await Role.findOne({ _id: membership.roleId }).select('roleName organizationId').lean();
  const roleInOrganization = role && (!role.organizationId || String(role.organizationId) === String(organization._id));
  return { ...base, allowed: true, canViewOrganization: Boolean(roleInOrganization && ['ADMIN', 'SUPER_ADMIN'].includes(role.roleName)) };
}

module.exports = { getAuditAccess, validId };
