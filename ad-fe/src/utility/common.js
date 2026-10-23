
import { t } from "i18next";
import moment from "moment-timezone";

export const formatRunTime = (val) => {
    if (!val) return "-";
    if (typeof val !== "string") return String(val);
    const trimmed = val.trim();
    if (!trimmed) return "-";
    if (/[ap]m/i.test(trimmed)) return trimmed;

    const parsed = moment(trimmed, [
        "HH:mm:ss",
        "HH:mm",
        "H:m:s",
        "H:m",
        "YYYY-MM-DD HH:mm:ss",
        "YYYY-MM-DD HH:mm",
        moment.ISO_8601,
    ]);

    if (parsed.isValid()) {
        const hasSeconds = trimmed.split(":").length >= 3;
        return parsed.format(hasSeconds ? "hh:mm:ss A" : "hh:mm A");
    }
    return trimmed;
};

export const formatRuleDate = (val, format = "DD/MM/YYYY") => {
    if (!val) return "-";
    return moment(val).isValid() ? moment(val).format(format) : val;
};

export const TYPE_MAP = {
    "Sponsored Products": "SP",
    "Sponsored Brands": "SB",
    "Sponsored Display": "SD",
};

export const groupCampaignIdsByType = (allIds, searchData) => {
    const grouped = { SP: [], SB: [], SD: [] };
    const idToTypeMap = new Map(searchData.map(item => [String(item?.campaignId), TYPE_MAP[item.type] || null]));

    allIds.forEach(id => {
        const code = idToTypeMap.get(String(id));
        if (code && grouped[code]) grouped[code].push(Number(id));
    });

    return grouped;
};

const conditionMap = {
    $eq: "=",
    $ne: "≠",
    $gt: ">",
    $gte: "≥",
    $lt: "<",
    $lte: "≤"
};

export const formatCondition = (conditionObj) => {
    const {
        firstCondition,
        firstValue,
        operator,
        secondCondition,
        secondValue
    } = conditionObj;

    let text = "";

    if (firstCondition && firstValue !== undefined) {
        text += `${conditionMap[firstCondition] || firstCondition} ${firstValue}`;
    }

    if (operator && secondCondition && secondValue !== undefined) {
        const translatedOp = t(operator) || operator;
        text += ` ${translatedOp} ${conditionMap[secondCondition] || secondCondition} ${secondValue}`;
    }

    return text;
};

export const buildMongoQuery = (fieldName, conditionObj) => {
    const { firstCondition, firstValue, operator, secondCondition, secondValue } = conditionObj;

    // Single condition
    if (!operator || !secondCondition) {
        return { [fieldName]: { [firstCondition]: Number(firstValue) } };
    }

    // Multiple conditions (AND / OR)
    const firstQuery = { [fieldName]: { [firstCondition]: Number(firstValue) } };
    const secondQuery = { [fieldName]: { [secondCondition]: Number(secondValue) } };

    if (operator === "AND") {
        return { $and: [firstQuery, secondQuery] };
    }

    if (operator === "OR") {
        return { $or: [firstQuery, secondQuery] };
    }

    return firstQuery;
};