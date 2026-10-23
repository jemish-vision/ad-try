
const placementRulesSchema = require("../models/placementRules.model");
const targetingRuleSchema = require("../models/targetingRuleSchema.model");
const budgetRulesSchema = require("../models/budgetRules.model");
const seachTermRuleSchema = require("../models/searchTermRules.model");

const normalizeConditions = (conditions = []) => {
    return conditions
        .map(c => ({
            conditionType: String(c.conditionType),
            conditionStatus: String(c?.conditionStatus),
            conditionStringValue: String(c?.conditionStringValue),
            conditionOperator: String(c.conditionOperator),
            conditionValue: Number(c.conditionValue),
            conditionValueType: String(c.conditionValueType),
        }))
        .sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b))
        );
};

const normalizeSlots = (slots = []) => {
    return slots
        .map(s => ({
            startTime: String(s.startTime),
            endTime: String(s?.endTime),
            multiplier: Number(s?.multiplier),
            enabled: Boolean(s?.enabled),
        }))
        .sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b))
        );
};

const isDuplicatePlacementRule = async (configId, userId, profileId, conditions, excludeRuleId = null) => {
    const existingRules = await placementRulesSchema.find({ configId, userId, profileId }, { conditions: 1 }).lean();
    return Boolean(checkDuplicatePlacementRule(existingRules, conditions, excludeRuleId));
};

const checkDuplicatePlacementRule = (existingRules, conditions, excludeRuleId = null) => {
    const incomingNormalized = normalizeConditions(conditions);

    for (const rule of existingRules) {
        if (excludeRuleId && String(rule?._id) === String(excludeRuleId)) {
            continue;
        }

        if (!rule.conditions || rule.conditions.length !== conditions.length) {
            continue;
        }

        const ruleNormalized = normalizeConditions(rule.conditions);

        let isSame = true;

        for (let i = 0; i < ruleNormalized.length; i++) {
            if (
                ruleNormalized[i].conditionType !== incomingNormalized[i].conditionType ||
                ruleNormalized[i].conditionOperator !== incomingNormalized[i].conditionOperator
            ) {
                isSame = false;
                break;
            }
        }

        if (isSame) {
            return rule;
        }
    }

    return false;
};

const isDuplicateTargetingRule = async (configId, userId, profileId, conditions, excludeRuleId = null) => {
    const existingRules = await targetingRuleSchema.find({ configId, userId, profileId }, { conditions: 1 }).lean();
    return Boolean(checkDuplicateTargetingRule(existingRules, conditions, excludeRuleId));
};

const checkDuplicateTargetingRule = (existingRules, conditions, excludeRuleId = null) => {
    const incomingNormalized = normalizeConditions(conditions);

    for (const rule of existingRules) {
        if (excludeRuleId && String(rule?._id) === String(excludeRuleId)) {
            continue;
        }

        if (!rule.conditions || rule.conditions.length !== conditions.length) {
            continue;
        }

        const ruleNormalized = normalizeConditions(rule.conditions);

        let isSame = true;

        for (let i = 0; i < ruleNormalized.length; i++) {
            if (
                ruleNormalized[i].conditionType !== incomingNormalized[i].conditionType ||
                ruleNormalized[i].conditionStatus !== incomingNormalized[i].conditionStatus ||
                ruleNormalized[i].conditionOperator !== incomingNormalized[i].conditionOperator
            ) {
                isSame = false;
                break;
            }
        }

        if (isSame) {
            return rule;
        }
    }

    return false;
};

const isDuplicateBudgetRule = async (configId, userId, profileId, conditions, excludeRuleId = null) => {
    const existingRules = await budgetRulesSchema.find({ configId, userId, profileId }, { conditions: 1 }).lean();
    return Boolean(checkDuplicateTargetingRule(existingRules, conditions, excludeRuleId));
};

