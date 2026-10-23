import { WarningCircle, TrendDown, Heartbeat } from "@phosphor-icons/react";

export const getHealthScoreRuleTemplates = (t) => [
  {
    id: "budget-leak",
    title: t("Budget Leak"),
    description: t("Flag campaigns that have an extremely high ACOS (> 50%) indicating a severe budget drain."),
    icon: WarningCircle,
    iconColor: "text-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    data: {
      scoreName: "Budget Leak",
      conditions: [
        {
          queryOperator: "AND",
          conditionType: "ACOS",
          conditionOperator: "GREATER_THAN",
          conditionValue: "50",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ]
    }
  },
  {
    id: "needs-optimization",
    title: t("Needs Optimization"),
    description: t("Identify campaigns exceeding target ACOS but under 50% with active clicks, requiring bid tuning."),
    icon: TrendDown,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    data: {
      scoreName: "Needs Optimization",
      conditions: [
        {
          queryOperator: "AND",
          conditionType: "ACOS",
          conditionOperator: "GREATER_THAN",
          conditionValue: "30",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: true,
        },
        {
          queryOperator: "AND",
          conditionType: "ACOS",
          conditionOperator: "LESS_THAN_OR_EQUAL_TO",
          conditionValue: "50",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          queryOperator: "AND",
          conditionType: "Clicks",
          conditionOperator: "GREATER_THAN",
          conditionValue: "0",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ]
    }
  },
  {
    id: "healthy",
    title: t("Healthy"),
    description: t("Tag campaigns performing well (ACOS <= Target ACOS) that are actively generating sales."),
    icon: Heartbeat,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      scoreName: "Healthy",
      conditions: [
        {
          queryOperator: "AND",
          conditionType: "ACOS",
          conditionOperator: "LESS_THAN_OR_EQUAL_TO",
          conditionValue: "30",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: true,
        },
        {
          queryOperator: "AND",
          conditionType: "Sales",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "1",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ]
    }
  }
];
