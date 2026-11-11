const moment = require("moment-timezone");
const mongoose = require("mongoose");
const { normalizeCampaignAdType } = require("./campaignStatusHistory.service");

function normalizeBudgetState(value) {
  const normalized = String(value).trim().toUpperCase();
  if (normalized === "OUT_OF_BUDGET" || normalized === "FALSE") return true;
  if (normalized === "IN_BUDGET" || normalized === "TRUE") return false;
  return null;
}

function stateAfterEvents(events) {
  const states = new Set(events.map(row => normalizeBudgetState(row.newValue)).filter(state => state !== null));
  return states.size === 1 ? [...states][0] : null;
}

function historyScope({ configId, profileId, adType, campaignIds }) {
  if (!mongoose.isValidObjectId(configId) || !Number.isFinite(Number(profileId)) || Number(profileId) <= 0) {
    throw new Error("Budget history requires a valid account and profile");
  }
  const ids = [...new Set((campaignIds || []).map(Number))];
  if (ids.some(id => !Number.isFinite(id) || id <= 0)) throw new Error("Invalid budget history campaign identity");
  return {
    configId: new mongoose.Types.ObjectId(String(configId)),
    profileId: Number(profileId),
    type: normalizeCampaignAdType(adType),
    changeLevel: { $in: ids },
    changeType: "Update Campaign Budget Status",
  };
}

function historyWindow({ fromDate, toDate, timezone }) {
  if (!moment.tz.zone(timezone)) throw new Error("Budget history requires a valid profile timezone");
  const start = moment.tz(fromDate, "YYYY-MM-DD", true, timezone);
  const lastDay = moment.tz(toDate, "YYYY-MM-DD", true, timezone);
  if (!start.isValid() || !lastDay.isValid() || start.isAfter(lastDay)) throw new Error("Invalid budget history date window");
  return { start, end: lastDay.clone().add(1, "day").startOf("day") };
}

/** A local day qualifies only when a recorded IN-to-OUT transition occurs on it. */
function buildCampaignBudgetHistoryDays({ events = [], fromDate, toDate, timezone }) {
  const { start, end } = historyWindow({ fromDate, toDate, timezone });
  const result = new Map();
  for (const row of events) {
    const timestamp = +new Date(row.createdAt);
    if (!Number.isFinite(timestamp) || timestamp < +start || timestamp >= +end) continue;
    const previous = normalizeBudgetState(row.oldValue);
    const current = normalizeBudgetState(row.newValue);
    if (previous === null || current === null) continue;
    const id = String(row.changeLevel);
    const date = moment(timestamp).tz(timezone).format("YYYY-MM-DD");
    if (!result.has(id)) result.set(id, new Map());
    const days = result.get(id);
    const exhausted = previous === false && current === true;
    days.set(date, days.get(date) === true || exhausted);
  }
  return result;
}

async function latestEvents(model, scope, before) {
  const grouped = await model.aggregate([
    { $match: { ...scope, createdAt: { $lt: before } } },
    { $group: {
      _id: { campaignId: "$changeLevel", createdAt: "$createdAt" },
      events: { $push: { changeLevel: "$changeLevel", newValue: "$newValue", createdAt: "$createdAt" } },
    } },
    { $sort: { "_id.createdAt": -1 } },
    { $group: { _id: "$_id.campaignId", events: { $first: "$events" } } },
  ]).allowDiskUse(true);
  return grouped.flatMap(row => row.events);
}

async function getCampaignBudgetHistoryDays(params, { historyModel } = {}) {
  const scope = historyScope(params);
  const { start, end } = historyWindow(params);
  if (!scope.changeLevel.$in.length) return new Map();
  const model = historyModel || require("../models/campaignChangeHistory.model");
  const events = await model.find({ ...scope, createdAt: { $gte: start.toDate(), $lt: end.toDate() } })
    .select({ changeLevel: 1, oldValue: 1, newValue: 1, createdAt: 1 }).lean();
  return buildCampaignBudgetHistoryDays({ ...params, events });
}

async function getLatestCampaignBudgetEvents(params, { historyModel, now = new Date() } = {}) {
  const scope = historyScope(params);
  if (!scope.changeLevel.$in.length) return new Map();
  const model = historyModel || require("../models/campaignChangeHistory.model");
  const events = await latestEvents(model, scope, new Date(+now + 1));
  const byCampaign = new Map();
  for (const row of events) {
    const id = String(row.changeLevel);
    if (!byCampaign.has(id)) byCampaign.set(id, []);
    byCampaign.get(id).push(row);
  }
  return new Map([...byCampaign].map(([id, rows]) => [id, {
    outOfBudget: stateAfterEvents(rows),
    createdAt: new Date(rows[0].createdAt),
  }]).filter(([, event]) => event.outOfBudget !== null && Number.isFinite(+event.createdAt)));
}

async function getLatestCampaignBudgetStates(params, dependencies) {
  const events = await getLatestCampaignBudgetEvents(params, dependencies);
  return new Map([...events].map(([campaignId, event]) => [campaignId, event.outOfBudget]));
}

module.exports = { normalizeBudgetState, buildCampaignBudgetHistoryDays, getCampaignBudgetHistoryDays,
  getLatestCampaignBudgetEvents, getLatestCampaignBudgetStates };
