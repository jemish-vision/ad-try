const { safeJsonParse } = require("../helper/common");
const { workerData, parentPort, threadId } = require("worker_threads");
const moment = require("moment-timezone");
const { write_logs } = require("../../winston/budgetRules/logger");

const getData = async () => {
  const { serializeRule, serializeCampaign, sleepTime } = workerData;
  const minutes = Math.floor(Math.random() * sleepTime) + 1;
  try {
    const rule = safeJsonParse(serializeRule);
    const profileId = rule.profileId;
    const campaign = safeJsonParse(serializeCampaign);
    const timezone = rule.timezone;
    if (rule.conditions.length > 0) {
      let spendConditions = "";
      let roasConditions = "";
      let salesConditions = "";
      let budgetConditions = "";
      let clicksConditions = "";
      let ordersConditions = "";
      let acosConditions = "";
      let impressionsConditions = "";
      let cpcConditions = "";
      let timeInBudgetConditions = "";
      let statusConditions = "";
      let typeConditions = "";
      let targetingTypeConditions = "";
      let outOfBudgetConditions = "";
      await Promise.all(
        rule.conditions.map(async (condition) => {
          let conditionValue = condition.conditionValue;

          if (
            condition.conditionType == "Budget" &&
            budgetConditions !== false
          ) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.budget * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              budgetConditions = campaign.budget > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              budgetConditions = campaign.budget >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              budgetConditions = campaign.budget < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              budgetConditions = campaign.budget <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              budgetConditions = campaign.budget == conditionValue;
            }
          }
          if (condition.conditionType == "Spend" && spendConditions !== false) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.spend * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              spendConditions = campaign.spend > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              spendConditions = campaign.spend >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              spendConditions = campaign.spend < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              spendConditions = campaign.spend <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              spendConditions = campaign.spend == conditionValue;
            }
          }
          if (condition.conditionType == "ROAS" && roasConditions !== false) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.roas * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              roasConditions = campaign.roas > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              roasConditions = campaign.roas >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              roasConditions = campaign.roas < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              roasConditions = campaign.roas <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              roasConditions = campaign.roas == conditionValue;
            }
          }
          if (condition.conditionType == "Sales" && salesConditions !== false) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.sales * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              salesConditions = campaign.sales > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              salesConditions = campaign.sales >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              salesConditions = campaign.sales < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              salesConditions = campaign.sales <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              salesConditions = campaign.sales == conditionValue;
            }
          }
          if (condition.conditionType == "ACOS" && acosConditions !== false) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.acos * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              acosConditions = campaign.acos > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              acosConditions = campaign.acos >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              acosConditions = campaign.acos < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              acosConditions = campaign.acos <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              acosConditions = campaign.acos == conditionValue;
            }
          }
          if (
            condition.conditionType == "Orders" &&
            ordersConditions !== false
          ) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.orders * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              ordersConditions = campaign.orders > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              ordersConditions = campaign.orders >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              ordersConditions = campaign.orders < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              ordersConditions = campaign.orders <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              ordersConditions = campaign.orders == conditionValue;
            }
          }
          if (
            condition.conditionType == "Impressions" &&
            impressionsConditions !== false
          ) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.impressions * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              impressionsConditions = campaign.impressions > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              impressionsConditions = campaign.impressions >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              impressionsConditions = campaign.impressions < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              impressionsConditions = campaign.impressions <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              impressionsConditions = campaign.impressions == conditionValue;
            }
          }
          if (condition.conditionType == "CPC" && cpcConditions !== false) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.cpc * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              cpcConditions = campaign.cpc > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              cpcConditions = campaign.cpc >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              cpcConditions = campaign.cpc < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              cpcConditions = campaign.cpc <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              cpcConditions = campaign.cpc == conditionValue;
            }
          }
          if (
            condition.conditionType == "Clicks" &&
            clicksConditions !== false
          ) {
            if (condition.conditionValueType == "Percentage") {
              conditionValue = (campaign.clicks * conditionValue) / 100;
            }

            if (condition.conditionOperator == "GREATER_THAN") {
              clicksConditions = campaign.clicks > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              clicksConditions = campaign.clicks >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              clicksConditions = campaign.clicks < conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO") {
              clicksConditions = campaign.clicks <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              clicksConditions = campaign.clicks == conditionValue;
            }
          } if (
            condition.conditionType == "TimeInBudget" &&
            timeInBudgetConditions !== false
          ) {
            // if (condition.conditionValueType == "Percentage") {
            //   conditionValue = (campaign.timeInBudget * conditionValue) / 100;
            // }

            if (condition.conditionOperator == "GREATER_THAN") {
              timeInBudgetConditions = campaign.timeInBudget > conditionValue;
            } else if (
              condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
            ) {
              timeInBudgetConditions = campaign.timeInBudget >= conditionValue;
            } else if (condition.conditionOperator == "LESS_THAN") {
              timeInBudgetConditions = campaign.timeInBudget < conditionValue;
            } else if (
              condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
            ) {
              timeInBudgetConditions = campaign.timeInBudget <= conditionValue;
            } else if (condition.conditionOperator == "EQUAL_TO") {
              timeInBudgetConditions = campaign.timeInBudget == conditionValue;
            }
          }
          if (
            condition.conditionType == "Status" &&
            statusConditions !== false
          ) {
            statusConditions = campaign.status == condition?.conditionStringValue;
          }
          if (
            condition.conditionType == "Type" &&
            typeConditions !== false
          ) {
            typeConditions = campaign.type == condition?.conditionStringValue;
          }
          if (
            condition.conditionType == "Targeting Type" &&
            targetingTypeConditions !== false
          ) {
            targetingTypeConditions = campaign.targetingType == condition?.conditionStringValue;
          }
          if (
            ["OutOfBudget", "Out of Budget"].includes(condition.conditionType) &&
            outOfBudgetConditions !== false
          ) {
            const isOOB =
              campaign.status === "OUT_OF_BUDGET" ||
              campaign.latestStatus === "OUT_OF_BUDGET" ||
              campaign.isOutOfBudget === true ||
              (Number(campaign.budget) > 0 && Number(campaign.todaySpend || campaign.spend) >= Number(campaign.budget)) ||
              (Number(campaign.timeInBudget) > 0 && Number(campaign.timeInBudget) < 100);

            outOfBudgetConditions = isOOB;
          }
        })
      );
      // write_logs({
      //   message: `${rule._id}, ${rule.ruleName}, ${campaign.campaignId}, ordersConditions: ${ordersConditions}, clicksConditions: ${clicksConditions}, salesConditions: ${salesConditions}, spendConditions: ${spendConditions}, roasConditions: ${roasConditions}, acosConditions: ${acosConditions}, budgetConditions: ${budgetConditions}, impressionsConditions: ${impressionsConditions}, cpcConditions: ${cpcConditions}`,
      //   log_type: "info",
      // });
      const conditionsArray = [
        budgetConditions,
        spendConditions,
        roasConditions,
        salesConditions,
        ordersConditions,
        acosConditions,
        impressionsConditions,
        cpcConditions,
        clicksConditions,
        timeInBudgetConditions,
        statusConditions,
        typeConditions,
        targetingTypeConditions,
        outOfBudgetConditions
      ];
      const conditions = conditionsArray.filter((value) => value !== "");
      let result = false;
      if (conditions.length > 0) {
        result = conditions.every((condition) => condition == true);
      }
      await sleep(minutes * 60000);
      parentPort.postMessage({
        threadId,
        response: { rule: rule, campaign: campaign, result: result },
      });
    }
  } catch (error) {
    write_logs({
      message: `Catch Error - ${error}, Thread ID: ${threadId}`,
      log_type: "info",
    });
    parentPort.postMessage({ error, threadId });
  }
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

getData();
