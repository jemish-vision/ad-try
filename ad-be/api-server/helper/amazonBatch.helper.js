const amazonAxios = require("./amazonAxios");
const { retryWithBackoff } = require("./retryHelper");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Split an array into chunks of a given maximum size.
 */
function chunkArray(array, size = 100) {
    if (!Array.isArray(array) || array.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Deduplicate an array of update items by a specific entity ID key.
 * Keeps the latest occurrence if duplicates appear.
 */
function deduplicateByEntityId(items, idKey) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const map = new Map();
    for (const item of items) {
        const id = item[idKey] ?? item?.id;
        if (id !== undefined && id !== null) {
            map.set(String(id), item);
        }
    }
    return Array.from(map.values());
}

/**
 * Generic handler to chunk and dispatch batch updates to Amazon Ads API.
 * Maps responses back to original items safely by ID, not by index.
 */
async function executeBatchUpdate({
    profile,
    checkConfigAds,
    configId,
    items,
    idKey,
    batchSize = 100,
    endpointUrl,
    contentType,
    accept,
    buildPayload,
    parseResponse,
    logPrefix = "AmazonBatch"
}) {
    if (!Array.isArray(items) || items.length === 0) {
        return { successful: [], failed: [] };
    }

    const uniqueItems = deduplicateByEntityId(items, idKey);
    const chunks = chunkArray(uniqueItems, batchSize);
    const allSuccessful = [];
    const allFailed = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const chunkMap = new Map();
        chunk.forEach(item => {
            const idVal = String(item[idKey] ?? item?.id);
            chunkMap.set(idVal, item);
        });

        const headers = {
            "Amazon-Advertising-API-ClientId": checkConfigAds.adsClientId,
            "Amazon-Advertising-API-Scope": profile.profileId,
            "Authorization": `Bearer ${checkConfigAds.adsAccessToken}`,
        };
        if (contentType) headers["Content-Type"] = contentType;
        if (accept) {
            headers["Accept"] = accept;
            headers["Prefer"] = "return=representation";
        }

        const options = {
            method: "PUT",
            url: endpointUrl,
            headers,
            data: buildPayload(chunk),
            meta: { configId, tokenKey: "adsAccessToken" }
        };

        try {
            const response = await retryWithBackoff(() => amazonAxios(options));

            cron_logs({
                message: `[${logPrefix}] Chunk ${chunkIndex + 1}/${chunks.length} status: ${response?.status}`,
                log_type: "info",
            });

            if (response?.status === 207 || response?.status === 200) {
                const { successIds, errorMap } = parseResponse(response.data, chunk, idKey);

                for (const item of chunk) {
                    const idVal = String(item[idKey] ?? item?.id);
                    if (successIds.has(idVal)) {
                        allSuccessful.push(item);
                    } else {
                        const errorReason = errorMap.get(idVal) || "Amazon rejected the update";
                        allFailed.push({ item, reason: errorReason });
                        cron_logs({
                            message: `[${logPrefix}] Item update failed for ID ${idVal}: ${errorReason}`,
                            log_type: "error",
                        });
                    }
                }
            } else {
                for (const item of chunk) {
                    allFailed.push({ item, reason: `Unexpected Amazon status ${response?.status}` });
                }
            }
        } catch (err) {
            cron_logs({
                message: `[${logPrefix}] Batch request failed for chunk ${chunkIndex + 1}: ${err.message || err}`,
                log_type: "error",
            });
            for (const item of chunk) {
                allFailed.push({ item, reason: err.message || "Batch request failed" });
            }
        }
    }

    return { successful: allSuccessful, failed: allFailed };
}

// ─────────────────────────────────────────────────────────────────────────────
// SPONSORED PRODUCTS BATCH UPDATES
// ─────────────────────────────────────────────────────────────────────────────

