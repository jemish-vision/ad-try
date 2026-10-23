import { SmileySad, SmileyMeh, Smiley } from "@phosphor-icons/react";

export const getPerformanceScoreRuleTemplates = (t) => [
  {
    id: "loss",
    title: t("Loss"),
    description: t("Flag campaigns that are generating orders but have a poor return on ad spend (ROAS < 1)."),
    icon: SmileySad,
    iconColor: "text-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    data: {
      scoreName: "Loss",
      conditions: [
        {
          queryOperator: "AND",
          conditionType: "ROAS",
          conditionOperator: "LESS_THAN",
          conditionValue: "1",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          queryOperator: "AND",
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "1",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ]
    }
  },
  {
    id: "break-even",
    title: t("Break Even"),
    description: t("Identify campaigns that are generating sales with moderate efficiency (ROAS between 1 and 3)."),
    icon: SmileyMeh,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    data: {
      scoreName: "Break Even",
      conditions: [
        {
          queryOperator: "AND",
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "1",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          queryOperator: "AND",
          conditionType: "ROAS",
          conditionOperator: "LESS_THAN",
          conditionValue: "3",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          queryOperator: "AND",
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "1",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ]
    }
  },
  {
    id: "profitable",
    title: t("Profitable"),
    description: t("Highlight top performing campaigns driving significant orders with high efficiency (ROAS >= 3)."),
    icon: Smiley,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      scoreName: "Profitable",
      conditions: [
        {
          queryOperator: "AND",
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "3",
          conditionMaxValue: "",
          conditionStringValue: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          queryOperator: "AND",
          conditionType: "Orders",
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
