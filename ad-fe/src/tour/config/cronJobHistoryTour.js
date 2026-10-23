import { tourRegistry } from '../TourRegistry';
import { Faders, Table } from "@phosphor-icons/react";

export const cronJobHistoryTour = {
  id: "cronJobHistoryTour",
  steps: [
    {
      target: "#cron-history-search",
      icon: Faders,
      title: "Search Cron Jobs",
      content: "Use this search bar to find specific cron jobs by name.",
            blockTargetInteraction: true
    },
    {
      target: "#cron-history-type-filter",
      icon: Faders,
      title: "Type Filter",
      content: "Filter cron jobs by their associated type or module.",
            blockTargetInteraction: true
    },
    {
      target: "#cron-history-date-picker",
      icon: Faders,
      title: "Date Range",
      content: "Select a date range to filter the cron job history.",
            blockTargetInteraction: true
    },
    {
      target: "#cronJobHistory-main-table",
      icon: Table,
      title: "History Grid",
      content: "This grid displays all the records of your Cron Job executions.",
            blockTargetInteraction: true
    }
  ]
};

tourRegistry.register(cronJobHistoryTour);
