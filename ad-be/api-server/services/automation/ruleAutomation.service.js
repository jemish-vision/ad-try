const moment = require("moment-timezone");
const { getEligibleProfile } = require("./profileEligibility.service");
const { isShadowModeEnabled } = require("../../../shared/automationMode");
const { formatTimeBlock } = require("../../../queue-service/contracts/jobId");
const { claimAction } = require("./ruleActionExecution.service");
const { executeBudgetRulesForProfile } = require("../../controllers/budgetRules.controller");
const { executeTargetingRulesForProfile } = require("../../controllers/targeting.controller");
const { executePlacementRulesForProfile } = require("../../controllers/placement.controller");
const { executeDaypartingRulesForProfile } = require("../../controllers/daypartingstretegy.controller");
const { PermanentJobError } = require("../../../queue-service/contracts/errors");

const budgetRulesSchema = require("../../models/budgetRules.model");
const targetingRuleSchema = require("../../models/targetingRuleSchema.model");
const placementRulesSchema = require("../../models/placementRules.model");
const daypartingRuleSchema = require("../../models/daypartingRule.model");

function getActiveSlot(slots, hour) {
  if (!Array.isArray(slots) || slots.length === 0) return null;
  return slots.find((slot) => {
    const startHour = parseInt(slot.startTime.split(":")[0], 10);
    const endHour = parseInt(slot.endTime.split(":")[0], 10);
    if (endHour === 0 || endHour === 24) {
      return hour >= startHour && hour < 24;
    }
    return hour >= startHour && hour < endHour;
  });
}

/**
 * Evaluates budget rules in shadow dry-run mode without calling Amazon APIs.
 */
async function dryRunBudgetRules({ profile, scheduledFor, jobId }) {
  const now = moment(scheduledFor).tz(profile.timezone || "UTC");
  const currentDate = now.format("YYYY-MM-DD");
  const currentDay = now.format("dddd");

  const rules = await budgetRulesSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    $or: [{ times: { $ne: [] } }, { isHourlyBudget: true }, { isHourlyBid: true }],
    isActive: true,
  }).lean();

  const matchingRules = [];
  for (const rule of rules) {
    if (rule.ruleType === "T" && !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")) {
      continue;
    }

    if (rule.isHourlyBudget || rule.isHourlyBid) {
      const dayOfWeek = now.day();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const frequency = rule.hourlyConfig?.frequency || "DAILY";
      if (frequency === "WEEKDAY" && isWeekend) continue;
      if (frequency === "WEEKEND" && !isWeekend) continue;
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;

      const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], now.hour());
      if (activeSlot && activeSlot.enabled) {
        let desiredValue = 0;
        if (rule.actionType?.actionValueType === "Number") {
          desiredValue = Number(activeSlot.value !== undefined ? activeSlot.value : (activeSlot.budgetPercentage || activeSlot.bidPercentage || 0));
        } else {
          desiredValue = Number(activeSlot.budgetPercentage !== undefined ? activeSlot.budgetPercentage : (activeSlot.bidPercentage || activeSlot.value || 0));
        }
        matchingRules.push({ rule, scheduledTime: activeSlot.startTime, desiredValue });
      }
    } else {
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) {
        continue;
      }
      for (const time of (rule.times || [])) {
        matchingRules.push({
          rule,
          scheduledTime: time,
          desiredValue: rule.actionType?.actionValue || 0,
        });
      }
    }
  }

  const claims = [];
  const scheduledSlot = `shadow-${formatTimeBlock(scheduledFor, "minute")}`;
  for (const m of matchingRules) {
    try {
      const claim = await claimAction({
        configId: profile.configId,
        profileId: profile.profileId,
        ruleFamily: "budget-rules",
        ruleId: m.rule._id,
        scheduledSlot,
        amazonEntityType: "campaign",
        amazonEntityId: "shadow-candidate",
        actionType: m.rule.actionType?.actionName || "BUDGET_UPDATE",
        previousValue: null,
        desiredValue: m.desiredValue,
        jobId,
        owner: "shadow-worker",
        isDryRun: true,
      });
      claims.push({ ruleId: m.rule._id, claimReason: claim.reason, desiredValue: claim.frozenDesiredValue });
    } catch (err) {
      claims.push({ ruleId: m.rule._id, error: err.message });
    }
  }

  return {
    dryRun: true,
    rulesEvaluated: rules.length,
    matchingRulesCount: matchingRules.length,
    claims,
  };
}

/**
 * Evaluates targeting rules in shadow dry-run mode without calling Amazon APIs.
 */
