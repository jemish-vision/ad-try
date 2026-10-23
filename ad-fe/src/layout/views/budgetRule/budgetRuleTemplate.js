import { Rocket, Shield, CurrencyDollar } from "@phosphor-icons/react";

export const getBudgetRuleTemplates = (t) => [
  {
    id: "scale-winning-campaigns",
    title: t("Scale Winning Campaigns"),
    description:
      t("Increase budget for campaigns with strong ROAS, healthy sales volume, and active delivery to maximize profitable growth."),
    icon: Rocket,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      ruleName: "Scale Winning Campaigns",
      ruleType: "N",
      reportDate: "LAST_7_DAYS",
      selectedDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      timeData: ["09:00"],
      conditionData: [
        {
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "4",
          conditionValueType: "Number"
        },
        {
          conditionType: "Sales",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "100",
          conditionValueType: "Number"
        },
        {
          conditionType: "Status",
          conditionStringValue: "ENABLED"
        }
      ],
      actionType: {
        actionName: "Increase",
        actionValue: "20",
        actionValueType: "Percentage"
      }
    }
  },
  {
    id: "stop-wasting-budget",
    title: t("Stop Wasting Budget"),
    description:
      t("Pause campaigns with consistently high ACOS after meaningful spend to prevent unnecessary advertising costs."),
    icon: Shield,
    iconColor: "text-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    data: {
      ruleName: "Stop Wasting Budget",
      ruleType: "N",
      reportDate: "LAST_7_DAYS",
      selectedDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      timeData: ["10:00"],
      conditionData: [
        {
          conditionType: "ACOS",
          conditionOperator: "GREATER_THAN",
          conditionValue: "40",
          conditionValueType: "Percentage"
        },
        {
          conditionType: "Spend",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "75",
          conditionValueType: "Number"
        },
        {
          conditionType: "Orders",
          conditionOperator: "LESS_THAN_OR_EQUAL_TO",
          conditionValue: "2",
          conditionValueType: "Number"
        }
      ],
      actionType: {
        actionName: "Paused",
        actionValue: "",
        actionValueType: ""
      }
    }
  },
  {
    id: "recover-winning-campaigns",
    title: t("Recover Winning Campaigns"),
    description:
      t("Increase budget only for profitable campaigns that have gone Out of Budget, ensuring top performers continue serving ads."),
    icon: CurrencyDollar,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    data: {
      ruleName: "Recover Winning Campaigns",
      ruleType: "N",
      reportDate: "LAST_7_DAYS",
      selectedDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      timeData: ["12:00"],
      conditionData: [
        {
          conditionType: "Status",
          conditionStringValue: "OUT_OF_BUDGET"
        },
        {
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "3",
          conditionValueType: "Number"
        },
        {
          conditionType: "Sales",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "50",
          conditionValueType: "Number"
        }
      ],
      actionType: {
        actionName: "Increase",
        actionValue: "25",
        actionValueType: "Percentage"
      }
    }
  },
];