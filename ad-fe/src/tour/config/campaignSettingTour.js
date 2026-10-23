import { tourRegistry } from '../TourRegistry';
import { Faders, Table, PlusCircle, CheckCircle } from "@phosphor-icons/react";

export const campaignSettingTour = {
  id: "campaignSettingTour",
  steps: [
    {
      target: "#sp-campaign-settings",
      icon: Faders,
      title: "Sponsored Products Settings",
      content: "Configure global defaults for product eligibility thresholds and target ACOS here.",
            blockTargetInteraction: true
    },
    {
      target: "#sp-campaign-save-btn",
      icon: CheckCircle,
      title: "Save Settings",
      content: "Click this button to save your Sponsored Products configuration.",
      requireClick: true,
    },
    {
      target: "#health-score-add-rule-btn",
      icon: PlusCircle,
      title: "Add Health Score Rule",
      content: "Click here to add a new dynamic health score rule to define conditions for Healthy, Needs Optimization, and Budget Leak statuses.",
            blockTargetInteraction: true
    },
    {
      target: "#health-score-table",
      icon: Table,
      title: "Health Score Grid",
      content: "This grid displays all your currently configured Health Score rules. You can edit or delete them from here.",
            blockTargetInteraction: true
    },
    {
      target: "#performance-score-add-rule-btn",
      icon: PlusCircle,
      title: "Add Performance Score Rule",
      content: "Click here to add a new dynamic performance score rule based on custom metrics.",
            blockTargetInteraction: true
    },
    {
      target: "#performance-score-table",
      icon: Table,
      title: "Performance Score Grid",
      content: "This grid displays all your currently configured Performance Score rules.",
            blockTargetInteraction: true
    }
  ]
};

tourRegistry.register(campaignSettingTour);
