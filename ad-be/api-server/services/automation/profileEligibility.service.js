const { getActivePlanProfiles } = require("../../helper/common");

class ProfileInactiveError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProfileInactiveError";
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Validates whether a specific profile ({configId, profileId}) is currently eligible
 * to execute Ads rules or sync tasks.
 *
 * Preserves the full security and business rules of getActivePlanProfiles:
 * - Profile isActive = true
 * - Ads/SP sync enabled
 * - Active user
 * - Active/non-expired organization
 * - Config isActive = true
 *
 * @param {Object} params
 * @param {string} params.configId
 * @param {number|string} params.profileId
 * @param {'ads'|'sp'} [params.syncType='ads']
 * @returns {Promise<Object>} The verified profile document with populated config info
 */
async function getEligibleProfile({ configId, profileId, syncType = "ads" }) {
  if (!configId || !profileId) {
    throw new ProfileInactiveError("Missing configId or profileId for profile eligibility check.", {
      configId,
      profileId,
    });
  }

  const profiles = await getActivePlanProfiles(profileId, syncType, configId);
  if (!profiles || profiles.length === 0) {
    throw new ProfileInactiveError(
      `Profile ${profileId} under config ${configId} is inactive, unassigned, expired, or ineligible for ${syncType} sync.`,
      { configId, profileId, syncType }
    );
  }

  return profiles[0];
}

module.exports = {
  getEligibleProfile,
  ProfileInactiveError,
};
