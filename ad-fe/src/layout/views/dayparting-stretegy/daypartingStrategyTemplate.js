import { TrendUp, MoonStars, CalendarBlank } from "@phosphor-icons/react";

export const getDaypartingStrategyTemplates = (t) => [
  {
    id: "peak-hours-boost",
    title: t("Peak Hours Boost"),
    description:
      t("Increase bids during the highest-converting hours of the day to maximize visibility and capture more profitable traffic."),
    icon: TrendUp,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    data: {
      name: "Peak Hours Boost",
      type: "TARGETS",
      frequency: "DAILY",
      slotType: "2_HOUR",
      bidChangeType: "PERCENTAGE",
      slots: Array.from({ length: 12 }).map((_, i) => {
        const hour = i * 2;
        const isPeak = hour >= 8 && hour < 20;

        return {
          slotIndex: i,
          startTime: `${String(hour).padStart(2, "0")}:00`,
          endTime: `${String(hour + 2).padStart(2, "0")}:00`,
          enabled: isPeak,
          multiplier: isPeak ? 1.2 : 1
        };
      })
    }
  },

  {
    id: "off-peak-budget-saver",
    title: t("Off-Peak Budget Saver"),
    description:
      t("Reduce bids during low-converting overnight hours to conserve advertising budget without pausing campaigns."),
    icon: MoonStars,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    data: {
      name: "Off-Peak Budget Saver",
      type: "TARGETS",
      frequency: "DAILY",
      slotType: "2_HOUR",
      bidChangeType: "PERCENTAGE",
      slots: Array.from({ length: 12 }).map((_, i) => {
        const hour = i * 2;
        const isOffPeak = hour >= 22 || hour < 6;

        return {
          slotIndex: i,
          startTime: `${String(hour).padStart(2, "0")}:00`,
          endTime: `${String(hour + 2).padStart(2, "0")}:00`,
          enabled: isOffPeak,
          multiplier: isOffPeak ? 0.8 : 1
        };
      })
    }
  },

  {
    id: "weekend-performance-boost",
    title: t("Weekend Performance"),
    description:
      t("Increase bids throughout the weekend to capitalize on stronger shopping intent and higher conversion opportunities."),
    icon: CalendarBlank,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    data: {
      name: "Weekend Performance Boost",
      type: "TARGETS",
      frequency: "WEEKEND",
      slotType: "4_HOUR",
      bidChangeType: "PERCENTAGE",
      slots: Array.from({ length: 6 }).map((_, i) => {
        const hour = i * 4;

        return {
          slotIndex: i,
          startTime: `${String(hour).padStart(2, "0")}:00`,
          endTime: `${String(hour + 4).padStart(2, "0")}:00`,
          enabled: true,
          multiplier: 1.15
        };
      })
    }
  }
];