const checkDuplicateBudgetRule = (existingRules, conditions, excludeRuleId = null) => {
    const incomingNormalized = normalizeConditions(conditions);

    for (const rule of existingRules) {
        if (excludeRuleId && String(rule?._id) === String(excludeRuleId)) {
            continue;
        }

        if (!rule.conditions || rule.conditions.length !== conditions.length) {
            continue;
        }

        const ruleNormalized = normalizeConditions(rule.conditions);

        let isSame = true;

        for (let i = 0; i < ruleNormalized.length; i++) {
            if (
                ruleNormalized[i].conditionType !== incomingNormalized[i].conditionType ||
                ruleNormalized[i].conditionOperator !== incomingNormalized[i].conditionOperator ||
                ruleNormalized[i].conditionStringValue !== incomingNormalized[i].conditionStringValue
            ) {
                isSame = false;
                break;
            }
        }

        if (isSame) {
            return rule;
        }
    }

    return false;
};

const isDuplicateSearchTermRule = async (configId, userId, profileId, conditions, excludeRuleId = null) => {
    const existingRules = await seachTermRuleSchema.find({ configId, userId, profileId }, { conditions: 1 }).lean();
    return Boolean(checkDuplicateSearchTermRule(existingRules, conditions, excludeRuleId));
};

const checkDuplicateSearchTermRule = (existingRules, conditions, excludeRuleId = null) => {
    const incomingNormalized = normalizeConditions(conditions);

    for (const rule of existingRules) {
        if (excludeRuleId && String(rule?._id) === String(excludeRuleId)) {
            continue;
        }

        if (!rule.conditions || rule.conditions.length !== conditions.length) {
            continue;
        }

        const ruleNormalized = normalizeConditions(rule.conditions);

        let isSame = true;

        for (let i = 0; i < ruleNormalized.length; i++) {
            if (
                ruleNormalized[i].operator !== incomingNormalized[i].operator ||
                ruleNormalized[i].conditionType !== incomingNormalized[i].conditionType ||
                ruleNormalized[i].conditionOperator !== incomingNormalized[i].conditionOperator
            ) {
                isSame = false;
                break;
            }
        }

        if (isSame) {
            return rule;
        }
    }

    return false;
};

const checkDuplicateDaypartingRule = (existingRules, slots, type) => {
    const incomingNormalized = normalizeSlots(slots);

    for (const rule of existingRules) {
        if ((!rule.slots || rule.slots.length !== slots?.length) || (!rule.type || rule?.type !== type)) {
            continue;
        }

        const ruleNormalized = normalizeSlots(rule.slots);

        let isSame = true;

        for (let i = 0; i < ruleNormalized.length; i++) {
            if (
                ruleNormalized[i].startTime !== incomingNormalized[i].startTime ||
                ruleNormalized[i].endTime !== incomingNormalized[i].endTime ||
                ruleNormalized[i].multiplier !== incomingNormalized[i].multiplier
            ) {
                isSame = false;
                break;
            }
        }

        if (isSame) {
            return rule;
        }
    }

    return false;
};

const checkDuplicateRecommandationRule = (existingRules, conditions, gridName) => {
    const incomingNormalized = normalizeConditions(conditions);

    for (const rule of existingRules) {
        if ((!rule.conditions || rule.conditions.length !== conditions.length) || (!rule.gridName || rule?.gridName !== gridName)) {
            continue;
        }

        const ruleNormalized = normalizeConditions(rule.conditions);

        let isSame = true;

        for (let i = 0; i < ruleNormalized.length; i++) {
            if (
                ruleNormalized[i].conditionType !== incomingNormalized[i].conditionType ||
                ruleNormalized[i].conditionOperator !== incomingNormalized[i].conditionOperator
            ) {
                isSame = false;
                break;
            }
        }

        if (isSame) {
            return rule;
        }
    }

    return false;
};

module.exports = {
    checkDuplicatePlacementRule,
    isDuplicatePlacementRule,
    checkDuplicateTargetingRule,
    isDuplicateTargetingRule,
    checkDuplicateBudgetRule,
    isDuplicateBudgetRule,
    isDuplicateSearchTermRule,
    checkDuplicateSearchTermRule,
    checkDuplicateDaypartingRule,
    checkDuplicateRecommandationRule,
};