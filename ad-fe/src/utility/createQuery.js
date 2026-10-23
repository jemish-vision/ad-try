const combineRuleQueryClauses = (clauses) => clauses.length > 1
    ? { $and: clauses }
    : clauses[0] || {};

export const addRuleQuery = (sendData, labels, cType) => {
    const queryClauses = [];
    const addClause = (query) => {
        if (query && Object.keys(query).length > 0) queryClauses.push(query);
    };

    sendData.conditions.forEach((cond) => {
        const { conditionType, conditionOperator, conditionValue, conditionStatus, targetingTypes, campaignIds, adGroupIds } = cond;
        const isCFilterExist = labels?.find(lb => lb?.value === conditionType && lb?.[`is${cType}Filter`])

        const checkCustomFilter = labels?.find(lb => lb?.value === conditionType && !lb?.isDefault)
        if (checkCustomFilter) {
            try {
                const query = JSON.parse(checkCustomFilter?.query)
                addClause(query)
            } catch (error) {
                console.log(error);
            }
            return;
        }

        // Handle Status conditions
        if (["TargetActiveStatus"].includes(conditionType) && isCFilterExist) {
            if (conditionStatus === "NOT_ARCHIVED") {
                addClause({ status: { $ne: "ARCHIVED" } });
            } else {
                addClause({ status: { $eq: conditionStatus } });
            }
        }

        if (["CampaignActiveStatus"].includes(conditionType) && isCFilterExist) {
            if (conditionStatus === "NOT_ARCHIVED") {
                addClause({ campaignStatus: { $ne: "ARCHIVED" } });
            } else {
                addClause({ campaignStatus: { $eq: conditionStatus } });
            }
        }

        // Handle Targeting types
        if (conditionType === "TargetingType" && targetingTypes?.length && isCFilterExist) {
            addClause({ keywordType: { $in: targetingTypes } });
        }

        // Handle Campaigns and AdGroups
        if (conditionType === "CampaignsAndAdGroups" && (campaignIds?.length || adGroupIds?.length) && isCFilterExist) {
            const campaignQuery = {};
            if (campaignIds?.length > 0) {
                campaignQuery.campaignId = { $in: campaignIds || [] };
            }
            if (adGroupIds?.length > 0) {
                campaignQuery.adGroupId = { $in: adGroupIds || [] };
            }
            addClause(campaignQuery);
        }

        if (["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend", "Bid", "Top of Search IS"].includes(conditionType) && isCFilterExist) {
            let operator = {};
            const type = conditionType === "Bid" ? "keywordBid" : conditionType === "Top of Search IS" ? "topOfSearchImpressionShare" : `${conditionType}`.toLowerCase()

            switch (conditionOperator) {
                case "LESS_THAN":
                    operator = { $lt: Number(conditionValue) };
                    break;
                case "LESS_THAN_OR_EQUAL_TO":
                    operator = { $lte: Number(conditionValue) };
                    break;
                case "GREATER_THAN_OR_EQUAL_TO":
                    operator = { $gte: Number(conditionValue) };
                    break;
                case "GREATER_THAN":
                    operator = { $gt: Number(conditionValue) };
                    break;
                case "EQUAL_TO":
                    operator = { $eq: Number(conditionValue) };
                    break;
                case "NOT_EQUAL_TO":
                    operator = { $ne: Number(conditionValue) };
                    break;
                default:
                    operator = { $eq: Number(conditionValue) };
            }

            addClause({ [type]: operator });
        }
    });

    const mongoQuery = combineRuleQueryClauses(queryClauses);

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addTargetingQuery = (sendData) => {
    let mongoQuery = {};

    let { appliedFilters, targetingStatus, campaignStatus, targetingType: targetingTypes, campaignId: campaignIds, adGroupId: adGroupIds, targetingTabFilter } = sendData;

    const customFilter = appliedFilters?.filter(filter => filter?.isCustom)
    appliedFilters = appliedFilters?.filter(filter => !filter?.isCustom)

    // Handle Status conditions
    if (targetingStatus) {
        if (targetingStatus === "NOT_ARCHIVED") {
            mongoQuery["status"] = { $ne: "ARCHIVED" };
        } else {
            mongoQuery["status"] = { $eq: targetingStatus };
        }
    }

    if (campaignStatus) {
        if (campaignStatus === "NOT_ARCHIVED") {
            mongoQuery["campaignStatus"] = { $ne: "ARCHIVED" };
        } else {
            mongoQuery["campaignStatus"] = { $eq: campaignStatus };
        }
    }

    if (targetingTabFilter && Object?.keys(targetingTabFilter)) {
        Object.assign(mongoQuery, targetingTabFilter)
    }

    // Handle Targeting types
    if (targetingTypes?.length) {
        mongoQuery["keywordType"] = { $in: targetingTypes };
    }

    // Handle Campaigns and AdGroups
    if (campaignIds?.length || adGroupIds?.length) {
        if (campaignIds.length > 0) {
            mongoQuery["campaignId"] = { $in: campaignIds || [] };
        }
        if (adGroupIds.length > 0) {
            mongoQuery["adGroupId"] = { $in: adGroupIds || [] };
        }
    }

    if (appliedFilters?.length) {
        appliedFilters.forEach(filter => {
            const { apiFieldName, condition, value, type } = filter
            const apiFieldFilter = type === "Bid" ? "keywordBid" : type === "Top of Search IS" ? "topOfSearchImpressionShare" : `${apiFieldName}`.toLowerCase()
            const checkFilter = ["impressions", "clicks", "orders", "sales", "roas", "acos", "spend", "keywordBid", "topOfSearchImpressionShare"].includes(apiFieldFilter)

            if (apiFieldName && condition && checkFilter) {
                mongoQuery[apiFieldFilter] = { [condition]: parseFloat(value) ?? value ?? 0 };
            }
        });
    }

    if (customFilter?.length) {
        customFilter.forEach(filter => {
            mongoQuery = { ...mongoQuery, ...filter?.query }
        });
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addCampaignQuery = (sendData) => {
    let mongoQuery = {};

    let { appliedFilters, campaignStatus, type } = sendData;

    const customFilter = appliedFilters?.filter(filter => filter?.isCustom)
    appliedFilters = appliedFilters?.filter(filter => !filter?.isCustom)

    const isOutOfBudget = appliedFilters?.some(filter => filter?.type === "OutOfBudget" || filter?.value === "OUT_OF_BUDGET") || campaignStatus === "OUT_OF_BUDGET";

    if (isOutOfBudget) {
        mongoQuery["$or"] = [
            { status: "OUT_OF_BUDGET" },
            { status: "out_of_budget" },
            { $and: [{ budget: { $gt: 0 } }, { $expr: { $gte: ["$spend", "$budget"] } }] }
        ];
    } else if (campaignStatus) {
        if (campaignStatus === "NOT_ARCHIVED") {
            mongoQuery["status"] = { $ne: "ARCHIVED" };
        } else {
            mongoQuery["status"] = { $eq: campaignStatus };
        }
    }

    if (type) {
        mongoQuery["type"] = { $eq: type };
    }

    if (appliedFilters?.length) {
        appliedFilters.forEach(filter => {
            if (filter?.type === "OutOfBudget" || filter?.value === "OUT_OF_BUDGET" || filter?.type === "Status") return;
            const { apiFieldName, condition, value, type } = filter
            const apiFieldFilter = ["Time in Budget", "TimeInBudget"].includes(type) ? "timeInBudget" : `${apiFieldName}`.toLowerCase()
            if (apiFieldName && condition) {
                mongoQuery[apiFieldFilter] = { [condition]: parseFloat(value) ?? value ?? 0 };
            }
        });
    }

    if (customFilter?.length) {
        customFilter.forEach(filter => {
            mongoQuery = { ...mongoQuery, ...filter?.query }
        });
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addPlacementRuleQuery = (sendData, labels, cType) => {
    const queryClauses = [];
    const addClause = (query) => {
        if (query && Object.keys(query).length > 0) queryClauses.push(query);
    };
    sendData.conditions.forEach((cond) => {
        const { conditionType, conditionOperator, conditionValue } = cond;
        const isCFilterExist = labels?.find(lb => lb?.value === conditionType && lb?.[`is${cType}Filter`])

        const checkCustomFilter = labels?.find(lb => lb?.value === conditionType && !lb?.isDefault)
        if (checkCustomFilter) {
            try {
                const query = JSON.parse(checkCustomFilter?.query)
                addClause(query)
            } catch (error) {
                console.log(error);
            }
            return;
        }

        if (["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend"].includes(conditionType) && isCFilterExist) {
            let operator = {};
            const type = conditionType.toLowerCase()

            switch (conditionOperator) {
                case "LESS_THAN":
                    operator = { $lt: Number(conditionValue) };
                    break;
                case "LESS_THAN_OR_EQUAL_TO":
                    operator = { $lte: Number(conditionValue) };
                    break;
                case "GREATER_THAN_OR_EQUAL_TO":
                    operator = { $gte: Number(conditionValue) };
                    break;
                case "GREATER_THAN":
                    operator = { $gt: Number(conditionValue) };
                    break;
                case "EQUAL_TO":
                    operator = { $eq: Number(conditionValue) };
                    break;
                case "NOT_EQUAL_TO":
                    operator = { $ne: Number(conditionValue) };
                    break;
                default:
                    operator = { $eq: Number(conditionValue) };
            }

            addClause({ [type]: operator });
        }
    });

    // Convert the object to a JSON string
    return JSON.stringify(combineRuleQueryClauses(queryClauses));
}

export const UpdateTargetingQuery = (query, campaignIds) => {
    let mongoQuery = {};
    try {
        mongoQuery = query ? JSON.parse(query) : {};
    } catch (e) {
        mongoQuery = {};
    }

    // Handle Campaigns
    if (campaignIds?.length || mongoQuery?.campaignId) {
        mongoQuery["campaignId"] = { $in: campaignIds || [] };
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addSearchTermQuery = (sendData) => {
    let mongoQuery = {};

    let { appliedFilters, campaignId: campaignIds, campaignStatus, adGroupId: adGroupIds } = sendData;

    const customFilter = appliedFilters?.filter(filter => filter?.isCustom)
    appliedFilters = appliedFilters?.filter(filter => !filter?.isCustom)

    if (campaignStatus) {
        if (campaignStatus === "NOT_ARCHIVED") {
            mongoQuery["campaignStatus"] = { $ne: "ARCHIVED" };
        } else {
            mongoQuery["campaignStatus"] = { $eq: campaignStatus };
        }
    }

    // Handle Campaigns and AdGroups
    if (campaignIds?.length || adGroupIds?.length) {
        if (campaignIds.length > 0) {
            mongoQuery["campaignId"] = { $in: campaignIds || [] };
        }
        if (adGroupIds.length > 0) {
            mongoQuery["adGroupId"] = { $in: adGroupIds || [] };
        }
    }

    if (appliedFilters?.length) {
        appliedFilters.forEach(filter => {
            const { apiFieldName, condition, value } = filter
            const apiFieldFilter = `${apiFieldName}`.toLowerCase()
            const checkFilter = ["impressions", "clicks", "orders", "sales", "roas", "acos", "spend"].includes(apiFieldFilter)

            if (apiFieldName && condition && checkFilter) {
                mongoQuery[apiFieldFilter] = { [condition]: parseFloat(value) ?? value ?? 0 };
            }
        });
    }

    if (customFilter?.length) {
        customFilter.forEach(filter => {
            mongoQuery = { ...mongoQuery, ...filter?.query }
        });
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addSearchTermRuleQuery = (sendData, labels, cType) => {
    let conditions = [];

    sendData.conditions.forEach((cond, index) => {
        const { conditionType, conditionOperator, conditionValue, conditionMaxValue, operator } = cond;
        const isCFilterExist = labels?.find(lb => lb?.value === conditionType && lb?.[`is${cType}Filter`])

        let fieldCondition = null;

        // -------- Handle Custom / Saved Filters --------
        const checkCustomFilter = labels?.find(lb => lb?.value === conditionType && !lb?.isDefault);
        if (checkCustomFilter) {
            try {
                fieldCondition = JSON.parse(checkCustomFilter?.query);
            } catch (error) {
                console.log("Custom filter parse error:", error);
            }
        }

        // -------- Handle Default Metric Filters --------
        else if (["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend", "Bid"].includes(conditionType) && isCFilterExist) {
            const type = conditionType === "Bid" ? "keywordBid" : `${conditionType}`.toLowerCase();

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
        conditions.push({ condition: fieldCondition, operator: operator ?? "AND" });
    });

    if (conditions.length === 0) return JSON.stringify({});
    if (conditions.length === 1) return JSON.stringify(conditions[0].condition);

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

    return JSON.stringify(mongoQuery);
};

export const UpdateSearchTermQuery = (query, campaignIds) => {
    let mongoQuery = {};
    try {
        mongoQuery = query ? JSON.parse(query) : {};
    } catch (e) {
        mongoQuery = {};
    }

    // Handle Campaigns
    if (campaignIds?.length || mongoQuery?.campaignId) {
        mongoQuery["campaignId"] = { $in: campaignIds || [] };
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addPlacementQuery = (sendData) => {
    let mongoQuery = {};

    let { appliedFilters, campaignId: campaignIds, adGroupId: adGroupIds, placementTabFilter } = sendData;

    const customFilter = appliedFilters?.filter(filter => filter?.isCustom)
    appliedFilters = appliedFilters?.filter(filter => !filter?.isCustom)

    // Handle Campaigns and AdGroups
    if (campaignIds?.length || adGroupIds?.length) {
        if (campaignIds.length > 0) {
            mongoQuery["campaignId"] = { $in: campaignIds || [] };
        }
        if (adGroupIds.length > 0) {
            mongoQuery["adGroupId"] = { $in: adGroupIds || [] };
        }
    }

    if (placementTabFilter && Object?.keys(placementTabFilter)) {
        Object.assign(mongoQuery, placementTabFilter)
    }

    if (appliedFilters?.length) {
        appliedFilters.forEach(filter => {
            const { apiFieldName, condition, value, type } = filter
            const apiFieldFilter = type === "BidAdjustment" ? "placementModifier" : `${apiFieldName}`.toLowerCase()
            const checkFilter = ["impressions", "clicks", "orders", "sales", "roas", "acos", "spend", "placementModifier"].includes(apiFieldFilter)

            if (apiFieldName && condition && checkFilter) {
                mongoQuery[apiFieldFilter] = { [condition]: parseFloat(value) ?? value ?? 0 };
            }
        });
    }

    if (customFilter?.length) {
        customFilter.forEach(filter => {
            mongoQuery = { ...mongoQuery, ...filter?.query }
        });
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addBudgetRuleQuery = (sendData, labels, cType) => {
    const queryClauses = [];
    const addClause = (query) => {
        if (query && Object.keys(query).length > 0) queryClauses.push(query);
    };

    sendData.conditions.forEach((cond) => {
        const { conditionType, conditionOperator, conditionValue, conditionStringValue } = cond;
        const isCFilterExist = labels?.find(lb => lb?.value === conditionType && lb?.[`is${cType}Filter`])

        // Handle Status conditions
        if (["Status"].includes(conditionType) && isCFilterExist) {
            addClause({ status: { $eq: conditionStringValue } });
        }

        if (["Type"].includes(conditionType) && isCFilterExist) {
            addClause({ type: { $eq: conditionStringValue } });
        }

        // Handle Targeting types
        if (["Targeting Type"].includes(conditionType) && isCFilterExist) {
            addClause({ targetingType: { $eq: conditionStringValue } });
        }

        if (["Impressions", "Clicks", "Orders", "Sales", "ROAS", "ACOS", "Spend", "CPC", "Budget", "TimeInBudget", "BudgetUsage"].includes(conditionType) && isCFilterExist) {
            let operator = {};
            const type = conditionType === "TimeInBudget" ? "timeInBudget" : `${conditionType}`.toLowerCase()

            switch (conditionOperator) {
                case "LESS_THAN":
                    operator = { $lt: Number(conditionValue) };
                    break;
                case "LESS_THAN_OR_EQUAL_TO":
                    operator = { $lte: Number(conditionValue) };
                    break;
                case "GREATER_THAN_OR_EQUAL_TO":
                    operator = { $gte: Number(conditionValue) };
                    break;
                case "GREATER_THAN":
                    operator = { $gt: Number(conditionValue) };
                    break;
                case "EQUAL_TO":
                    operator = { $eq: Number(conditionValue) };
                    break;
                case "NOT_EQUAL_TO":
                    operator = { $ne: Number(conditionValue) };
                    break;
                default:
                    operator = { $eq: Number(conditionValue) };
            }

            if (["BudgetUsage"].includes(conditionType)) {
                addClause({
                    $expr: {
                        [Object.keys(operator)[0]]: [
                            { $multiply: [{ $divide: ["$todaySpend", "$todayBudget"] }, 100] },
                            Number(conditionValue),
                        ],
                    },
                });
            } else {
                addClause({ [type]: operator });
            }
        }
    });

    // Convert the object to a JSON string
    return JSON.stringify(combineRuleQueryClauses(queryClauses));
}

export const UpdateBudgetQuery = (query, campaignIds) => {
    let mongoQuery = {};
    try {
        mongoQuery = query ? JSON.parse(query) : {};
    } catch (e) {
        mongoQuery = {};
    }

    // Handle Campaigns
    if (campaignIds?.length || mongoQuery?.campaignId) {
        mongoQuery["campaignId"] = { $in: campaignIds || [] };
    }

    // Convert the object to a JSON string
    return JSON.stringify(mongoQuery);
}

export const addHealthScoreSettingQuery = (sendData, labels) => {
    let conditions = [];

    sendData.conditions.forEach((cond, index) => {
        const { conditionType, conditionOperator, conditionValue, conditionMaxValue, conditionStringValue, operator } = cond;

        let fieldCondition = null;

        // -------- Handle Custom / Saved Filters --------
        const checkCustomFilter = labels?.find(lb => lb?.value === conditionType && !lb?.isDefault);
        if (checkCustomFilter) {
            try {
                fieldCondition = JSON.parse(checkCustomFilter?.query);
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
        conditions.push({ condition: fieldCondition, operator: operator ?? "AND" });
    });

    if (conditions.length === 0) return JSON.stringify({});
    if (conditions.length === 1) return JSON.stringify(conditions[0].condition);

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

    return JSON.stringify(mongoQuery);
};

export const addDashboardQuery = (sendData) => {
    let mongoQuery = {};
    const { appliedFilters, selectedMatrix } = sendData;

    if (appliedFilters?.length) {
        appliedFilters.forEach(filter => {
            const { apiFieldName, condition, value, secondCondition, secondValue, operator } = filter;
            if (apiFieldName && condition) {
                // If there is only one condition (no operator)
                if (!operator) {
                    mongoQuery[apiFieldName] = { [condition]: parseFloat(value) ?? value ?? 0 };
                } else {
                    // Handle AND/OR logic if it was provided
                    const firstMatch = { [apiFieldName]: { [condition]: parseFloat(value) ?? value ?? 0 } };
                    const secondMatch = { [apiFieldName]: { [secondCondition]: parseFloat(secondValue) ?? secondValue ?? 0 } };

                    if (operator === "AND") {
                        if (!mongoQuery["$and"]) mongoQuery["$and"] = [];
                        mongoQuery["$and"].push(firstMatch, secondMatch);
                    } else if (operator === "OR") {
                        if (!mongoQuery["$or"]) mongoQuery["$or"] = [];
                        mongoQuery["$or"].push(firstMatch, secondMatch);
                    }
                }
            }
        });
    }

    if (selectedMatrix?.length) {
        mongoQuery["action"] = { $in: selectedMatrix?.map((item) => `${item}`.toUpperCase()) };
    }

    return JSON.stringify(mongoQuery);
};

export const buildRecommendationQuery = (conditions) => {
    const queryClauses = [];

    if (!conditions || !Array.isArray(conditions)) return JSON.stringify({});

    conditions.forEach((cond) => {
        const { conditionType, conditionOperator, conditionValue } = cond;

        // Map condition types to database fields
        const fieldMapping = {
            'Impressions': 'impressions',
            'Clicks': 'clicks',
            'Orders': 'orders',
            'Sales': 'sales',
            'ACOS': 'acos',
            'ROAS': 'roas',
            'Spend': 'spend',
            'CPC': 'cpc',
            'CTR': 'ctr',
            'CVR': 'cvr',
        };

        const dbField = fieldMapping[conditionType] || (conditionType ? conditionType.toLowerCase() : null);

        if (dbField && conditionValue !== undefined && conditionValue !== null && conditionValue !== '') {
            let operator = {};
            const numVal = Number(conditionValue);

            switch (conditionOperator) {
                case 'LESS_THAN':
                    operator = { $lt: numVal };
                    break;
                case 'LESS_THAN_OR_EQUAL_TO':
                    operator = { $lte: numVal };
                    break;
                case 'GREATER_THAN_OR_EQUAL_TO':
                    operator = { $gte: numVal };
                    break;
                case 'GREATER_THAN':
                    operator = { $gt: numVal };
                    break;
                case 'EQUAL_TO':
                    operator = { $eq: numVal };
                    break;
                default:
                    operator = { $eq: numVal };
            }

            queryClauses.push({ [dbField]: operator });
        }
    });

    return JSON.stringify(combineRuleQueryClauses(queryClauses));
};
