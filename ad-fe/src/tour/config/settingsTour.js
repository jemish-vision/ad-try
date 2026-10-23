import { tourRegistry } from '../TourRegistry';
import {
    Gear,
    Link,
    Table,
    Storefront,
    Megaphone,
    FloppyDisk,
    Heartbeat,
    Plus,
    ChartLineUp,
    Money,
    Target,
    MapPin,
    Lightbulb
} from "@phosphor-icons/react";

export const settingsTour = {
    id: "settings",
    steps: [
        {
            target: "#settings-tab-ads-config",
            icon: Gear,
            title: "Ads Config Tab",
            content: "Click here to manage your Amazon Advertising configurations.",
            requireClick: true
        },
        {
            target: "#ads-config-link-btn",
            icon: Link,
            title: "Link Account",
            content: "Click this button to link a new Amazon Ads account.",
            blockTargetInteraction: true
        },
        {
            target: "#config-main-table",
            icon: Table,
            title: "Amazon Config Grid",
            content: "View and manage all your connected Amazon Advertising profiles here.",
            blockTargetInteraction: true
        },
        {
            target: "#settings-tab-seller-config",
            icon: Storefront,
            title: "Seller Config Tab",
            content: "Click here to configure your Seller Central account connections.",
            requireClick: true
        },
        {
            target: "#sellerConfig-main-table",
            icon: Table,
            title: "Seller Config Grid",
            content: "View your connected seller accounts and manage their subscriptions.",
            blockTargetInteraction: true
        },
        {
            target: "#settings-tab-campaign-setting",
            icon: Megaphone,
            title: "Campaign Settings Tab",
            content: "Click here to set global defaults for your sponsored campaigns.",
            requireClick: true
        },
        {
            target: "#sp-campaign-settings",
            icon: Gear,
            title: "SP Campaign Settings",
            content: "Configure default Target ACOS and Bid limits for Sponsored Products.",
            blockTargetInteraction: true
        },
        {
            target: "#sp-campaign-save-btn",
            icon: FloppyDisk,
            title: "Save SP Settings",
            content: "Don't forget to save any changes made to the SP Campaign Settings.",
            requireClick: true
        },
        {
            target: "#health-score-table",
            icon: Heartbeat,
            title: "Dynamic Health Score Grid",
            content: "View conditions for how campaign health scores are calculated.",
            blockTargetInteraction: true
        },
        {
            target: "#health-score-add-rule-btn",
            icon: Plus,
            title: "Add Health Score Rule",
            content: "Create new health score conditions by clicking here.",
            blockTargetInteraction: true
        },
        {
            target: "#performance-score-table",
            icon: ChartLineUp,
            title: "Dynamic Performance Score Grid",
            content: "View conditions for calculating campaign performance scores.",
            blockTargetInteraction: true
        },
        {
            target: "#performance-score-add-rule-btn",
            icon: Plus,
            title: "Add Performance Score Rule",
            content: "Create new performance score conditions here.",
            blockTargetInteraction: true
        },
        {
            target: "#settings-tab-rule-setting",
            icon: Gear,
            title: "Rule Setting Tab",
            content: "Click here to define global threshold limits for budget, placement, and targeting rules.",
            requireClick: true
        },
        {
            target: "#budget-rule-config",
            icon: Money,
            title: "Budget Rule Config",
            content: "Set the minimum and maximum daily budget boundaries for automation.",
            blockTargetInteraction: true
        },
        {
            target: "#placement-rule-config",
            icon: MapPin,
            title: "Placement Rule Config",
            content: "Set the bid limits for automated placement adjustments.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-rule-config",
            icon: Target,
            title: "Targeting Rule Config",
            content: "Set the boundaries for keyword and product targeting bid automation.",
            blockTargetInteraction: true
        },
        {
            target: "#settings-tab-recommendation-setting",
            icon: Lightbulb,
            title: "Recommendation Setting Tab",
            content: "Click here to manage your automated recommendation rules.",
            requireClick: true
        },
        {
            target: "#recommandation-rule-table",
            icon: Table,
            title: "Recommendation Grid",
            content: "View, edit, and manage all your automated recommendation rules.",
            blockTargetInteraction: true
        },
        {
            target: "#add-recommendation-btn",
            icon: Plus,
            title: "Add Recommendation",
            content: "Click here to create a new recommendation rule.",
            blockTargetInteraction: true
        }
    ]
};

tourRegistry.register(settingsTour);

