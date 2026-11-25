'use strict';

/** Read-only views of AI credit data for the user panel and the Super Admin panel. */
const mongoose = require('mongoose');
const walletModel = require('../../models/aiCreditWallet.model');
const transactionModel = require('../../models/aiCreditTransaction.model');
const usageLogModel = require('../../models/aiUsageLog.model');
const organizationModel = require('../../models/organization.model');
const service = require('./aiCredit.service');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const page = (body = {}, max = 100) => {
  const pageNo = Math.max(1, parseInt(body.pageNo, 10) || 1);
  const perPage = Math.min(max, Math.max(1, parseInt(body.perPage, 10) || 10));
  return { pageNo, perPage, skip: (pageNo - 1) * perPage };
};
// "Low" = under 20% of the month's credits left (same rule as the frontend's creditLevel)
const LOW_BALANCE_SHARE = 0.2;
const VALID_STATUSES = ['RESERVED', 'SETTLED', 'RELEASED', 'EXPIRED'];
const VALID_TX_TYPES = ['ALLOCATION', 'RESET', 'DEDUCTION', 'ADJUSTMENT'];

function dateRange(body = {}) {
  const range = {};
  if (body.fromDate && !Number.isNaN(Date.parse(body.fromDate))) range.$gte = new Date(`${String(body.fromDate).slice(0, 10)}T00:00:00.000Z`);
  if (body.toDate && !Number.isNaN(Date.parse(body.toDate))) range.$lte = new Date(`${String(body.toDate).slice(0, 10)}T23:59:59.999Z`);
  return Object.keys(range).length ? range : null;
}

