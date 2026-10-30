const mongoose = require("mongoose");
const amazonAxios = require("../helper/amazonAxios");
const { retryWithBackoff } = require("../helper/retryHelper");
const campaignChangeHistorySchema = require("../models/campaignChangeHistory.model");
const { eventDate, historyId } = require("./campaignStatusHistory.service");

async function fetchAmazonCampaignStatusHistory({ profile, checkConfigAds, campaignIds = [], fromDate, toDate }) {
  if (!profile?.amazonUrl || !profile?.profileId) throw new Error("Missing required profile parameters (amazonUrl, profileId)");
  const from = Math.max(fromDate ?? Date.now() - 89 * 86400000, Date.now() - 89 * 86400000);
  const to = toDate ?? Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error("Invalid campaign history date range");
  const groups = campaignIds.length ? Array.from({ length: Math.ceil(campaignIds.length / 10) }, (_, i) => campaignIds.slice(i * 10, i * 10 + 10).map(String)) : [null];
  const result = [];
  for (const ids of groups) {
    let token, offset = 0, received = 0, pages = 0;
    const seenTokens = new Set();
    while (true) {
      if (++pages > 10000) throw new Error("Amazon history pagination exceeded its safety limit; import is incomplete");
      const payload = { fromDate: from, toDate: to, count: 100, sort: { key: "DATE", direction: "ASC" },
        eventTypes: { CAMPAIGN: { parents: [{ useProfileIdAdvertiser: true }], filters: ["STATUS", "IN_BUDGET"], ...(ids && { eventTypeIds: ids }) } },
        ...(token ? { nextToken: token } : { pageOffset: offset }) };
      const response = await retryWithBackoff(() => amazonAxios({ method: "POST", url: profile.amazonUrl + "/history",
        headers: { "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId, "Amazon-Advertising-API-Scope": String(profile.profileId),
          Authorization: "Bearer " + checkConfigAds.adsAccessToken, Accept: "application/vnd.historyresponse.v1.1+json", "Content-Type": "application/json" },
        data: payload, meta: { configId: profile.configId, profileId: profile.profileId, tokenKey: "adsAccessToken" } }));
      if (response?.status !== 200 || !Array.isArray(response?.data?.events)) throw new Error("Invalid Amazon history response");
      const data = response.data;
      result.push(...data.events); received += data.events.length;
      if (data.nextToken) {
        if (seenTokens.has(data.nextToken)) throw new Error("Amazon history returned a repeated pagination token");
        seenTokens.add(data.nextToken); token = data.nextToken;
      } else if (data.totalRecords != null && received < Number(data.totalRecords)) {
        if (!data.events.length) throw new Error("Amazon history ended before all records were received");
        offset++; token = undefined;
      } else {
        if (data.totalResults != null && received < Number(data.totalResults)) throw new Error("Amazon history ended without a continuation token");
        break;
      }
    }
  }
  return result;
}
function budgetValue(value) {
  const text = String(value).trim().toUpperCase();
  if (text === "TRUE" || text === "IN_BUDGET") return "IN_BUDGET";
  if (text === "FALSE" || text === "OUT_OF_BUDGET") return "OUT_OF_BUDGET";
  throw new Error("Unknown Amazon budget-availability value");
}
async function syncAmazonCampaignStatusHistory(params) {
  const { profile, adType = "SP" } = params;
  const normalizedType = String(adType).toUpperCase();
  if (!["SP", "SB", "SD"].includes(normalizedType)) throw new Error("Unsupported campaign ad type");
  const model = require(normalizedType === "SB" ? "../models/sbCampaign.model" : normalizedType === "SD" ? "../models/sdCampaign.model" : "../models/campaign.model");
  const ownedIds = params.campaignIds?.length ? params.campaignIds : await model.distinct("campaignId", { configId: profile.configId, profileId: Number(profile.profileId) });
  if (!ownedIds.length) return { isSuccess: true, totalFetched: 0, upsertedCount: 0 };
  // Fetch the profile once when importing many campaigns, then retain only IDs
  // belonging to this ad product. Never relabel another product's events as SP.
  const events = await fetchAmazonCampaignStatusHistory({ ...params, campaignIds: params.campaignIds || [] });
  const allowed = new Set(ownedIds.map(String));
  const bulkOps = [];
  for (const evt of events) {
    if (evt.entityType && String(evt.entityType).toUpperCase() !== "CAMPAIGN") continue;
    const id = String(evt.entityId);
    if (!allowed.has(id)) continue;
    const kind = String(evt.changeType || evt.eventType || "").toUpperCase();
    if (!["STATUS", "IN_BUDGET"].includes(kind)) continue;
    const timestamp = eventDate(evt.timestamp);
    if (evt.newValue == null || evt.newValue === "") throw new Error("Amazon history event is missing its new value");
    const oldValue = evt.previousValue == null || evt.previousValue === "" ? "—" : kind === "IN_BUDGET" ? budgetValue(evt.previousValue) : String(evt.previousValue).trim().toUpperCase();
    const newValue = kind === "IN_BUDGET" ? budgetValue(evt.newValue) : String(evt.newValue).trim().toUpperCase();
    const _id = historyId(["amazon-history", String(profile.configId), profile.profileId, normalizedType, id, kind, timestamp.toISOString(), oldValue, newValue]);
    bulkOps.push({ updateOne: { filter: { _id }, update: { $setOnInsert: {
      configId: new mongoose.Types.ObjectId(String(profile.configId)), profileId: Number(profile.profileId), changeLevel: Number(id),
      changeType: kind === "STATUS" ? "Update Campaign Status" : "Update Campaign Budget Status", oldValue, newValue,
      createdAt: timestamp, updatedFrom: "Amazon Ads History API", source: "AMAZON_API", type: normalizedType, statusHistoryEvent: true,
    } }, upsert: true } });
  }
  const saved = bulkOps.length ? await campaignChangeHistorySchema.collection.bulkWrite(bulkOps, { ordered: false }) : {};
  return { isSuccess: true, totalFetched: events.length, upsertedCount: saved.upsertedCount || 0 };
}
// Invoked by the existing Campaign Listing worker, not by a manual UI action.
async function syncProfileCampaignStatusHistory({ profile, checkConfigAds }) {
  const profiles = require("../models/profiles.model");
  for (const adType of ["SP", "SB", "SD"]) {
    const previous = profile.campaignStatusHistorySyncedAt?.[adType];
    if (previous && Date.now() - +new Date(previous) < 3600000) continue;
    const toDate = Date.now();
    await syncAmazonCampaignStatusHistory({ profile, checkConfigAds, adType,
      ...(previous && { fromDate: +new Date(previous) - 7 * 86400000 }), toDate });
    await profiles.collection.updateOne({ _id: profile._id }, { $set: { ["campaignStatusHistorySyncedAt." + adType]: new Date(toDate) } });
  }
}
module.exports = { fetchAmazonCampaignStatusHistory, syncAmazonCampaignStatusHistory, syncProfileCampaignStatusHistory };
