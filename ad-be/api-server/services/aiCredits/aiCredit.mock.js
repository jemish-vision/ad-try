'use strict';

/**
 * Demo-account (mock user) data for the AI Credits screens. Deterministic for a given day so the
 * page looks the same on every refresh; nothing is read from or written to the wallet collections.
 */
const { monthPeriod } = require('./aiCredit.service');

const MONTHLY = 1000;
const FEATURES = ['AI_ASSISTANT', 'LISTING_OPTIMIZATION', 'APLUS_CONTENT', 'LISTING_GENERATION', 'CAMPAIGN_ANALYSIS'];
const MODELS = { AI_ASSISTANT: ['claude-haiku-5-5'], LISTING_OPTIMIZATION: ['gemini-3.8-flash', 'gpt-4o-mini'], APLUS_CONTENT: ['gemini-3.8-flash', 'gemini-3-pro-image-preview'], LISTING_GENERATION: ['gpt-4o-mini'], CAMPAIGN_ANALYSIS: ['gemini-3.8-flash'] };
const USERS = [
  { _id: '000000000000000000000d01', name: 'Demo Owner' },
  { _id: '000000000000000000000d02', name: 'Demo Analyst' },
];

// Small seeded PRNG so values are stable
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const round2 = (n) => Math.round(n * 100) / 100;

function buildRequests(now = new Date()) {
  const { start } = monthPeriod(now);
  const days = Math.max(1, now.getUTCDate());
  const rand = rng(start.getTime() / 1000);
  const rows = [];
  for (let d = 0; d < days; d += 1) {
    const perDay = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < perDay; i += 1) {
      const roll = rand();
      const feature = roll < 0.5 ? 'AI_ASSISTANT' : roll < 0.72 ? 'LISTING_OPTIMIZATION' : roll < 0.82 ? 'CAMPAIGN_ANALYSIS' : roll < 0.9 ? 'LISTING_GENERATION' : 'APLUS_CONTENT';
      const inputTokens = feature === 'AI_ASSISTANT' ? 6000 + Math.floor(rand() * 9000) : 3500 + Math.floor(rand() * 2500);
      const outputTokens = feature === 'AI_ASSISTANT' ? 400 + Math.floor(rand() * 1200) : 1500 + Math.floor(rand() * 1500);
      const images = feature === 'APLUS_CONTENT' ? (rand() < 0.5 ? 5 : 7) : 0;
      const failed = rand() < 0.05;
      const credits = failed ? 0 : round2(inputTokens / 1000 + (outputTokens / 1000) * 4 + images * 10);
      const createdAt = new Date(start.getTime() + d * 86400000 + Math.floor(rand() * 86400000));
      if (createdAt > now) continue;
      rows.push({
        _id: `mock-${d}-${i}`,
        requestId: `demo-${d}-${i}`,
        createdAt,
        feature,
        status: failed ? 'RELEASED' : 'SETTLED',
        failureReason: failed ? 'AI provider error' : null,
        credits,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        images,
        models: MODELS[feature],
        enforced: true,
        user: USERS[Math.floor(rand() * USERS.length)],
      });
    }
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

function summary(now = new Date()) {
  const { start, end } = monthPeriod(now);
  const reqs = buildRequests(now).filter((r) => r.status === 'SETTLED');
  const used = round2(reqs.reduce((s, r) => s + r.credits, 0));
  const byFeature = FEATURES.map((f) => {
    const rs = reqs.filter((r) => r.feature === f);
    return { feature: f, credits: round2(rs.reduce((s, r) => s + r.credits, 0)), requests: rs.length, inputTokens: rs.reduce((s, r) => s + r.inputTokens, 0), outputTokens: rs.reduce((s, r) => s + r.outputTokens, 0) };
  });
  const dayMap = new Map();
  for (const r of reqs) {
    const k = r.createdAt.toISOString().slice(0, 10);
    const e = dayMap.get(k) || { date: k, credits: 0, requests: 0 };
    e.credits = round2(e.credits + r.credits);
    e.requests += 1;
    dayMap.set(k, e);
  }
  const allocated = Math.max(MONTHLY, Math.ceil(used / 100) * 100 + 200);
  const tokens = byFeature.reduce((a, f) => ({ input: a.input + f.inputTokens, output: a.output + f.outputTokens }), { input: 0, output: 0 });
  return {
    wallet: { organizationId: null, monthlyLimit: allocated, limitSource: 'PLAN', monthlyLimitOverride: null, allocated, used, reserved: 0, available: round2(allocated - used), periodStart: start, nextResetAt: end, lastResetAt: start, lastUsedAt: reqs[0]?.createdAt || null },
    usagePct: round2((used / allocated) * 100),
    tokensThisPeriod: { input: tokens.input, output: tokens.output, total: tokens.input + tokens.output },
    requestsThisPeriod: reqs.length,
    byFeature,
    byDay: [...dayMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    enforcementEnabled: true,
    rates: { inputCreditsPer1K: 1, outputCreditsPer1K: 4, creditsPerImage: 10 },
    featureReserves: { AI_ASSISTANT: 20, LISTING_OPTIMIZATION: 25, LISTING_GENERATION: 15, APLUS_CONTENT: 20, CAMPAIGN_ANALYSIS: 15 },
    isDemo: true,
  };
}

function paged(rows, body = {}) {
  const pageNo = Math.max(1, parseInt(body.pageNo, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(body.perPage, 10) || 10));
  return { data: rows.slice((pageNo - 1) * perPage, pageNo * perPage), totalRecords: rows.length, pageNo, perPage };
}

function usage(body = {}, now = new Date()) {
  let rows = buildRequests(now);
  if (body.feature) rows = rows.filter((r) => r.feature === body.feature);
  if (body.status) rows = rows.filter((r) => r.status === body.status);
  return paged(rows, body);
}

function transactions(body = {}, now = new Date()) {
  const s = summary(now);
  let balance = s.wallet.allocated;
  const rows = [{ _id: 'mock-alloc', createdAt: s.wallet.periodStart, type: 'ALLOCATION', credits: s.wallet.allocated, balanceAfter: s.wallet.allocated, feature: null, note: 'Monthly allowance', user: null }];
  const deductions = buildRequests(now)
    .filter((r) => r.status === 'SETTLED')
    .reverse()
    .map((r) => {
      balance = round2(balance - r.credits);
      return { _id: `tx-${r._id}`, createdAt: r.createdAt, type: 'DEDUCTION', credits: -r.credits, balanceAfter: balance, feature: r.feature, note: `${r.images ? `${r.images} images, ` : ''}${r.totalTokens} tokens (${r.models.join(', ')})`, user: r.user };
    });
  let all = [...rows, ...deductions].sort((a, b) => b.createdAt - a.createdAt);
  if (body.type) all = all.filter((t) => t.type === body.type);
  return paged(all, body);
}

module.exports = { summary, usage, transactions };
