'use strict';

const { Types: { ObjectId } } = require('mongoose');

const VALID_MATCH = new Set(['EXACT', 'PHRASE', 'BROAD']);
const VALID_STATUS = new Set(['enabled', 'paused', 'archived']);
const LOOKBACK_DAYS = 60;

function objectId(value) {
  if (value instanceof ObjectId) return value;
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : value;
}

// Best-effort current keyword list, drawn from the keywords collection (which
// stores report-date performance rows per keyword). It cannot prove
// completeness — a keyword with no reporting activity in the lookback window
// may be absent — so it is returned as `bestEffort`, and growth suggestions
// built from it are labelled "confirm before adding".
async function readKeywordInventory({ db, profile, configId, now = Date.now() } = {}) {
  const fallback = {
    rows: [],
    verified: false,
    bestEffort: false,
    dataAsOf: null,
    missingInputs: ['A complete, dated current keyword inventory is required.'],
  };

  if (!db || !profile || profile.profileId === undefined || profile.profileId === null || !configId) {
    return fallback;
  }

  const cutoff = new Date(now - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

  try {
    const raw = await db.collection('keywords').find({
      configId: objectId(configId),
      profileId: Number(profile.profileId),
      reportDate: { $gte: cutoff },
    }, {
      projection: { _id: 0, campaignId: 1, adGroupId: 1, name: 1, matchType: 1, status: 1 },
      maxTimeMS: 8000,
    }).limit(100000).toArray();

    const seen = new Set();
    const rows = [];

    for (const row of raw) {
      const matchType = String(row.matchType || '').toUpperCase();
      const status = String(row.status || 'enabled').toLowerCase();
      const text = String(row.name || '').normalize('NFKC').trim();

      if (!row.campaignId || !row.adGroupId || !text) continue;
      if (!VALID_MATCH.has(matchType) || !VALID_STATUS.has(status)) continue;

      // One keyword has a row per report date; collapse to a single identity.
      const key = `${row.campaignId}|${row.adGroupId}|${text.toLowerCase()}|${matchType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ campaignId: row.campaignId, adGroupId: row.adGroupId, text, matchType, status });
    }

    if (!rows.length) return fallback;

    return {
      rows,
      verified: false, // not a proven-complete snapshot
      bestEffort: true, // usable for a best-effort "already a keyword?" check
      dataAsOf: new Date(now).toISOString(),
      missingInputs: [],
    };
  } catch (_) {
    return fallback;
  }
}

module.exports = { readKeywordInventory };
