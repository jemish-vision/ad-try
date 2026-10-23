const {
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
    batchUpdateSDAdGroups,
    deduplicateByEntityId,
    chunkArray,
} = require("../helper/amazonBatch.helper");
const { cron_logs } = require("../../winston/cronAutomation/logger");

/**
 * Endpoint-specific default batch limits recommended by Amazon Ads API documentation.
 */
const DEFAULT_ENDPOINT_LIMITS = {
    SP_KEYWORDS: 1000,
    SP_TARGETS: 1000,
    SP_CAMPAIGNS: 100,
    SP_ADGROUPS: 100,
    SB_KEYWORDS: 100,
    SB_TARGETS: 100,
    SB_CAMPAIGNS: 10,
    SB_ADGROUPS: 10,
    SD_TARGETS: 100,
    SD_CAMPAIGNS: 100,
    SD_ADGROUPS: 100,
};

/**
 * Universal batch processing service.
 * Supports configurable batch size, entity-ID deduplication, custom DB update builders,
 * and returns comprehensive metrics.
 *
 * @param {Object} params
 * @param {Array} params.updates - Proposed updates to send to Amazon
 * @param {String} params.entityType - Entity type identifier (e.g. 'SP_KEYWORDS', 'SP_TARGETS', 'SP_CAMPAIGNS')
 * @param {Object} params.profile - Amazon Ads profile document with amazonUrl, profileId
 * @param {Object} params.checkConfigAds - Access token object with adsClientId and adsAccessToken
 * @param {String|ObjectId} params.configId - System configuration identifier
 * @param {Object} [params.dbModel] - Mongoose model for executing bulk writes
 * @param {Function} [params.buildDbUpdate] - Callback returning MongoDB update operation for successful items: (item) => ({ updateOne: { filter, update } })
 * @param {Number} [params.batchSize] - Custom batch chunk limit (defaults to endpoint-specific limit or safe default)
 * @returns {Promise<Object>} Execution summary with counts, failed items, and chunks processed
 */
async function processBatchUpdates({
    updates,
    entityType,
    profile,
    checkConfigAds,
    configId,
    dbModel = null,
    buildDbUpdate = null,
    batchSize = null,
}) {
    if (!Array.isArray(updates) || updates.length === 0) {
        return {
            successCount: 0,
            failedCount: 0,
            failedItems: [],
            chunksProcessed: 0,
            successfulItems: [],
        };
    }

    const effectiveBatchSize = batchSize || DEFAULT_ENDPOINT_LIMITS[entityType] || 100;

    let result;
    switch (entityType) {
        case "SP_KEYWORDS":
            result = await batchUpdateSPKeywords({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SP_TARGETS":
            result = await batchUpdateSPTargets({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SP_CAMPAIGNS":
            result = await batchUpdateSPCampaigns({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SP_ADGROUPS":
            result = await batchUpdateSPAdGroups({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SB_KEYWORDS":
            result = await batchUpdateSBKeywords({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SB_TARGETS":
            result = await batchUpdateSBTargets({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SB_CAMPAIGNS":
            result = await batchUpdateSBCampaigns({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SB_ADGROUPS":
            result = await batchUpdateSBAdGroups({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SD_TARGETS":
            result = await batchUpdateSDTargets({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SD_CAMPAIGNS":
            result = await batchUpdateSDCampaigns({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        case "SD_ADGROUPS":
            result = await batchUpdateSDAdGroups({ profile, checkConfigAds, configId, items: updates, batchSize: effectiveBatchSize });
            break;
        default:
            throw new Error(`Unsupported entityType: ${entityType}`);
    }

    const { successful = [], failed = [] } = result;
    const chunksProcessed = Math.ceil(updates.length / effectiveBatchSize);

    // If a database model and custom update builder are provided, execute bulkWrite for successful items
    if (dbModel && typeof buildDbUpdate === "function" && successful.length > 0) {
        const bulkOperations = successful.map(buildDbUpdate).filter(Boolean);
        if (bulkOperations.length > 0) {
            try {
                await dbModel.bulkWrite(bulkOperations);
                cron_logs({
                    message: `[amazonBatchService] Successfully wrote ${bulkOperations.length} records to ${dbModel.modelName || "database"}`,
                    log_type: "info",
                });
            } catch (dbErr) {
                cron_logs({
                    message: `[amazonBatchService] Error executing bulkWrite: ${dbErr.message || dbErr}`,
                    log_type: "error",
                });
            }
        }
    }

    return {
        successCount: successful.length,
        failedCount: failed.length,
        failedItems: failed,
        successfulItems: successful,
        chunksProcessed,
    };
}

module.exports = {
    processBatchUpdates,
    DEFAULT_ENDPOINT_LIMITS,
};
