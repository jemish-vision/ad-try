'use strict';

// Budget utilisation / "which campaigns run out of budget" report.
//
// The data lives on the daily campaign documents (one per configId, profileId,
// campaignId, reportDate): each carries the day's `budget`, `spend`, and an
// imported `budgetTracking.lastUsagePercentage`. We never had a separate budget
// collection — so this is assembled here from those daily rows rather than
// through the generic ad-metric pipeline, then handed to the shared,
// contract-validated response builder.
//
// HONEST LIMITS:
//   * "Capped" is inferred: a day counts as capped when spend reached about
//     CAP_THRESHOLD% of that day's budget (or budgetTracking says so). This
//     cannot pinpoint the hour a budget actually ran out.
//   * Figures are provisional (no per-grain import-coverage verifier).

const { Types: { ObjectId } } = require('mongoose');
const { createReportState, buildReportResponse } = require('./reportResponse');

const MAX_ROWS = 50000;
const MAX_TIME_MS = 5000;
const CAP_THRESHOLD = 95; // % of a day's budget treated as "capped"
const CAMPAIGN_COLLECTIONS = { SP: 'campaigns', SB: 'sbcampaigns', SD: 'sdcampaigns' };
const BUDGET_NOTE = 'Budget use is inferred from each day\'s imported budget and spend; a "capped day" means spend reached about 95% or more of that day\'s budget, which cannot pinpoint the exact time a budget ran out. Figures are provisional and may change as reporting completes.';

function objectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : value;
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function profileLabel(scope, profileId) {
  const index = scope.profiles.findIndex(profile => profile.profileId === profileId);
  return scope.profiles.length > 1 ? `Profile ${index + 1}` : 'Selected profile';
}

function currentWindow(periods, profileId) {
  return periods.find(entry => entry.profileId === profileId)?.current || null;
}

async function readCampaignBudgetRows(db, configId, profile, adTypes, window, entity) {
  const rows = [];
  for (const adType of adTypes) {
    const collection = CAMPAIGN_COLLECTIONS[adType];
    if (!collection) continue;

    const filter = {
      configId: objectId(configId),
      profileId: Number(profile.profileId),
      reportDate: { $gte: window.fromDate, $lte: window.toDate },
    };
    if (entity && entity.dimension === 'campaign' && Array.isArray(entity.ids) && entity.ids.length) {
      const ids = entity.ids.map(id => Number(id)).filter(Number.isFinite);
      if (ids.length) filter.campaignId = { $in: ids };
    }

    // eslint-disable-next-line no-await-in-loop
    const docs = await db.collection(collection).find(filter, {
      projection: { _id: 0, campaignId: 1, name: 1, reportDate: 1, budget: 1, spend: 1, currencyCode: 1, budgetTracking: 1 },
      maxTimeMS: MAX_TIME_MS,
    }).limit(MAX_ROWS + 1).toArray();

    for (const doc of docs) rows.push(doc);
  }
  return rows;
}

function aggregateByCampaign(docs, profileCurrency) {
  const byCampaign = new Map();
  let currencyMismatch = false;

  for (const doc of docs) {
    const campaignId = doc.campaignId === undefined || doc.campaignId === null ? '' : String(doc.campaignId);
    if (!campaignId) continue;
    if (doc.currencyCode && profileCurrency && doc.currencyCode !== profileCurrency) currencyMismatch = true;

    const budget = safeNumber(doc.budget);
    const spend = safeNumber(doc.spend) ?? 0;
    const reportedUsage = typeof doc.budgetTracking?.lastUsagePercentage === 'number'
      && Number.isFinite(doc.budgetTracking.lastUsagePercentage) && doc.budgetTracking.lastUsagePercentage >= 0
      ? doc.budgetTracking.lastUsagePercentage
      : null;
    const dayUtilization = reportedUsage !== null
      ? reportedUsage
      : (budget !== null && budget > 0 ? spend / budget * 100 : null);

    const entry = byCampaign.get(campaignId) || {
      campaignId, name: '', totalSpend: 0, totalBudget: 0, days: 0, cappedDays: 0, latestBudget: null, latestDate: '',
    };
    entry.totalSpend += spend;
    if (budget !== null && budget > 0) entry.totalBudget += budget;
    entry.days += 1;
    if (dayUtilization !== null && dayUtilization >= CAP_THRESHOLD) entry.cappedDays += 1;
    if (budget !== null && doc.reportDate && doc.reportDate >= entry.latestDate) {
      entry.latestDate = doc.reportDate;
      entry.latestBudget = budget;
    }
    if (!entry.name && typeof doc.name === 'string' && doc.name) entry.name = doc.name;
    byCampaign.set(campaignId, entry);
  }

  return { byCampaign, currencyMismatch };
}

