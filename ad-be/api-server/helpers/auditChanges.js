function auditValues(record, fields) {
  if (!record) return null;
  return Object.fromEntries(fields.flatMap(field =>
    record[field] === undefined ? [] : [[field, record[field]]]
  ));
}

async function readAuditValues(model, filter, fields) {
  try {
    return auditValues(await model.findOne(filter, fields.join(" ")).lean(), fields);
  } catch {
    console.warn("[audit] Could not read previous values");
    return undefined;
  }
}

const ruleAuditFields = [
  "ruleName", "name", "conditions", "actions", "actionType", "days", "times", "ruleType",
  "type", "startDate", "endDate", "reportDate", "toDate", "allowMultiTimeChanges",
  "daysSinceCreation", "isHourlyBid", "hourlyConfig", "campaignSelectionType", "campaignIds",
  "gridName", "tagIds", "frequency", "slotType", "bidChangeType", "slots", "campaigns", "targetingIds",
];

module.exports = { auditValues, readAuditValues, ruleAuditFields };
