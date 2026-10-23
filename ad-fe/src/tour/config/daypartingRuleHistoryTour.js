import { tourRegistry } from '../TourRegistry';
import { Faders, Table, ChartBar } from "@phosphor-icons/react";

export const daypartingRuleHistoryTour = {
  id: "daypartingRuleHistoryTour",
  steps: [
    {
      target: "#dayparting-rule-history-filters",
      icon: Faders,
      title: "Filters & Search",
      content: "Use these filters to search and specify a date range for your Dayparting Rule History.",
            blockTargetInteraction: true
    },
    {
      target: "#dayparting-rule-history-table",
      icon: Table,
      title: "History Grid",
      content: "This grid displays all the records of your Dayparting Rule History. Click on the affected count to see more details and revert changes.",
            blockTargetInteraction: true
    },
    {
      target: ".custom-history-modal",
      icon: ChartBar,
      title: "Impact & Change History",
      content: "View all impacted campaigns/placements and inspect their latest ACOS and ROAS performance.",
            blockTargetInteraction: true
    },
  ]
};

tourRegistry.register(daypartingRuleHistoryTour);
