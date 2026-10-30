import {
  Funnel,
  MagnifyingGlass,
  Lightbulb,
} from "@phosphor-icons/react";

export const RecommendationRuleTemplates = [
  {
    id: "pause-low-performing-targeting",
    title: "Pause Low Performing Targeting",
    description:
      "Recommend pausing targeting that has accumulated clicks without generating any orders.",
    icon: Funnel,
    iconColor: "text-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    data: {
      ruleName: "Pause Low Performing Targeting",
      reportDate: "LAST_30_DAYS",
      gridName: "Targeting",
      conditions: [
        {
          conditionType: "Clicks",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "20",
        },
        {
          conditionType: "Orders",
          conditionOperator: "EQUAL_TO",
          conditionValue: "0",
        },
      ],
      actions: [
        {
          actionName: "PauseTargeting",
        },
      ],
    },
  },

  {
    id: "harvest-profitable-search-terms",
    title: "Harvest Profitable Search Terms",
    description:
      "Recommend adding high-converting search terms as Exact keywords for better control and performance.",
    icon: MagnifyingGlass,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      ruleName: "Harvest Profitable Search Terms",
      reportDate: "LAST_30_DAYS",
      gridName: "Search Term",
      conditions: [
        {
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "3",
        },
        {
          conditionType: "ACOS",
          conditionOperator: "LESS_THAN_OR_EQUAL_TO",
          conditionValue: "25",
        },
      ],
      actions: [
        {
          actionName: "AddAsTargeting",
          matchType: "Exact",
        },
      ],
    },
  },

  {
    id: "increase-top-of-search-bid",
    title: "Increase Top of Search Bid",
    description:
      "Recommend increasing Top of Search placement bids when campaigns deliver strong ROAS.",
    icon: Lightbulb,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    data: {
      ruleName: "Increase Top of Search Bid",
      reportDate: "LAST_30_DAYS",
      gridName: "Placement",
      conditions: [
        {
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "4",
        },
        {
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "5",
        },
      ],
      actions: [
        {
          actionName: "IncreaseBid",
          placementType: "Top of Search",
          actionValue: "20",
          actionValueType: "Percentage",
        },
      ],
    },
  },

  {
    id: "out-of-budget-campaigns",
    title: "Out of Budget Campaigns",
    description:
      "Monitor and surface campaigns that have exhausted their daily budget so you can adjust budgets accordingly.",
    icon: Lightbulb,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    data: {
      ruleName: "Out of Budget Campaigns",
      reportDate: "TODAY",
      gridName: "Campaign",
      conditions: [
        {
          conditionType: "Out of Budget",
          conditionOperator: "",
          conditionValue: "",
          oobPeriod: "LAST_7_DAYS",
          oobDays: "",
        },
      ],
      actions: [],
    },
  },
];