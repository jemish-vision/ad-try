const { getValidAccessToken, invalidateAccessToken } = require("../services/amazonAuth.service");

/**
 * Delegate to central amazonAuth service.
 * Retains backward-compatible interface without local Map memory leaks.
 */
async function getCachedSPToken(configId, profileId) {
    if (!configId) throw new Error("configId is required");
    const accessToken = await getValidAccessToken({ kind: "sp", configId, profileId });
    return {
        spAccessToken: accessToken,
    };
}

function updateCachedSPToken(configId, profileId, token) {
    // No-op: Central Redis auth service manages token lifecycle
}

function clearCachedSPToken(configId, profileId) {
    if (configId && profileId) {
        invalidateAccessToken({ kind: "sp", configId, profileId }).catch(() => {});
    }
}

function clearAllCachedSPTokens() {
    // No-op
}

module.exports = {
    getCachedSPToken,
    updateCachedSPToken,
    clearCachedSPToken,
    clearAllCachedSPTokens,
};
