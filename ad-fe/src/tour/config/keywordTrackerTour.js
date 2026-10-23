import { tourRegistry } from '../TourRegistry';
import {
    Tabs, ListBullets, Lightbulb,
    Funnel, Calendar, ArrowsClockwise, MagnifyingGlass, Faders, Table,
    Sidebar
} from '@phosphor-icons/react';

export const keywordTrackerTourConfig = {
    id: "keyword-tracker",
    title: "Keyword Tracker Tour",
    steps: [
        { target: "#keyword-tracker-filters", icon: Funnel, title: "Global Filters", content: "Use global filters to narrow down your targeting data based on specific metrics and statuses.", blockTargetInteraction: true },
        { target: "#keyword-tracker-date-picker", icon: Calendar, title: "Date Range", content: "Adjust the date range to view your keyword performance over a specific period.", blockTargetInteraction: true },
        { target: "#keyword-tracker-refresh-button", icon: ArrowsClockwise, title: "Refresh Data", content: "Click here to fetch the latest tracking data.", blockTargetInteraction: true },
        { target: "#keyword-tracker-tab-KEYWORDS", icon: Tabs, title: "Keywords Tracker", content: "Navigate back to the main Keywords Tracker view to analyze your core metrics.", requireClick: true },
        { target: "#keyword-tracker-search-option", icon: MagnifyingGlass, title: "Search Targets", content: "Quickly find specific keywords or targets by entering search terms here.", blockTargetInteraction: true },
        { target: "#keyword-tracker-sub-tabs", icon: Tabs, title: "Targeting Views", content: "Easily toggle between All, Auto, and Manual campaign targeting views.", blockTargetInteraction: true },
        { target: "#keyword-tracker-applied-filters", icon: Faders, title: "Applied Filters", content: "View your currently applied filters and quickly clear or save them for future use.", blockTargetInteraction: true },
        { target: "#keyword-tracker-main-table", icon: Table, title: "Keyword Tracker Grid", content: "Analyze detailed performance metrics for all your tracked keywords in this comprehensive grid.", blockTargetInteraction: true },
        { target: "#keyword-tracker-first-target-0", icon: ListBullets, title: "Target Details", content: "Click on a specific target name to open a detailed view of its history and analytics.", requireClick: true },
        { target: "#keyword-tracker-drawer", icon: Sidebar, title: "Targeting Drawer", content: "This side drawer provides an in-depth look at the selected target's performance metrics and history.", blockTargetInteraction: true },
        { target: "#keyword-tracker-drawer-close", icon: Funnel, title: "Close Drawer", content: "Click the close button to dismiss this drawer and return to the main grid.", requireClick: true },
        { target: "#keyword-tracker-tab-KEYWORD_SUGGESTIONS", icon: Lightbulb, title: "Keyword Suggestions", content: "Switch to the Keyword Suggestions tab to discover automated keyword recommendations.", requireClick: true },
        { target: "#keyword-suggestion-sub-tabs", icon: Tabs, title: "Suggestion Sources", content: "Toggle between keyword suggestions generated from your manual campaigns versus auto campaigns.", blockTargetInteraction: true },
        { target: "#keyword-suggestion-main-table", icon: Table, title: "Suggestions Grid", content: "Review the AI-generated keyword suggestions and their performance metrics in this grid.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(keywordTrackerTourConfig);
