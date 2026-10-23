import { ArrowFatUp, TrendUp, WarningCircle } from "@phosphor-icons/react";

export const SearchTermRuleTemplates = [
  {
    id: "scale-winning-search-terms",
    title: "Scale Winning Search Terms",
    description:
      "Identify highly profitable search terms with strong conversion rates and promote them into exact match campaigns.",
    icon: ArrowFatUp,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    data: {
      ruleName: "Scale Winning Search Terms",
      ruleType: "AUTO",
      reportDate: "LAST_30_DAYS",
      conditions: [
        {
          operator: "AND",
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "5",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          operator: "AND",
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "4",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ],
      actionType: {
        actionName: "TARGETING",
        actionValue: "EXACT",
        actionValueType: "EXACT"
      }
    }
  },
  {
    id: "expand-broad-performing-terms",
    title: "Expand Broad Search Terms",
    description:
      "Capture profitable customer search behavior by adding successful search terms as broad match keywords for additional reach.",
    icon: TrendUp,
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
    data: {
      ruleName: "Expand Broad Search Terms",
      ruleType: "MANUAL",
      reportDate: "LAST_30_DAYS",
      conditions: [
        {
          operator: "AND",
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "3",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          operator: "AND",
          conditionType: "ACOS",
          conditionOperator: "LESS_THAN_OR_EQUAL_TO",
          conditionValue: "30",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ],
      actionType: {
        actionName: "TARGETING",
        actionValue: "EXACT",
        actionValueType: "EXACT"
      }
    }
  },
  {
    id: "block-high-spend-low-performance",
    title: "Block High Spend Search Terms",
    description:
      "Automatically negate search terms that consume significant budget without generating any sales.",
    icon: WarningCircle,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
    data: {
      ruleName: "Block High Spend Search Terms",
      ruleType: "AUTO",
      reportDate: "LAST_30_DAYS",
      conditions: [
        {
          operator: "AND",
          conditionType: "Spend",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "50",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        },
        {
          operator: "AND",
          conditionType: "Orders",
          conditionOperator: "EQUAL_TO",
          conditionValue: "0",
          conditionMaxValue: "",
          conditionStatus: "",
          conditionValueType: "Number",
          useTargetAcos: false,
        }
      ],
      actionType: {
        actionName: "NEGATIVE_TARGETING",
        actionValue: "PHRASE",
        actionValueType: "PHRASE"
      }
    }
  },
];