async function batchUpdateSPKeywords({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "keywordId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sp/keywords`,
        contentType: "application/vnd.spKeyword.v3+json",
        accept: "application/vnd.spKeyword.v3+json",
        buildPayload: (chunk) => ({
            keywords: chunk.map(item => {
                const payload = { keywordId: String(item.keywordId).replace(/^K-/, "") };
                if (item.state !== undefined) payload.state = String(item.state).toUpperCase();
                if (item.bid !== undefined) payload.bid = Number(item.bid);
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.keywords?.success || []).map(k => String(k.keywordId)));
            const errorMap = new Map();
            (data?.keywords?.error || []).forEach(e => {
                errorMap.set(String(e.keywordId), e.description || e.code || "Keyword update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSPKeywords"
    });
}

async function batchUpdateSPTargets({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "targetId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sp/targets`,
        contentType: "application/vnd.sptargetingClause.v3+json",
        accept: "application/vnd.sptargetingClause.v3+json",
        buildPayload: (chunk) => ({
            targetingClauses: chunk.map(item => {
                const payload = { targetId: String(item.targetId).replace(/^T-/, "") };
                if (item.state !== undefined) payload.state = String(item.state).toUpperCase();
                if (item.bid !== undefined) payload.bid = Number(item.bid);
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.targetingClauses?.success || []).map(t => String(t.targetId)));
            const errorMap = new Map();
            (data?.targetingClauses?.error || []).forEach(e => {
                errorMap.set(String(e.targetId), e.description || e.code || "Target update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSPTargets"
    });
}

async function batchUpdateSPCampaigns({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "campaignId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sp/campaigns`,
        contentType: "application/vnd.spCampaign.v3+json",
        accept: "application/vnd.spCampaign.v3+json",
        buildPayload: (chunk) => ({
            campaigns: chunk.map(item => {
                const payload = { campaignId: String(item.campaignId) };
                if (item.state !== undefined) payload.state = String(item.state).toUpperCase();
                if (item.budget !== undefined) {
                    payload.budget = typeof item.budget === "object" ? item.budget : { budget: Number(item.budget), budgetType: "DAILY" };
                }
                if (item.bidding !== undefined) {
                    payload.bidding = item.bidding;
                }
                if (item.dynamicBidding !== undefined) {
                    payload.dynamicBidding = item.dynamicBidding;
                }
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.campaigns?.success || []).map(c => String(c.campaignId)));
            const errorMap = new Map();
            (data?.campaigns?.error || []).forEach(e => {
                errorMap.set(String(e.campaignId), e.description || e.code || "Campaign update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSPCampaigns"
    });
}

async function batchUpdateSPAdGroups({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "adGroupId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sp/adGroups`,
        contentType: "application/vnd.spAdGroup.v3+json",
        accept: "application/vnd.spAdGroup.v3+json",
        buildPayload: (chunk) => ({
            adGroups: chunk.map(item => {
                const payload = { adGroupId: String(item.adGroupId) };
                if (item.state !== undefined) payload.state = String(item.state).toUpperCase();
                if (item.defaultBid !== undefined) payload.defaultBid = Number(item.defaultBid);
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.adGroups?.success || []).map(a => String(a.adGroupId)));
            const errorMap = new Map();
            (data?.adGroups?.error || []).forEach(e => {
                errorMap.set(String(e.adGroupId), e.description || e.code || "AdGroup update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSPAdGroups"
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SPONSORED BRANDS BATCH UPDATES
// ─────────────────────────────────────────────────────────────────────────────

async function batchUpdateSBKeywords({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "keywordId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sb/keywords`,
        contentType: "application/json",
        buildPayload: (chunk) => chunk.map(item => {
            const payload = { keywordId: parseInt(String(item.keywordId).replace(/^K-/, "")) };
            if (item.adGroupId) payload.adGroupId = item.adGroupId;
            if (item.campaignId) payload.campaignId = item.campaignId;
            if (item.state !== undefined) payload.state = String(item.state).toLowerCase();
            if (item.bid !== undefined) payload.bid = Number(item.bid);
            return payload;
        }),
        parseResponse: (data, chunk) => {
            const successIds = new Set();
            const errorMap = new Map();
            if (Array.isArray(data)) {
                data.forEach((res, index) => {
                    const fallbackId = String(chunk[index]?.keywordId);
                    const id = res?.keywordId ? String(res.keywordId) : fallbackId;
                    if (res?.code === "SUCCESS" || res?.keywordId) {
                        successIds.add(id);
                    } else {
                        errorMap.set(id, res?.description || res?.code || "SB Keyword update failed");
                    }
                });
            }
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSBKeywords"
    });
}

async function batchUpdateSBTargets({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "targetId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sb/targets`,
        contentType: "application/json",
        buildPayload: (chunk) => ({
            targets: chunk.map(item => {
                const payload = { targetId: parseInt(String(item.targetId).replace(/^T-/, "")) };
                if (item.adGroupId) payload.adGroupId = item.adGroupId;
                if (item.campaignId) payload.campaignId = item.campaignId;
                if (item.state !== undefined) payload.state = String(item.state).toLowerCase();
                if (item.bid !== undefined) payload.bid = Number(item.bid);
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.targets?.success || []).map(t => String(t.targetId)));
            const errorMap = new Map();
            (data?.targets?.error || []).forEach(e => {
                errorMap.set(String(e.targetId), e.description || e.code || "SB Target update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSBTargets"
    });
}

async function batchUpdateSBCampaigns({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "campaignId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sb/v4/campaigns`,
        contentType: "application/vnd.sbcampaignresource.v4+json",
        accept: "application/vnd.sbcampaignresource.v4+json",
        buildPayload: (chunk) => ({
            campaigns: chunk.map(item => {
                const payload = { campaignId: String(item.campaignId) };
                if (item.state !== undefined) payload.state = String(item.state).toUpperCase();
                if (item.budget !== undefined) {
                    payload.budget = typeof item.budget === "object" ? item.budget : { budget: Number(item.budget), budgetType: "DAILY" };
                }
                if (item.bidding !== undefined) payload.bidding = item.bidding;
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.campaigns?.success || []).map(c => String(c.campaignId)));
            const errorMap = new Map();
            (data?.campaigns?.error || []).forEach(e => {
                errorMap.set(String(e.campaignId), e.description || e.code || "SB Campaign update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSBCampaigns"
    });
}

async function batchUpdateSBAdGroups({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "adGroupId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sb/v4/adGroups`,
        contentType: "application/vnd.sbadgroupresource.v4+json",
        accept: "application/vnd.sbadgroupresource.v4+json",
        buildPayload: (chunk) => ({
            adGroups: chunk.map(item => {
                const payload = { adGroupId: String(item.adGroupId) };
                if (item.state !== undefined) payload.state = String(item.state).toUpperCase();
                return payload;
            })
        }),
        parseResponse: (data) => {
            const successIds = new Set((data?.adGroups?.success || []).map(a => String(a.adGroupId)));
            const errorMap = new Map();
            (data?.adGroups?.error || []).forEach(e => {
                errorMap.set(String(e.adGroupId), e.description || e.code || "SB AdGroup update error");
            });
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSBAdGroups"
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SPONSORED DISPLAY BATCH UPDATES
// ─────────────────────────────────────────────────────────────────────────────

async function batchUpdateSDTargets({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "targetId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sd/targets`,
        contentType: "application/json",
        buildPayload: (chunk) => chunk.map(item => {
            const payload = { targetId: parseInt(String(item.targetId).replace(/^T-/, "")) };
            if (item.state !== undefined) payload.state = String(item.state).toLowerCase();
            if (item.bid !== undefined) payload.bid = Number(item.bid);
            return payload;
        }),
        parseResponse: (data, chunk) => {
            const successIds = new Set();
            const errorMap = new Map();
            if (Array.isArray(data)) {
                data.forEach((res, index) => {
                    const fallbackId = String(chunk[index]?.targetId);
                    const id = res?.targetId ? String(res.targetId) : fallbackId;
                    if (res?.code === "SUCCESS" || res?.targetId) {
                        successIds.add(id);
                    } else {
                        errorMap.set(id, res?.description || res?.code || "SD Target update failed");
                    }
                });
            }
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSDTargets"
    });
}

async function batchUpdateSDCampaigns({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "campaignId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sd/campaigns`,
        contentType: "application/json",
        buildPayload: (chunk) => chunk.map(item => {
            const payload = { campaignId: parseInt(item.campaignId) };
            if (item.state !== undefined) payload.state = String(item.state).toLowerCase();
            if (item.budget !== undefined) payload.budget = Number(item.budget);
            return payload;
        }),
        parseResponse: (data, chunk) => {
            const successIds = new Set();
            const errorMap = new Map();
            if (Array.isArray(data)) {
                data.forEach((res, index) => {
                    const fallbackId = String(chunk[index]?.campaignId);
                    const id = res?.campaignId ? String(res.campaignId) : fallbackId;
                    if (res?.code === "SUCCESS" || res?.campaignId) {
                        successIds.add(id);
                    } else {
                        errorMap.set(id, res?.description || res?.code || "SD Campaign update failed");
                    }
                });
            }
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSDCampaigns"
    });
}

async function batchUpdateSDAdGroups({ profile, checkConfigAds, configId, items, batchSize = 100 }) {
    return executeBatchUpdate({
        profile,
        checkConfigAds,
        configId,
        items,
        idKey: "adGroupId",
        batchSize,
        endpointUrl: `${profile.amazonUrl}/sd/adGroups`,
        contentType: "application/json",
        buildPayload: (chunk) => chunk.map(item => {
            const payload = { adGroupId: parseInt(item.adGroupId) };
            if (item.state !== undefined) payload.state = String(item.state).toLowerCase();
            if (item.defaultBid !== undefined) payload.defaultBid = Number(item.defaultBid);
            return payload;
        }),
        parseResponse: (data, chunk) => {
            const successIds = new Set();
            const errorMap = new Map();
            if (Array.isArray(data)) {
                data.forEach((res, index) => {
                    const fallbackId = String(chunk[index]?.adGroupId);
                    const id = res?.adGroupId ? String(res.adGroupId) : fallbackId;
                    if (res?.code === "SUCCESS" || res?.adGroupId) {
                        successIds.add(id);
                    } else {
                        errorMap.set(id, res?.description || res?.code || "SD AdGroup update failed");
                    }
                });
            }
            return { successIds, errorMap };
        },
        logPrefix: "BatchUpdateSDAdGroups"
    });
}

module.exports = {
    chunkArray,
    deduplicateByEntityId,
    executeBatchUpdate,
    batchUpdateSPKeywords,
    batchUpdateSPTargets,
    batchUpdateSPCampaigns,
    batchUpdateSPAdGroups,
    batchUpdateSBKeywords,
    batchUpdateSBTargets,
    batchUpdateSBCampaigns,
    batchUpdateSBAdGroups,
    batchUpdateSDTargets,
    batchUpdateSDCampaigns,
    batchUpdateSDAdGroups
};
