const { safeJsonParse } = require("../helper/common");
const addHealthScoreSettingQuery = (healthScoreConditions, filters, cpSetting) => {
    let conditions = [];

    healthScoreConditions.forEach((cond, index) => {
        let { conditionType, conditionOperator, conditionValue, conditionMaxValue, useTargetAcos, queryOperator } = cond;

        let fieldCondition = null;

        // -------- Handle Custom / Saved Filters --------
        const checkCustomFilter = filters?.find(lb => lb?.value === conditionType && !lb?.isDefault);
        if (checkCustomFilter) {
            try {
                fieldCondition = safeJsonParse(checkCustomFilter?.query);
            } catch (error) {
                console.log("Custom filter parse error:", error);
            }
        }

        // Handle Status conditions
        if (["Status"].includes(conditionType)) {
            fieldCondition = { status: { $eq: conditionStringValue } };
        }

        if (["Type"].includes(conditionType)) {
            fieldCondition = { type: { $eq: conditionStringValue } };
        }

        // Handle Targeting types
        if (["Targeting Type"].includes(conditionType)) {
            fieldCondition = { targetingType: { $eq: conditionStringValue } };
        }

        // -------- Handle Default Metric Filters --------
        else if (["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend", "CPC", "CTR", "Budget", "TimeInBudget", "ConversionRate"].includes(conditionType)) {
            const type = conditionType === "TimeInBudget" ? "timeInBudget" : conditionType === "ConversionRate" ? "conversionRate" : `${conditionType}`.toLowerCase();

            if (conditionType == "ACOS" && useTargetAcos) {
                conditionValue = cpSetting.targetAcos;
            }
            if (conditionOperator === "BETWEEN") {
                fieldCondition = { [type]: { $gte: Number(conditionValue), $lte: Number(conditionMaxValue) } };
            } else {
                const operatorMap = {
                    LESS_THAN: { $lt: Number(conditionValue) },
                    LESS_THAN_OR_EQUAL_TO: { $lte: Number(conditionValue) },
                    GREATER_THAN_OR_EQUAL_TO: { $gte: Number(conditionValue) },
                    GREATER_THAN: { $gt: Number(conditionValue) },
                    EQUAL_TO: { $eq: Number(conditionValue) },
                    NOT_EQUAL_TO: { $ne: Number(conditionValue) },
                };
                fieldCondition = { [type]: operatorMap[conditionOperator] ?? { $eq: Number(conditionValue) } };
            }
        }

        if (!fieldCondition) return;
        conditions.push({ condition: fieldCondition, operator: queryOperator ?? "AND" });
    });

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0].condition;

    // -------- Group by operator of the NEXT item --------
    let groups = [{ operator: conditions[1].operator, conditions: [conditions[0].condition] }];

    for (let i = 1; i < conditions.length; i++) {
        const currentOperator = conditions[i].operator;
        const lastGroup = groups[groups.length - 1];

        if (currentOperator === lastGroup.operator) {
            lastGroup.conditions.push(conditions[i].condition);
        } else {
            groups.push({ operator: currentOperator, conditions: [conditions[i].condition] });
        }
    }

    // -------- Build Final Mongo Query --------
    const builtGroups = groups.map(group => {
        if (group.conditions.length === 1) return group.conditions[0];
        return { [`$${group.operator.toLowerCase()}`]: group.conditions };
    });

    let mongoQuery = {};

    if (builtGroups.length === 1) {
        mongoQuery = builtGroups[0];
    } else {
        mongoQuery["$and"] = builtGroups;
    }

    return mongoQuery;
};

const addCampaignSettingPipelineQuery = (healthScoreConditions, cpSetting) => {
  let conditions = [];

  healthScoreConditions.forEach(cond => {
    let {
      conditionType,
      conditionOperator,
      conditionValue,
      conditionMaxValue,
      useTargetAcos,
      queryOperator
    } = cond;

    let fieldCondition = null;

    const metricMap = {
      Impressions: "impressions",
      Clicks: "clicks",
      Orders: "orders",
      Sales: "sales",
      ROAS: "roas",
      ACOS: "acos",
      Spend: "spend",
      CPC: "cpc",
      CTR: "ctr",
      Budget: "budget",
      TimeInBudget: "timeInBudget",
      ConversionRate: "conversionRate"
    };

    if (metricMap[conditionType]) {
      const field = `$${metricMap[conditionType]}`;

      if (conditionType === "ACOS" && useTargetAcos) {
        conditionValue = cpSetting.targetAcos;
      }

      if (conditionOperator === "BETWEEN") {
        fieldCondition = {
          $and: [
            { $gte: [field, Number(conditionValue)] },
            { $lte: [field, Number(conditionMaxValue)] }
          ]
        };
      } else {
        const operatorMap = {
          LESS_THAN: "$lt",
          LESS_THAN_OR_EQUAL_TO: "$lte",
          GREATER_THAN_OR_EQUAL_TO: "$gte",
          GREATER_THAN: "$gt",
          EQUAL_TO: "$eq",
          NOT_EQUAL_TO: "$ne"
        };

        const mongoOp = operatorMap[conditionOperator] || "$eq";

        fieldCondition = {
          [mongoOp]: [field, Number(conditionValue)]
        };
      }
    }

    if (!fieldCondition) return;

    conditions.push({
      condition: fieldCondition,
      operator: queryOperator ?? "AND"
    });
  });

  if (!conditions.length) return null;

  let expressions = [conditions[0].condition];

  for (let i = 1; i < conditions.length; i++) {
    const operator = conditions[i].operator.toLowerCase();
    const last = expressions.pop();

    expressions.push({
      [`$${operator}`]: [last, conditions[i].condition]
    });
  }

  return expressions[0];
};

module.exports = {
    addHealthScoreSettingQuery,
    addCampaignSettingPipelineQuery
}