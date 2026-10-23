import { TrendUp, TrendDown, PauseCircle } from "@phosphor-icons/react";

export const TargetingRuleTemplates = [
  {
    id: "increase-winning-targets",
    title: "Increase Winning Targets",
    description:
      "Increase bids on profitable keywords and product targets that consistently generate orders with a low ACOS.",
    icon: TrendUp,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      ruleName: "Increase Winning Targets",
      ruleType: "N",
      reportDate: "LAST_30_DAYS",
      selectedDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      timeData: ["09:00"],
      conditionData: [
        {
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "2",
          conditionStatus: "",
          conditionValueType: "Number",
          targetingTypes: []
        },
        {
          conditionType: "ACOS",
          conditionOperator: "LESS_THAN",
          conditionValue: "20",
          conditionStatus: "",
          conditionValueType: "Number",
          targetingTypes: []
        }
      ],
      actionType: {
        actionName: "Increase",
        actionValue: 10,
        actionValueType: "Percentage"
      }
    }
  },

  {
    id: "reduce-high-acos-targets",
    title: "Reduce High ACOS Targets",
    description:
      "Reduce bids on targets with high advertising costs and significant spend to improve overall profitability.",
    icon: TrendDown,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    data: {
      ruleName: "Reduce High ACOS Targets",
      ruleType: "N",
      reportDate: "LAST_30_DAYS",
      selectedDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      timeData: ["09:00"],
      conditionData: [
        {
          conditionType: "Spend",
          conditionOperator: "GREATER_THAN",
          conditionValue: "20",
          conditionStatus: "",
          conditionValueType: "Number",
          targetingTypes: []
        },
        {
          conditionType: "ACOS",
          conditionOperator: "GREATER_THAN",
          conditionValue: "35",
          conditionStatus: "",
          conditionValueType: "Number",
          targetingTypes: []
        }
      ],
      actionType: {
        actionName: "Decrease",
        actionValue: 15,
        actionValueType: "Percentage"
      }
    }
  },

  {
    id: "pause-non-converting-targets",
    title: "Pause Non-Converting Targets",
    description:
      "Pause keywords or product targets that have received many clicks but failed to generate any orders.",
    icon: PauseCircle,
    iconColor: "text-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    data: {
      ruleName: "Pause Non-Converting Targets",
      ruleType: "N",
      reportDate: "LAST_30_DAYS",
      selectedDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      timeData: ["09:00"],
      conditionData: [
        {
          conditionType: "Clicks",
          conditionOperator: "GREATER_THAN",
          conditionValue: "25",
          conditionStatus: "",
          conditionValueType: "Number",
          targetingTypes: []
        },
        {
          conditionType: "Orders",
          conditionOperator: "EQUAL_TO",
          conditionValue: "0",
          conditionStatus: "",
          conditionValueType: "Number",
          targetingTypes: []
        }
      ],
      actionType: {
        actionName: "Paused",
        actionValue: "",
        actionValueType: ""
      }
    }
  }
];