async function dryRunTargetingRules({ profile, scheduledFor, jobId }) {
  const now = moment(scheduledFor).tz(profile.timezone || "UTC");
  const currentDate = now.format("YYYY-MM-DD");
  const currentDay = now.format("dddd");

  const rules = await targetingRuleSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    $or: [{ times: { $exists: true, $ne: [] } }, { isHourlyBid: true }],
    isActive: true,
  }).lean();

  const matchingRules = [];
  for (const rule of rules) {
    if (rule.ruleType === "T" && !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")) {
      continue;
    }
    if (rule.isHourlyBid) {
      const frequency = rule.hourlyConfig?.frequency || "DAILY";
      const isWeekend = ["Saturday", "Sunday"].includes(currentDay);
      if (frequency === "WEEKDAY" && isWeekend) continue;
      if (frequency === "WEEKEND" && !isWeekend) continue;
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;

      const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], now.hour());
      if (activeSlot && activeSlot.enabled) {
        matchingRules.push({
          rule,
          scheduledTime: activeSlot.startTime,
          desiredValue: activeSlot.bidPercentage || activeSlot.value || 0,
        });
      }
    } else {
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;
      for (const time of (rule.times || [])) {
        matchingRules.push({
          rule,
          scheduledTime: time,
          desiredValue: rule.actionType?.actionValue || 0,
        });
      }
    }
  }

  const scheduledSlot = `shadow-${formatTimeBlock(scheduledFor, "minute")}`;
  const claims = [];
  for (const m of matchingRules) {
    try {
      const claim = await claimAction({
        configId: profile.configId,
        profileId: profile.profileId,
        ruleFamily: "targeting-rules",
        ruleId: m.rule._id,
        scheduledSlot,
        amazonEntityType: "target",
        amazonEntityId: "shadow-candidate",
        actionType: m.rule.actionType?.actionName || "BID_UPDATE",
        previousValue: null,
        desiredValue: m.desiredValue,
        jobId,
        owner: "shadow-worker",
        isDryRun: true,
      });
      claims.push({ ruleId: m.rule._id, claimReason: claim.reason, desiredValue: claim.frozenDesiredValue });
    } catch (err) {
      claims.push({ ruleId: m.rule._id, error: err.message });
    }
  }

  return {
    dryRun: true,
    rulesEvaluated: rules.length,
    matchingRulesCount: matchingRules.length,
    claims,
  };
}

/**
 * Evaluates placement rules in shadow dry-run mode without calling Amazon APIs.
 */
async function dryRunPlacementRules({ profile, scheduledFor, jobId }) {
  const now = moment(scheduledFor).tz(profile.timezone || "UTC");
  const currentDate = now.format("YYYY-MM-DD");
  const currentDay = now.format("dddd");

  const rules = await placementRulesSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    $or: [{ times: { $exists: true, $ne: [] } }, { isHourlyBid: true }],
    isActive: true,
  }).lean();

  const matchingRules = [];
  for (const rule of rules) {
    if (rule.ruleType === "T" && !moment(currentDate).isBetween(rule.startDate, rule.endDate, "day", "[]")) {
      continue;
    }
    if (rule.isHourlyBid) {
      const frequency = rule.hourlyConfig?.frequency || "DAILY";
      const isWeekend = ["Saturday", "Sunday"].includes(currentDay);
      if (frequency === "WEEKDAY" && isWeekend) continue;
      if (frequency === "WEEKEND" && !isWeekend) continue;
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;

      const activeSlot = getActiveSlot(rule.hourlyConfig?.slots || [], now.hour());
      if (activeSlot && activeSlot.enabled) {
        matchingRules.push({
          rule,
          scheduledTime: activeSlot.startTime,
          desiredValue: activeSlot.bidPercentage || activeSlot.value || 0,
        });
      }
    } else {
      if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;
      for (const time of (rule.times || [])) {
        matchingRules.push({
          rule,
          scheduledTime: time,
          desiredValue: rule.actionType?.actionValue || 0,
        });
      }
    }
  }

  const scheduledSlot = `shadow-${formatTimeBlock(scheduledFor, "minute")}`;
  const claims = [];
  for (const m of matchingRules) {
    try {
      const claim = await claimAction({
        configId: profile.configId,
        profileId: profile.profileId,
        ruleFamily: "placement-rules",
        ruleId: m.rule._id,
        scheduledSlot,
        amazonEntityType: "placement",
        amazonEntityId: "shadow-candidate",
        actionType: m.rule.actionType?.actionName || "BID_UPDATE",
        previousValue: null,
        desiredValue: m.desiredValue,
        jobId,
        owner: "shadow-worker",
        isDryRun: true,
      });
      claims.push({ ruleId: m.rule._id, claimReason: claim.reason, desiredValue: claim.frozenDesiredValue });
    } catch (err) {
      claims.push({ ruleId: m.rule._id, error: err.message });
    }
  }

  return {
    dryRun: true,
    rulesEvaluated: rules.length,
    matchingRulesCount: matchingRules.length,
    claims,
  };
}

/**
 * Evaluates dayparting rules in shadow dry-run mode without calling Amazon APIs.
 */
