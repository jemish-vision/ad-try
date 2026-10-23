import { Rocket, Shield, CurrencyDollar } from "@phosphor-icons/react";

export const getBidPlacementRuleTemplates = (t) => [
  {
    id: "top-of-search-winner",
    title: t("Top of Search Winner"),
    description:
      t("Increase Top of Search placement bids for campaigns generating strong ROAS and consistent sales to maximize premium search visibility."),
    icon: Rocket,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      ruleName: "Top of Search Winner",
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
      conditions: [
        {
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "4"
        },
        {
          conditionType: "Sales",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "100"
        },
        {
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "10"
        }
      ],
      actionType: [
        {
          placement: "Top of Search",
          actionName: "Increase Bid",
          actionValue: 20,
          actionValueType: "Percentage"
        }
      ]
    }
  },
  {
    id: "product-page-cost-saver",
    title: t("Product Page Cost Saver"),
    description:
      t("Reduce Product Pages placement bids when advertising costs are high and conversions remain low, helping eliminate inefficient spend."),
    icon: Shield,
    iconColor: "text-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/30",
    data: {
      ruleName: "Product Page Cost Saver",
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
      conditions: [
        {
          conditionType: "ACOS",
          conditionOperator: "GREATER_THAN",
          conditionValue: "35"
        },
        {
          conditionType: "Spend",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "75"
        },
        {
          conditionType: "Orders",
          conditionOperator: "LESS_THAN_OR_EQUAL_TO",
          conditionValue: "2"
        }
      ],
      actionType: [
        {
          placement: "Product pages",
          actionName: "Decrease Bid",
          actionValue: 15,
          actionValueType: "Percentage"
        }
      ]
    }
  },
  {
    id: "full-placement-optimizer",
    title: t("Full Placement Optimizer"),
    description:
      t("Automatically optimize all placement multipliers by increasing Top of Search for winning campaigns while reducing less efficient placements for balanced profitability."),
    icon: CurrencyDollar,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    data: {
      ruleName: "Full Placement Optimizer",
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
      timeData: ["09:30"],
      conditions: [
        {
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "3.5"
        },
        {
          conditionType: "Sales",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "100"
        },
        {
          conditionType: "Orders",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "8"
        }
      ],
      actionType: [
        {
          placement: "Top of Search",
          actionName: "Increase Bid",
          actionValue: 20,
          actionValueType: "Percentage"
        },
        {
          placement: "Rest of Search",
          actionName: "Decrease Bid",
          actionValue: 10,
          actionValueType: "Percentage"
        },
        {
          placement: "Product pages",
          actionName: "Decrease Bid",
          actionValue: 10,
          actionValueType: "Percentage"
        }
      ]
    }
  },
  {
    id: "peak-hours-placement-boost",
    title: t("Peak Hours Placement Boost"),
    description:
      t("Dynamically increase Top of Search and Product Pages bids during peak converting hours, while optimizing off-peak spend."),
    icon: Rocket,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    data: {
      ruleName: "Peak Hours Placement Boost",
      ruleType: "N",
      reportDate: "LAST_7_DAYS",
      isHourlyBid: true,
      hourlyConfig: {
        frequency: "DAILY",
        slotType: "4_HOUR",
        slots: [
          { slotIndex: 0, startTime: "00:00", endTime: "04:00", enabled: true, actions: [{ placement: "Top of Search", actionName: "Decrease Bid", actionValue: 10, actionValueType: "Percentage" }, { placement: "Rest of Search", actionName: "Decrease Bid", actionValue: 15, actionValueType: "Percentage" }, { placement: "Product pages", actionName: "Decrease Bid", actionValue: 10, actionValueType: "Percentage" }] },
          { slotIndex: 1, startTime: "04:00", endTime: "08:00", enabled: true, actions: [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 5, actionValueType: "Percentage" }, { placement: "Rest of Search", actionName: "Decrease Bid", actionValue: 10, actionValueType: "Percentage" }, { placement: "Product pages", actionName: "Increase Bid", actionValue: 5, actionValueType: "Percentage" }] },
          { slotIndex: 2, startTime: "08:00", endTime: "12:00", enabled: true, actions: [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 25, actionValueType: "Percentage" }, { placement: "Rest of Search", actionName: "Increase Bid", actionValue: 5, actionValueType: "Percentage" }, { placement: "Product pages", actionName: "Increase Bid", actionValue: 15, actionValueType: "Percentage" }] },
          { slotIndex: 3, startTime: "12:00", endTime: "16:00", enabled: true, actions: [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 20, actionValueType: "Percentage" }, { placement: "Rest of Search", actionName: "Increase Bid", actionValue: 5, actionValueType: "Percentage" }, { placement: "Product pages", actionName: "Increase Bid", actionValue: 15, actionValueType: "Percentage" }] },
          { slotIndex: 4, startTime: "16:00", endTime: "20:00", enabled: true, actions: [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 30, actionValueType: "Percentage" }, { placement: "Rest of Search", actionName: "Increase Bid", actionValue: 10, actionValueType: "Percentage" }, { placement: "Product pages", actionName: "Increase Bid", actionValue: 20, actionValueType: "Percentage" }] },
          { slotIndex: 5, startTime: "20:00", endTime: "24:00", enabled: true, actions: [{ placement: "Top of Search", actionName: "Increase Bid", actionValue: 15, actionValueType: "Percentage" }, { placement: "Rest of Search", actionName: "Decrease Bid", actionValue: 5, actionValueType: "Percentage" }, { placement: "Product pages", actionName: "Increase Bid", actionValue: 10, actionValueType: "Percentage" }] },
        ]
      },
      selectedDays: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
      ],
      timeData: ["09:00"],
      conditions: [
        {
          conditionType: "ROAS",
          conditionOperator: "GREATER_THAN_OR_EQUAL_TO",
          conditionValue: "3.5"
        }
      ],
      actionType: [
        {
          placement: "Top of Search",
          actionName: "Increase Bid",
          actionValue: 20,
          actionValueType: "Percentage"
        },
        {
          placement: "Rest of Search",
          actionName: "Decrease Bid",
          actionValue: 10,
          actionValueType: "Percentage"
        },
        {
          placement: "Product pages",
          actionName: "Increase Bid",
          actionValue: 15,
          actionValueType: "Percentage"
        }
      ]
    }
  }
];

