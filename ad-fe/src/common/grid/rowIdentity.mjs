// A campaign is a parent identity, not a unique targeting/placement row ID.
const identityFields = [
  'id', '_id', 'guid', 'configId', 'profileId', 'adType', 'type',
  'campaignId', 'campaignID', 'adGroupId', 'targetId', 'targetingId',
  'keywordId', 'adId', 'placement', 'placementType', 'targeting',
  'keywordText', 'matchType', 'searchTerm', 'sku', 'asin', 'state',
  'fcCode', 'reportDate',
];

export function createRowIdentityMap(rows = [], namespace = 'row') {
  const ids = new WeakMap();
  const occurrences = new Map();
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const identity = identityFields
      .filter(field => row[field] !== undefined && row[field] !== null && row[field] !== '')
      .map(field => [field, row[field]]);
    const base = identity.length ? JSON.stringify(identity) : `index:${index}`;
    const occurrence = occurrences.get(base) || 0;
    occurrences.set(base, occurrence + 1);
    ids.set(row, `${namespace}:${base}:${occurrence}`);
  });
  return ids;
}
