/**
 * Pure Rule Baseline Bid & Same-Hour Slot Idempotency Helper
 *
 * Ensures that:
 * 1. Hourly / Dayparting rules (e.g., 6-to-12 +2% bid, 12:00 reset to baseline)
 *    always anchor to the original baseline bid before 6 o'clock and never compound
 *    or overwrite `oldValue` even if a rule triggers twice (e.g., at 12:00 and 12:03).
 * 2. Rules cannot execute more than once within the same hour for hourly schedules.
 */

function resolveBaselineBid({
  existingActive = null,
  recentRevert = null,
  currentValue = 0,
  allowMultiTimeChanges = false,
  isHourly = false,
} = {}) {
  const parsedCurrent = parseFloat(currentValue) || 0;
  // Hourly/dayparting rules ALWAYS anchor to the original baseline before the hourly window started
  if (existingActive && existingActive.oldValue !== undefined && existingActive.oldValue !== "") {
    const activeBase = parseFloat(existingActive.oldValue);
    if (!isNaN(activeBase) && activeBase > 0 && (isHourly || !allowMultiTimeChanges)) {
      return activeBase;
    }
  }
  // If a revert record was just written today (e.g. at 12:00) and a second run happens at 12:03
  // before the DB entity bid updated from 1.02 back to 1.00, use the reverted baseline (1.00)
  if (recentRevert && recentRevert.newValue !== undefined && recentRevert.newValue !== "") {
    const revertedBase = parseFloat(recentRevert.newValue);
    if (!isNaN(revertedBase) && revertedBase > 0) {
      return revertedBase;
    }
  }
  if (existingActive && existingActive.oldValue !== undefined && existingActive.oldValue !== "") {
    const activeBase = parseFloat(existingActive.oldValue);
    if (!isNaN(activeBase) && activeBase > 0) {
      return activeBase;
    }
  }
  return parsedCurrent;
}

function hasRuleExecutedInSlotOrHour(executedMap, ruleId, scheduledTime, isHourly = false) {
  if (!executedMap || !ruleId) return false;
  const idStr = String(ruleId);
  const slotStr = String(scheduledTime || "");
  if (executedMap.has(`${idStr}_${slotStr}`)) {
    return true;
  }
  if (isHourly && slotStr.includes(":")) {
    const hourPrefix = slotStr.split(":")[0].padStart(2, "0");
    if (executedMap.has(`${idStr}_HOUR_${hourPrefix}`)) {
      return true;
    }
  }
  return false;
}

function markRuleExecutedInSlotAndHour(executedMap, ruleId, scheduledTime) {
  if (!executedMap || !ruleId) return;
  const idStr = String(ruleId);
  const slotStr = String(scheduledTime || "");
  executedMap.set(`${idStr}_${slotStr}`, true);
  if (slotStr.includes(":")) {
    const hourPrefix = slotStr.split(":")[0].padStart(2, "0");
    executedMap.set(`${idStr}_HOUR_${hourPrefix}`, true);
  }
}

module.exports = {
  resolveBaselineBid,
  hasRuleExecutedInSlotOrHour,
  markRuleExecutedInSlotAndHour,
};
