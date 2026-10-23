const { cron_logs } = require("../../winston/cronAutomation/logger");
const { getValidAccessToken, forceRefreshOne } = require("./amazonAuth.service");

/**
 * Targeted Ads Token Refresh (delegates to distributed auth service)
 */
exports.refreshAdsToken = async (configId) => {
  return await forceRefreshOne({ kind: "ads", configId, reason: "targeted_refresh" });
};

/**
 * Targeted SP Token Refresh (delegates to distributed auth service)
 */
exports.refreshSPToken = async (configId, profileId) => {
  return await forceRefreshOne({ kind: "sp", configId, profileId, reason: "targeted_refresh" });
};

/**
 * Compatibility export for legacy cron triggers.
 * Mass-refresh loops have been retired; tokens are refreshed distributed and on-demand.
 */
exports.RefreshToken = async () => {
  cron_logs({
    message: `[amazon.services] Legacy RefreshToken called: token lifecycles are now handled distributed and on-demand via amazonAuth.service.`,
    log_type: "info",
  });
};