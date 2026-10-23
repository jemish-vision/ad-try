// Only IDs selected from the loaded profile's campaign list may create a rule.
import { TYPE_MAP } from './common';

export function assignCampaignsToDraft(draft, selectedIds, campaigns) {
  if (!draft) return null;
  const selected = new Set((selectedIds || []).map(String));
  const campaignIds = { SP: [], SB: [], SD: [] };
  for (const campaign of campaigns || []) {
    const type = TYPE_MAP[campaign.type] || String(campaign.type || '').toUpperCase();
    if (campaignIds[type] && selected.has(String(campaign.campaignId)) && !campaignIds[type].includes(campaign.campaignId)) {
      campaignIds[type].push(campaign.campaignId);
    }
  }
  if (!Object.values(campaignIds).some((ids) => ids.length)) return null;
  const query = {};
  for (const type of Object.keys(campaignIds)) {
    const original = draft.query?.[type] ?? '{}';
    const conditions = typeof original === 'string' ? JSON.parse(original) : original;
    query[type] = JSON.stringify({ ...conditions, campaignId: { $in: campaignIds[type] } });
  }
  return { ...draft, campaignIds, query };
}
