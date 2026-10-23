const { getValidAccessToken, invalidateAccessToken } = require("../services/amazonAuth.service");

/**
 * Delegate to central amazonAuth service.
 * Retains backward-compatible interface without local Map memory leaks.
 */
async function getCachedAdsToken(configId) {
    if (!configId) throw new Error("configId is required");
    const accessToken = await getValidAccessToken({ kind: "ads", configId });
    return {
        adsAccessToken: accessToken,
    };
}

function updateCachedAdsToken(configId, token) {
    // No-op: Central Redis auth service manages token lifecycle
}

function clearCachedAdsToken(configId) {
    if (configId) {
        invalidateAccessToken({ kind: "ads", configId }).catch(() => {});
    }
}

function clearAllCachedTokens() {
    // No-op
}

module.exports = {
    getCachedAdsToken,
    updateCachedAdsToken,
    clearCachedAdsToken,
    clearAllCachedTokens,
};