const COLUMNS = [
  { key: 'profileId', label: 'profileId', type: 'string' },
  { key: 'name', label: 'name', type: 'string' },
  { key: 'budget', label: 'budget', type: 'number', unit: 'currency', nullable: true },
  { key: 'spend', label: 'spend', type: 'number', unit: 'currency', nullable: true },
  { key: 'utilization', label: 'utilization', type: 'number', unit: 'percent', nullable: true },
  { key: 'cappedDays', label: 'cappedDays', type: 'number', unit: 'count', nullable: true },
  { key: 'days', label: 'days', type: 'number', unit: 'count', nullable: true },
];

async function buildBudgetReport({ db, request, scope, periods, reportId }) {
  const state = createReportState();

  for (const profile of scope.profiles) {
    const window = currentWindow(periods, profile.profileId);
    if (!window) continue;
    const label = profileLabel(scope, profile.profileId);
    state.allVerified = false;

    let docs;
    try {
      // eslint-disable-next-line no-await-in-loop
      docs = await readCampaignBudgetRows(db, scope.configId, profile, request.adTypes, window, request.entity);
    } catch (_) {
      state.missingInputs.add(`${profile.profileId}: readable campaign budget records`);
      continue;
    }

    const { byCampaign, currencyMismatch } = aggregateByCampaign(docs, profile.currencyCode);
    if (currencyMismatch) state.missingInputs.add(`${profile.profileId}: single-currency campaign budgets`);

    const rows = [...byCampaign.values()]
      .map(entry => ({
        profileId: String(profile.profileId),
        name: String(entry.name || entry.campaignId).slice(0, 500),
        budget: entry.latestBudget,
        spend: entry.totalSpend,
        utilization: entry.totalBudget > 0 ? entry.totalSpend / entry.totalBudget * 100 : null,
        cappedDays: entry.cappedDays,
        days: entry.days,
      }))
      .filter(row => row.budget !== null || row.spend > 0)
      .sort((left, right) => (right.utilization ?? -1) - (left.utilization ?? -1));

    if (!rows.length) {
      state.missingInputs.add(`${profile.profileId}: campaign budget and spend records`);
      continue;
    }

    state.hasUsableEvidence = true;
    state.warnings.add(BUDGET_NOTE);
    if (rows.every(row => row.budget === null)) {
      state.missingInputs.add(`${profile.profileId}: imported daily budget amounts`);
    }

    const cappedCount = rows.filter(row => row.cappedDays > 0).length;
    state.analysisText.push(
      `${label}: ${cappedCount} of ${rows.length} campaign${rows.length === 1 ? '' : 's'} reached about ${CAP_THRESHOLD}% or more of a day's budget on at least one day in this period; the most budget-constrained campaigns are listed first.`,
    );

    const paged = rows.slice(request.offset, request.offset + request.limit);
    const id = `report_${state.sourceIndex++}`;
    state.datasets.push({
      id,
      currencyCode: profile.currencyCode,
      columns: COLUMNS,
      rows: paged,
      page: { offset: request.offset, limit: request.limit, total: rows.length, hasMore: request.offset + paged.length < rows.length },
    });
    state.blocks.push({ type: 'table', title: `Budget use · ${label}`, datasetId: id, sortable: true });
  }

  return buildReportResponse(state, { ...request, presentation: 'table', metrics: ['spend'] }, scope, periods, reportId);
}

// Budget questions are routed to category="growth" with a campaign grouping
// (see the system prompt). That combination has no other meaning, so it is the
// budget-utilisation request.
function isBudgetRequest(request) {
  return request.category === 'growth' && Array.isArray(request.groupBy) && request.groupBy.includes('campaign');
}

module.exports = { isBudgetRequest, buildBudgetReport };
