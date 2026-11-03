const crypto = require("crypto");

function bid(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function identityFor({ rule, type, targeting }) {
    const identity = {
        configId: String(rule.configId || ""),
        profileId: Number(rule.profileId),
        ruleId: String(rule._id || ""),
        type: String(type || "").toUpperCase(),
        campaignId: String(targeting.campaignId ?? ""),
        adGroupId: String(targeting.adGroupId ?? ""),
        targetId: String(targeting.targetId ?? ""),
    };
    if (!identity.configId || !identity.ruleId || !Number.isFinite(identity.profileId) ||
        !["SP", "SB", "SD"].includes(identity.type) || !identity.campaignId || !identity.targetId) {
        throw new Error("Hourly targeting baseline requires account, rule, ad type, campaign and target identity");
    }
    // Preserve T-/K- namespaces: a keyword and target with the same numeric ID
    // are different Amazon entities and must never share a baseline.
    const _id = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    return { _id, ...identity };
}

function isManual(record) {
    return record?.isManual === true || record?.source === "MANUAL" ||
        (record?.metricsHistory || []).some(s => /^MANUAL/i.test(s.eventType || "") || /manual run/i.test(s.notes || ""));
}

function candidateFromHistory(record) {
    const oldBid = bid(record?.oldValue);
    const newBid = bid(record?.newValue);
    if (isManual(record)) return newBid === null ? null : { baselineBid: newBid, bootstrapSource: "MANUAL_BOUNDARY" };
    const returnedToBaseline = record?.returnedToBaseline === true || (record?.metricsHistory || []).some(s => s.eventType === "REVERT_TO_BASELINE");
    // An explicit user revert flag is different: that endpoint restores oldValue.
    if (returnedToBaseline && newBid !== null) return { baselineBid: newBid, bootstrapSource: "RESTORED_BASELINE" };
    if (record?.isReverted && oldBid !== null) return { baselineBid: oldBid, bootstrapSource: "EXPLICIT_REVERT" };
    // Corrupt 0%-slot rows (3.95 -> 3.95) cannot establish an original bid.
    if (oldBid !== null && newBid !== null && oldBid !== newBid) {
        return { baselineBid: oldBid, bootstrapSource: "LIFECYCLE_ORIGINAL" };
    }
    return null;
}

function historyQuery(identity) {
    // Mongoose does not cast aggregation pipelines, unlike find() queries.
    const { Types } = require("mongoose");
    const objectId = value => Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
    const raw = identity.targetId.replace(/^[TK]-/, "");
    // A historical raw numeric ID cannot distinguish a keyword from a target.
    // When the caller has a namespace, bootstrap only from that exact namespace;
    // never adopt a K- baseline for a T- entity through a shared numeric alias.
    const ids = /^[TK]-/.test(identity.targetId) ? [identity.targetId] : [raw];
    if (!/^[TK]-/.test(identity.targetId) && Number.isFinite(Number(raw))) ids.push(Number(raw));
    return {
        configId: objectId(identity.configId), profileId: identity.profileId,
        ruleSchema: "TargetingRule", ruleId: objectId(identity.ruleId), type: identity.type,
        campaignId: Number(identity.campaignId),
        ...(identity.adGroupId ? { adGroupId: Number(identity.adGroupId) } : {}),
        targetId: { $in: ids }, changed: "bid",
    };
}

function historyPipeline(identity) {
    const anyEvent = condition => ({ $anyElementTrue: [{ $map: { input: { $ifNull: ["$metricsHistory", []] }, as: "event", in: condition } }] });
    return [
        { $match: historyQuery(identity) },
        { $sort: { createdAt: -1, _id: -1 } },
        { $project: {
            oldValue: 1, newValue: 1, createdAt: 1, isReverted: 1,
            isManual: { $or: [
                { $eq: ["$isManual", true] }, { $eq: ["$source", "MANUAL"] },
                anyEvent({ $or: [
                    { $regexMatch: { input: { $ifNull: ["$$event.eventType", ""] }, regex: "^MANUAL", options: "i" } },
                    { $regexMatch: { input: { $ifNull: ["$$event.notes", ""] }, regex: "manual run", options: "i" } },
                ] }),
            ] },
            returnedToBaseline: anyEvent({ $eq: ["$$event.eventType", "REVERT_TO_BASELINE"] }),
        } },
    ];
}

function newestFirst(a, b) {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || String(b._id || "").localeCompare(String(a._id || ""));
}

async function bootstrapFromHistory(historyModel, identity, existingActive) {
    // Project only bid provenance, never transfer metric histories. Stream without
    // a count cap: a meaningful original may follow thousands of no-op rows.
    const cursor = historyModel.aggregate(historyPipeline(identity)).allowDiskUse(true).cursor({ batchSize: 256 });
    let active = existingActive;
    const choose = record => {
        const value = candidateFromHistory(record);
        return value ? { ...value, bootstrapHistoryId: record._id ? String(record._id) : null } : null;
    };
    try {
        for await (const record of cursor) {
            if (active && String(active._id) === String(record._id)) active = null;
            if (active && newestFirst(active, record) <= 0) {
                const chosen = choose(active);
                active = null;
                if (chosen) return chosen;
            }
            const chosen = choose(record);
            if (chosen) return chosen;
        }
        return active ? choose(active) : null;
    } finally {
        await cursor.close();
    }
}

/**
 * Resolve and durably freeze the scheduled hourly rule's original bid BEFORE
 * submitting an Amazon action. Manual/non-hourly arithmetic is left unchanged.
 * Dependencies are injectable for tests; production uses ordinary Mongoose models.
 * A later manual bid edit does not invalidate an already frozen record: rebasing
 * needs an explicit baseline epoch/reset policy. Ambiguous raw-ID history is not
 * used to bootstrap a prefixed T-/K- entity.
 */
async function resolveHourlyTargetingBaseline({ rule, type, targeting, existingActive, isManual: manual = false }, dependencies = {}) {
    if (manual || !rule.isHourlyBid) {
        return String(type).toUpperCase() === "SP" && existingActive
            ? (parseFloat(existingActive.oldValue) || parseFloat(targeting.keywordBid))
            : parseFloat(targeting.keywordBid);
    }
    const identity = identityFor({ rule, type, targeting });
    const model = dependencies.baselineModel || require("../models/hourlyTargetingBaseline.model");
    const frozen = await model.findById(identity._id).lean();
    if (frozen) {
        const value = bid(frozen.baselineBid);
        if (value === null) throw new Error("Stored hourly targeting baseline is invalid");
        return value;
    }

    const historyModel = dependencies.historyModel || require("../models/affectedCampaignByRule.model");
    let chosen = await bootstrapFromHistory(historyModel, identity, existingActive);
    if (!chosen) {
        const fallback = bid(targeting.keywordBid);
        if (fallback === null) throw new Error("Cannot establish an hourly targeting baseline from invalid bids");
        chosen = { baselineBid: fallback, bootstrapSource: "FIRST_OBSERVED_BID", bootstrapHistoryId: null };
    }
    let record;
    try {
        record = await model.findOneAndUpdate({ _id: identity._id }, { $setOnInsert: { ...identity, ...chosen } },
            { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    } catch (err) {
        if (err.code !== 11000) throw err;
        record = await model.findById(identity._id).lean();
        if (!record) throw err;
    }
    const value = bid(record?.baselineBid);
    if (value === null) throw new Error("Failed to freeze an hourly targeting baseline");
    return value;
}

module.exports = { resolveHourlyTargetingBaseline, identityFor, candidateFromHistory };