async function dryRunDaypartingRules({ profile, scheduledFor, jobId }) {
  const now = moment(scheduledFor).tz(profile.timezone || "UTC");
  const currentHour = now.hour();

  const rules = await daypartingRuleSchema.find({
    configId: profile.configId,
    profileId: profile.profileId,
    status: "ACTIVE",
  }).lean();

  const matchingRules = [];
  for (const rule of rules) {
    let activeSlot = getActiveSlot(rule.slots || [], currentHour);
    if (activeSlot) {
      const isMultiplierDefault = rule.bidChangeType === "MULTIPLIER" && activeSlot.multiplier === 1;
      const isPercentageDefault = rule.bidChangeType === "PERCENTAGE" && activeSlot.multiplier === 0;
      if (!isMultiplierDefault && !isPercentageDefault) {
        matchingRules.push({
          rule,
          desiredValue: activeSlot.multiplier,
        });
      }
    }
  }

  const scheduledSlot = `shadow-${formatTimeBlock(scheduledFor, "minute")}`;
  const claims = [];
  for (const m of matchingRules) {
    try {
      const claim = await claimAction({
        configId: profile.configId,
        profileId: profile.profileId,
        ruleFamily: "dayparting-rules",
        ruleId: m.rule._id,
        scheduledSlot,
        amazonEntityType: m.rule.type || "BUDGETS",
        amazonEntityId: "shadow-candidate",
        actionType: "DAYPARTING_UPDATE",
        previousValue: null,
        desiredValue: m.desiredValue,
        jobId,
        owner: "shadow-worker",
        isDryRun: true,
      });
      claims.push({ ruleId: m.rule._id, claimReason: claim.reason, desiredValue: claim.frozenDesiredValue });
    } catch (err) {
      claims.push({ ruleId: m.rule._id, error: err.message });
    }
  }

  return {
    dryRun: true,
    rulesEvaluated: rules.length,
    matchingRulesCount: matchingRules.length,
    claims,
  };
}

/**
 * Executes Budget Rules for exactly one eligible profile.
 */
async function processBudgetRulesForProfile({ configId, profileId, scheduledFor, jobId }) {
  const profile = await getEligibleProfile({ configId, profileId, syncType: "ads" });

  if (isShadowModeEnabled()) {
    const dryRunResult = await dryRunBudgetRules({ profile, scheduledFor, jobId });
    return {
      family: "budget-rules",
      configId,
      profileId,
      jobId,
      scheduledFor,
      ...dryRunResult,
    };
  }

  const result = await executeBudgetRulesForProfile(profile, scheduledFor);
  return {
    family: "budget-rules",
    configId,
    profileId,
    jobId,
    scheduledFor,
    ...result,
  };
}

/**
 * Executes Targeting Rules for exactly one eligible profile.
 */
async function processTargetingRulesForProfile({ configId, profileId, scheduledFor, jobId }) {
  const profile = await getEligibleProfile({ configId, profileId, syncType: "ads" });

  if (isShadowModeEnabled()) {
    const dryRunResult = await dryRunTargetingRules({ profile, scheduledFor, jobId });
    return {
      family: "targeting-rules",
      configId,
      profileId,
      jobId,
      scheduledFor,
      ...dryRunResult,
    };
  }

  const result = await executeTargetingRulesForProfile(profile, scheduledFor);
  return {
    family: "targeting-rules",
    configId,
    profileId,
    jobId,
    scheduledFor,
    ...result,
  };
}

/**
 * Executes Placement Rules for exactly one eligible profile.
 */
async function processPlacementRulesForProfile({ configId, profileId, scheduledFor, jobId }) {
  const profile = await getEligibleProfile({ configId, profileId, syncType: "ads" });

  if (isShadowModeEnabled()) {
    const dryRunResult = await dryRunPlacementRules({ profile, scheduledFor, jobId });
    return {
      family: "placement-rules",
      configId,
      profileId,
      jobId,
      scheduledFor,
      ...dryRunResult,
    };
  }

  const result = await executePlacementRulesForProfile(profile, scheduledFor);
  return {
    family: "placement-rules",
    configId,
    profileId,
    jobId,
    scheduledFor,
    ...result,
  };
}

/**
 * Executes Dayparting Rules for exactly one eligible profile.
 */
async function processDaypartingRulesForProfile({ configId, profileId, scheduledFor, jobId }) {
  const profile = await getEligibleProfile({ configId, profileId, syncType: "ads" });

  if (isShadowModeEnabled()) {
    const dryRunResult = await dryRunDaypartingRules({ profile, scheduledFor, jobId });
    return {
      family: "dayparting-rules",
      configId,
      profileId,
      jobId,
      scheduledFor,
      ...dryRunResult,
    };
  }

  const result = await executeDaypartingRulesForProfile(profile, scheduledFor);
  return {
    family: "dayparting-rules",
    configId,
    profileId,
    jobId,
    scheduledFor,
    ...result,
  };
}

module.exports = {
  processBudgetRulesForProfile,
  processTargetingRulesForProfile,
  processPlacementRulesForProfile,
  processDaypartingRulesForProfile,
  dryRunBudgetRules,
  dryRunTargetingRules,
  dryRunPlacementRules,
  dryRunDaypartingRules,
};
