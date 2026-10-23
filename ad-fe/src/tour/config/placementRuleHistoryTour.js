import { tourRegistry } from '../TourRegistry';
import { ChartBar, Faders, Table, ArrowCounterClockwise, SquaresFour, X } from "@phosphor-icons/react";

export const placementRuleHistoryTour = {
  id: "placementRuleHistoryTour",
  steps: [
    {
      target: "#filter-search",
      icon: Faders,
      title: "Search Records",
      content: "Use the search bar to find specific rule executions by name or keyword.",
            blockTargetInteraction: true
    },
    {
      target: "#filter-date",
      icon: Faders,
      title: "Date Range",
      content: "Filter your rule history by selecting a specific date range.",
            blockTargetInteraction: true
    },
    {
      target: "#placement-rule-history-table",
      icon: Table,
      title: "History Grid",
      content: "This grid displays all the records of your Placement Rule History.",
            blockTargetInteraction: true
    },
    {
      target: "#tour-first-row-affected",
      icon: SquaresFour,
      title: "View Affected Records",
      content: "Click on the affected placements count in the grid to open a modal and see revert options.",
      requireClick: true,
    },
    {
      target: ".custom-history-modal",
      icon: SquaresFour,
      title: "Affected Records Modal",
      content: "This modal shows all records affected by a rule change. Normally, you open this by clicking the badges in the grid.",
            blockTargetInteraction: true
    },
    {
      target: "#history-revert-all-btn",
      icon: ArrowCounterClockwise,
      title: "Revert All Changes",
      content: "Click this button to revert all revertable changes back to their previous values.",
            blockTargetInteraction: true
    },
    {
      target: "#history-modal-close-btn",
      icon: X,
      title: "Close Modal",
      content: "Click this button to close the modal and complete the tour.",
      requireClick: true,
    }
  ]
};

tourRegistry.register(placementRuleHistoryTour);
