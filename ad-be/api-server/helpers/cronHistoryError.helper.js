/**
 * Builds the `error` text stored on a FAILED cronJobHistory row, so FAILED rows explain themselves.
 */

/**
 * @param {Object<string,string>} statuses e.g. { SP: "COMPLETED", SB: "ERROR", SD: "ERROR" }
 * @returns {string}
 */
const reportRequestFailureReason = (statuses = {}) => {
  const entries = Object.entries(statuses);
  const failed = entries.filter(([, s]) => s === "ERROR").map(([k]) => k);
  const detail = entries.map(([k, s]) => `${k}: ${s ?? "N/A"}`).join(", ");
  return `Amazon report request failed for ${failed.join(", ") || "unknown ad type"} (${detail}). See reports.errorMessage / utility logs for Amazon's response.`;
};

/**
 * @param {string} groupId synchronizeDetails group the guard checks, e.g. "CAMPAIGNS"
 * @param {string} type "ads" | "seller"
 */
const syncNotCompletedReason = (groupId, type = "ads") =>
  `Skipped: profile has no COMPLETED synchronizeDetails row for group ${groupId} (${type}). Execute the profile's sync request to enable this report.`;

module.exports = { reportRequestFailureReason, syncNotCompletedReason };
