const { calcMetrics } = require("./common");

const METRICS = ["impressions", "clicks", "spend", "sales", "orders"];
const version = (row) => row.importSourceVersion != null && Number.isFinite(Number(row.importSourceVersion))
  ? Number(row.importSourceVersion) : null;

const newerSnapshot = (existing, temporary) => {
  const existingVersion = version(existing);
  const temporaryVersion = version(temporary);
  if (existingVersion !== null || temporaryVersion !== null) {
    return temporaryVersion !== null && (existingVersion === null || temporaryVersion > existingVersion)
      ? temporary : existing;
  }
  // Legacy rows have no report version. Use their last update only when
  // neither row has provenance; retain the genuine row on a tie.
  const time = (row) => new Date(row.updatedAt || row.createdAt || 0).getTime() || 0;
  return time(temporary) > time(existing) ? temporary : existing;
};

const snapshotFilter = (row) => Object.fromEntries([
  "_id", "targetId", "updatedAt", "lastImportRunId", "importSourceVersion", ...METRICS,
].map((field) => [field, row[field] ?? null]));

/** Copy one report snapshot, then remove only the unchanged temporary row. */
const mergeTargetingRecords = async ({ model, existing, temporary, metadata }) => {
  const source = newerSnapshot(existing, temporary);
  const metrics = Object.fromEntries(METRICS.map((field) => [field, Number(source[field]) || 0]));
  const derived = calcMetrics(metrics);
  const set = {
    ...metrics,
    ...derived,
    conversionRate: derived.cvr,
    topOfSearchImpressionShare: source.topOfSearchImpressionShare ?? null,
    status: metadata.status || existing.status || temporary.status,
    keywordBid: metadata.keywordBid ?? existing.keywordBid ?? temporary.keywordBid,
    matchType: metadata.matchType || existing.matchType || temporary.matchType,
    keywordType: metadata.keywordType || existing.keywordType || temporary.keywordType,
  };
  for (const field of Object.keys(set)) if (set[field] === undefined) delete set[field];
  const unset = {};
  for (const field of ["lastImportRunId", "importSourceVersion"]) {
    if (source[field] != null) set[field] = source[field];
    else unset[field] = "";
  }
  const result = await model.updateOne(snapshotFilter(existing), {
    $set: set, ...(Object.keys(unset).length && { $unset: unset }),
  });
  if (result.acknowledged === false) throw new Error("Targeting merge write was not acknowledged");
  if (result.matchedCount !== 1) return false;
  // A report import may update either row during reconciliation. Do not
  // delete a newer temporary snapshot that was not copied above.
  const removed = await model.deleteOne(snapshotFilter(temporary));
  return removed.deletedCount === 1;
};

module.exports = { mergeTargetingRecords };
