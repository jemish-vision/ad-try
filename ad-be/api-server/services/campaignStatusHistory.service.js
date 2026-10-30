const { createHash, randomUUID } = require("crypto");
const mongoose = require("mongoose");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const historyId = value => new mongoose.Types.ObjectId(digest(value).slice(0, 24));
function eventDate(value) {
  if (value === undefined || value === null || value === "") throw new Error("Campaign history requires the source event timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid campaign history event timestamp");
  return date;
}
function normalizeCampaignAdType(value = "SP") {
  const key = String(value).toUpperCase().replace(/[ -]/g, "_");
  const type = ({ SP: "SP", SPONSORED_PRODUCTS: "SP", SB: "SB", SPONSORED_BRANDS: "SB", SD: "SD", SPONSORED_DISPLAY: "SD" })[key];
  if (!type) throw new Error("Unknown campaign ad product");
  return type;
}
const CHANGE_TYPES = { STATE: "Update Campaign Status", IN_BUDGET: "Update Campaign Budget Status", DELIVERY: "Update Campaign Delivery Status" };

// Persist observations separately from campaign configuration. A per-entity Mongo
// lease serializes workers; stable event IDs make partial-write retries safe.
// Late events repair their own transition and the following transition.
function createCampaignStatusRecorder({ observations, history }) {
  let ready;
  const prepare = () => ready ||= Promise.all([
    observations.createIndex({ entity: 1, eventTime: 1, _id: 1 }),
    observations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch(error => { ready = null; throw error; });
  async function observe({ configId, profileId, campaignId, adType = "SP", dimension, value, timestamp }) {
    adType = normalizeCampaignAdType(adType);
    if (!CHANGE_TYPES[dimension]) throw new Error("Unsupported campaign status dimension");
    if (value === undefined || value === null || value === "") return;
    const eventTime = eventDate(timestamp);
    const entity = digest([String(configId), String(profileId), String(campaignId), adType, dimension]);
    const id = digest([entity, eventTime.toISOString(), String(value)]);
    await prepare();
    const lockId = "lock:" + entity, owner = randomUUID();
    try { await observations.updateOne({ _id: lockId }, { $setOnInsert: { leaseUntil: new Date(0) } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    let locked = false;
    const deadline = Date.now() + 15000;
    while (!locked && Date.now() < deadline) {
      const result = await observations.updateOne({ _id: lockId, leaseUntil: { $lte: new Date() } }, { $set: { owner, leaseUntil: new Date(Date.now() + 300000) } });
      locked = result.modifiedCount === 1;
      if (!locked) await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!locked) throw new Error("Campaign status history is busy; retry the event");
    try {
      await observations.updateOne({ _id: id }, { $setOnInsert: { entity, eventTime, value: String(value),
        expiresAt: new Date(eventTime.getTime() + 396 * 86400000) } }, { upsert: true, maxTimeMS: 10000 });
      const predecessor = row => observations.find({ entity, $or: [
        { eventTime: { $lt: row.eventTime } }, { eventTime: row.eventTime, _id: { $lt: row._id } },
      ] }).sort({ eventTime: -1, _id: -1 }).limit(1).maxTimeMS(10000).next();
      const current = { _id: id, entity, eventTime, value: String(value) };
      const successor = await observations.find({ entity, $or: [
        { eventTime: { $gt: eventTime } }, { eventTime, _id: { $gt: id } },
      ] }).sort({ eventTime: 1, _id: 1 }).limit(1).maxTimeMS(10000).next();
      for (const row of [current, successor].filter(Boolean)) {
        const previous = await predecessor(row);
        const _id = historyId(["campaign-status-observation", row._id]);
        if (!previous || previous.value === row.value) {
          await history.deleteOne({ _id }, { maxTimeMS: 10000 });
        } else {
          await history.updateOne({ _id }, { $set: {
            configId: new mongoose.Types.ObjectId(String(configId)), profileId: Number(profileId),
            changeLevel: Number(campaignId), type: adType, changeType: CHANGE_TYPES[dimension],
            oldValue: previous.value, newValue: row.value, createdAt: row.eventTime,
            updatedFrom: "Amazon Stream", source: "AMAZON_SQS", statusHistoryEvent: true,
          } }, { upsert: true, maxTimeMS: 10000 });
        }
      }
    } finally {
      await observations.updateOne({ _id: lockId, owner }, { $set: { leaseUntil: new Date(0) }, $unset: { owner: "" } });
    }
  }
  return { observe };
}
let recorder;
function observeCampaignStatus(params) {
  recorder ||= createCampaignStatusRecorder({ observations: mongoose.connection.collection("campaignStatusObservations"),
    history: require("../models/campaignChangeHistory.model").collection });
  return recorder.observe(params);
}
module.exports = { createCampaignStatusRecorder, observeCampaignStatus, eventDate, historyId, normalizeCampaignAdType };
