// Creation persists assignment in the same rule document, so cancelled drafts cannot leave an orphan rule.
const CAMPAIGN_TYPES = ["SP", "SB", "SD"];

function validateCampaignAssignment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Select at least one campaign before creating the rule." };
  }
  const campaignIds = { SP: [], SB: [], SD: [] };
  for (const type of CAMPAIGN_TYPES) {
    const ids = value[type] === undefined ? [] : value[type];
    if (!Array.isArray(ids)) return { error: "Campaign selections must be arrays of campaign IDs." };
    for (const id of ids) {
      if ((typeof id !== "number" && typeof id !== "string") || String(id).trim() === "") {
        return { error: "Campaign selections contain an invalid campaign ID." };
      }
      const number = Number(id);
      if (!Number.isSafeInteger(number) || number <= 0) {
        return { error: "Campaign selections contain an invalid campaign ID." };
      }
      campaignIds[type].push(number);
    }
    campaignIds[type] = [...new Set(campaignIds[type])];
  }
  if (!CAMPAIGN_TYPES.some(type => campaignIds[type].length)) {
    return { error: "Select at least one campaign before creating the rule." };
  }
  return { campaignIds };
}

module.exports = { validateCampaignAssignment };