/** Credits and tokens per feature and per day for one organization's current period. */
async function periodBreakdown(organizationId, wallet) {
  const match = { organizationId: toObjectId(organizationId), status: 'SETTLED', createdAt: { $gte: new Date(wallet.periodStart), $lt: new Date(wallet.nextResetAt) } };
  const [byFeature, byDay] = await Promise.all([
    usageLogModel.aggregate([{ $match: match }, { $group: { _id: '$feature', credits: { $sum: '$credits' }, requests: { $sum: 1 }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' } } }, { $sort: { credits: -1 } }]),
    usageLogModel.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, credits: { $sum: '$credits' }, requests: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  return {
    byFeature: byFeature.map((f) => ({ feature: f._id, credits: round2(f.credits), requests: f.requests, inputTokens: f.inputTokens, outputTokens: f.outputTokens })),
    byDay: byDay.map((d) => ({ date: d._id, credits: round2(d.credits), requests: d.requests })),
  };
}

/** User panel: the organization's wallet, this period's breakdown and the rates in force. */
async function getUserSummary(organizationId) {
  const settings = await service.getSettings();
  const wallet = service.walletView(await service.getWallet(organizationId, { settings }));
  const breakdown = await periodBreakdown(organizationId, wallet);
  const tokens = breakdown.byFeature.reduce((a, f) => ({ input: a.input + f.inputTokens, output: a.output + f.outputTokens }), { input: 0, output: 0 });
  return {
    wallet,
    usagePct: wallet.allocated > 0 ? Math.min(100, round2((wallet.used / wallet.allocated) * 100)) : 0,
    tokensThisPeriod: { input: tokens.input, output: tokens.output, total: tokens.input + tokens.output },
    requestsThisPeriod: breakdown.byFeature.reduce((s, f) => s + f.requests, 0),
    ...breakdown,
    enforcementEnabled: settings.enforcementEnabled,
    rates: { inputCreditsPer1K: settings.inputCreditsPer1K, outputCreditsPer1K: settings.outputCreditsPer1K },
    featureReserves: settings.featureReserves,
  };
}

/** Paginated AI requests (newest first) for one organization, or all (Super Admin). */
async function listUsage(body = {}, { organizationId = null } = {}) {
  const { pageNo, perPage, skip } = page(body);
  const filter = {};
  if (organizationId) filter.organizationId = toObjectId(organizationId);
  else if (body.organizationId && mongoose.Types.ObjectId.isValid(String(body.organizationId))) filter.organizationId = toObjectId(body.organizationId);
  if (body.feature && service.FEATURES[body.feature]) filter.feature = body.feature;
  if (body.status && VALID_STATUSES.includes(body.status)) filter.status = body.status;
  const created = dateRange(body);
  if (created) filter.createdAt = created;

  const [rows, total] = await Promise.all([
    usageLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .populate([{ path: 'userId', select: 'fullName email' }, ...(organizationId ? [] : [{ path: 'organizationId', select: 'organizationName' }])])
      .lean(),
    usageLogModel.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => ({
      _id: r._id,
      requestId: String(r.requestId).replace(/^[a-f0-9]{24}:/, ''),
      createdAt: r.createdAt,
      feature: r.feature,
      status: r.status,
      failureReason: r.failureReason || null,
      credits: round2(r.credits),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      models: r.models || [],
      enforced: r.enforced !== false,
      user: r.userId ? { _id: r.userId._id, name: r.userId.fullName || r.userId.email || null } : null,
      organization: r.organizationId && r.organizationId.organizationName ? { _id: r.organizationId._id, name: r.organizationId.organizationName } : undefined,
    })),
    totalRecords: total,
    pageNo,
    perPage,
  };
}

/** Paginated credit ledger (allocations, resets, deductions, adjustments). */
async function listTransactions(body = {}, { organizationId }) {
  const { pageNo, perPage, skip } = page(body);
  const filter = { organizationId: toObjectId(organizationId) };
  if (body.type && VALID_TX_TYPES.includes(body.type)) filter.type = body.type;
  const created = dateRange(body);
  if (created) filter.createdAt = created;
  const [rows, total] = await Promise.all([
    transactionModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(perPage).populate({ path: 'userId', select: 'fullName email' }).lean(),
    transactionModel.countDocuments(filter),
  ]);
  return {
    data: rows.map((t) => ({
      _id: t._id,
      createdAt: t.createdAt,
      type: t.type,
      credits: round2(t.credits),
      balanceAfter: t.balanceAfter === null ? null : round2(t.balanceAfter),
      feature: t.feature || null,
      note: t.note || null,
      user: t.userId ? { _id: t.userId._id, name: t.userId.fullName || t.userId.email || null } : null,
    })),
    totalRecords: total,
    pageNo,
    perPage,
  };
}

/** Super Admin: organizations with their wallet (organizations that never used AI are listed too). */
async function listOrganizationWallets(body = {}) {
  const { pageNo, perPage, skip } = page(body);
  const search = String(body.search || '').trim();
  const match = search ? { organizationName: { $regex: escapeRegex(search), $options: 'i' } } : {};
  const sortKey = { used: 'wallet.used', available: 'wallet.balance', name: 'organizationName' }[body.sortBy] || 'wallet.used';
  const sortDir = body.sortOrder === 'asc' ? 1 : -1;
  const settings = await service.getSettings();
  const { start } = service.monthPeriod();

  const [result] = await organizationModel.aggregate([
    { $match: match },
    { $lookup: { from: 'aicreditwallets', localField: '_id', foreignField: 'organizationId', as: 'wallet' } },
    { $unwind: { path: '$wallet', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'packages', localField: 'planId', foreignField: '_id', as: 'plan' } },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
    { $project: { organizationName: 1, plan: { _id: '$plan._id', name: '$plan.name', aiMonthlyCredits: '$plan.aiMonthlyCredits' }, wallet: 1 } },
    { $sort: { [sortKey]: sortDir, _id: 1 } },
    { $facet: { rows: [{ $skip: skip }, { $limit: perPage }], total: [{ $count: 'n' }] } },
  ]);

  const rows = (result?.rows || []).map((o) => {
    const planLimit = o.plan?.aiMonthlyCredits ?? null;
    const w = o.wallet;
    // A wallet from an earlier month will be reset on its next use: show it as it will be.
    const stale = w && new Date(w.periodEnd) <= new Date();
    const fallbackLimit = w?.monthlyLimitOverride ?? planLimit ?? settings.defaultMonthlyCredits;
    return {
      organizationId: o._id,
      organizationName: o.organizationName,
      plan: o.plan?._id ? { _id: o.plan._id, name: o.plan.name, aiMonthlyCredits: planLimit } : null,
      hasWallet: Boolean(w),
      monthlyLimit: round2(w && !stale ? w.monthlyLimit : fallbackLimit),
      limitSource: w?.monthlyLimitOverride !== null && w?.monthlyLimitOverride !== undefined ? 'OVERRIDE' : planLimit !== null ? 'PLAN' : 'DEFAULT',
      monthlyLimitOverride: w?.monthlyLimitOverride ?? null,
      allocated: round2(w && !stale ? w.allocated : fallbackLimit),
      used: round2(w && !stale ? w.used : 0),
      reserved: round2(w?.reserved || 0),
      available: round2(Math.max(0, w && !stale ? w.balance : fallbackLimit - (w?.reserved || 0))),
      nextResetAt: w && !stale ? w.periodEnd : service.monthPeriod().end,
      lastUsedAt: w?.lastUsedAt || null,
      lifetimeUsed: round2(w?.lifetimeUsed || 0),
    };
  });
  return { data: rows, totalRecords: result?.total?.[0]?.n || 0, pageNo, perPage, periodStart: start };
}

/** Super Admin: totals for a date range (default: this month) across all organizations. */
async function getAdminOverview(body = {}) {
  const { start } = service.monthPeriod();
  const createdAt = dateRange(body) || { $gte: start };
  const match = { createdAt };
  const [totals, byFeature, byModel, topOrgs, walletStats, byDay] = await Promise.all([
    usageLogModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          charged: { $sum: { $cond: [{ $eq: ['$status', 'SETTLED'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$status', ['RELEASED', 'EXPIRED']] }, 1, 0] } },
          credits: { $sum: '$credits' },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
        },
      },
    ]),
    usageLogModel.aggregate([{ $match: { ...match, status: 'SETTLED' } }, { $group: { _id: '$feature', credits: { $sum: '$credits' }, requests: { $sum: 1 }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' } } }, { $sort: { credits: -1 } }]),
    usageLogModel.aggregate([
      { $match: { ...match, status: 'SETTLED' } },
      { $unwind: '$calls' },
      { $group: { _id: '$calls.model', credits: { $sum: '$calls.credits' }, inputTokens: { $sum: '$calls.inputTokens' }, outputTokens: { $sum: '$calls.outputTokens' }, calls: { $sum: 1 } } },
      { $sort: { credits: -1 } },
      { $limit: 10 },
    ]),
    usageLogModel.aggregate([
      { $match: { ...match, status: 'SETTLED' } },
      { $group: { _id: '$organizationId', credits: { $sum: '$credits' }, requests: { $sum: 1 } } },
      { $sort: { credits: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
      { $project: { credits: 1, requests: 1, name: { $arrayElemAt: ['$org.organizationName', 0] } } },
    ]),
    walletModel.aggregate([
      { $match: { periodEnd: { $gt: new Date() } } },
      { $group: { _id: null, wallets: { $sum: 1 }, allocated: { $sum: '$allocated' }, used: { $sum: '$used' }, exhausted: { $sum: { $cond: [{ $lte: ['$balance', 0] }, 1, 0] } }, low: { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 0] }, { $lt: ['$balance', { $multiply: ['$allocated', LOW_BALANCE_SHARE] }] }] }, 1, 0] } } } },
    ]),
    usageLogModel.aggregate([{ $match: { ...match, status: 'SETTLED' } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, credits: { $sum: '$credits' }, requests: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  const t = totals[0] || {};
  const w = walletStats[0] || {};
  return {
    range: { from: createdAt.$gte || null, to: createdAt.$lte || null },
    totals: { requests: t.requests || 0, charged: t.charged || 0, failed: t.failed || 0, credits: round2(t.credits), inputTokens: t.inputTokens || 0, outputTokens: t.outputTokens || 0, totalTokens: (t.inputTokens || 0) + (t.outputTokens || 0) },
    wallets: { active: w.wallets || 0, allocated: round2(w.allocated), used: round2(w.used), exhausted: w.exhausted || 0, low: w.low || 0 },
    byFeature: byFeature.map((f) => ({ feature: f._id, credits: round2(f.credits), requests: f.requests, inputTokens: f.inputTokens, outputTokens: f.outputTokens })),
    byModel: byModel.map((m) => ({ model: m._id || 'unknown', credits: round2(m.credits), inputTokens: m.inputTokens, outputTokens: m.outputTokens, calls: m.calls })),
    topOrganizations: topOrgs.map((o) => ({ organizationId: o._id, name: o.name || null, credits: round2(o.credits), requests: o.requests })),
    byDay: byDay.map((d) => ({ date: d._id, credits: round2(d.credits), requests: d.requests })),
  };
}

module.exports = { getUserSummary, listUsage, listTransactions, listOrganizationWallets, getAdminOverview, periodBreakdown };
