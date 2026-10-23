// SB/SD histories can be initialized before their channel runs; affected entities retain their baseline.
export function getRuleHistorySnapshot(history) {
  const valid = (snapshot) => snapshot?.capturedAt && Number.isFinite(new Date(snapshot.capturedAt).getTime());
  if (valid(history?.conditionSnapshot)) return history.conditionSnapshot;
  const records = [
    ...(history?.affectedCampaigns || []),
    ...(history?.affectedTargets || []),
    ...(history?.affectedPlacements || []),
    ...(history?.affectedSearchTerms || []),
  ];
  return records.map((record) => record.conditionSnapshot).filter(valid)
    .reduce((earliest, snapshot) => !earliest || new Date(snapshot.capturedAt) < new Date(earliest.capturedAt) ? snapshot : earliest, null);
}
