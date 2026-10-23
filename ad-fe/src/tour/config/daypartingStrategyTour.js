import { tourRegistry } from '../TourRegistry';
import {
    Target, ClockCounterClockwise, PlusCircle, Export, Stack,
    Table, TextT, SlidersHorizontal, Lightning, FloppyDisk, XCircle, GridNine,
    MagnifyingGlass, ChartLineUp, ChartBar, Lightbulb, CalendarIcon, Pencil, Trash, Link, ToggleRight
} from '@phosphor-icons/react';

export const daypartingStrategyTourConfig = {
    id: "dayparting-strategy",
    title: "Dayparting Strategy Tour",
    steps: [
        { target: "#dayparting-strategy-date-range", icon: CalendarIcon, title: "Date Range", content: "Select the date range to analyze hourly performance data.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-csv", icon: Export, title: "Export to CSV", content: "Download the hourly analytics data as a CSV file.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-excel", icon: Export, title: "Export to Excel", content: "Download the hourly analytics data as an Excel file.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-cards", icon: ChartBar, title: "Performance Stats", content: "View aggregate performance statistics for the selected time range.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-line-chart", icon: ChartLineUp, title: "Hourly Trends", content: "Analyze how your selected metrics perform hour-by-hour.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-heatmap", icon: GridNine, title: "Performance Heatmap", content: "Identify the best and worst performing day and hour combinations.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-recommendation", icon: Lightbulb, title: "Strategic Recommendations", content: "Review automated suggestions on which hours to boost or pause based on historical data.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-search", icon: MagnifyingGlass, title: "Search Strategies", content: "Quickly find specific strategies by name.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-history", icon: ClockCounterClockwise, title: "History", content: "Review historical logs of all dayparting executions.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-add", icon: PlusCircle, title: "Add Strategy", content: "Click here to create a new dayparting strategy.", childTourId: "add-dayparting-strategy" },
        { target: "#dayparting-stretegy", icon: Table, title: "Strategies Grid", content: "Analyze and manage your existing dayparting strategies.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-edit-btn", icon: Pencil, title: "Edit Strategy", content: "Click here to modify the conditions of an existing strategy.", blockTargetInteraction: true, placement: "right" },
        { target: "#dayparting-strategy-delete-btn", icon: Trash, title: "Delete Strategy", content: "Click here to permanently remove a strategy from the system.", blockTargetInteraction: true, placement: "right" },
        { target: "#dayparting-strategy-link-btn", icon: Link, title: "Assign Campaigns", content: "Link your ad campaigns directly to this strategy.", blockTargetInteraction: true, placement: "right" },
        { target: "#dayparting-strategy-status-toggle", icon: ToggleRight, title: "Strategy Status", content: "Enable or disable this strategy at any time.", blockTargetInteraction: true, placement: "right" }
    ]
};

export const addDaypartingStrategyTourConfig = {
    id: "add-dayparting-strategy",
    title: "Create Dayparting Strategy Tour",
    steps: [
        { target: "#dayparting-strategy-modal", icon: PlusCircle, title: "Create New Strategy", content: "Configure the logic for your automated dayparting adjustment.", blockTargetInteraction: true },
        { target: "#rule-wizard-templates-card", icon: Stack, title: "Use Templates", content: "Choose from pre-configured dayparting templates to save time.", blockTargetInteraction: true },
        { target: "#rule-wizard-scratch-card", icon: PlusCircle, title: "Start from Scratch", content: "For this tour, let's start from scratch. Click here to proceed.", blockTargetInteraction: false, requireClick: true },
        { target: "#dayparting-strategy-type", icon: Target, title: "Strategy Type", content: "Choose whether to optimize for ACOS, ROAS, or custom parameters.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-mode", icon: SlidersHorizontal, title: "Adjustment Mode", content: "Select how the bids should be adjusted.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-name-input", icon: TextT, title: "Strategy Name", content: "Give your strategy a clear, identifiable name.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-frequency", icon: Lightning, title: "Frequency", content: "Choose how frequently this strategy applies.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-slot-type", icon: SlidersHorizontal, title: "Slot Type", content: "Select the time intervals for your strategy.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-grid", icon: GridNine, title: "Time Slots Grid", content: "Define the specific time slots and adjustments here.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-submit", icon: FloppyDisk, title: "Submit", content: "Save and activate your new strategy.", blockTargetInteraction: true },
        { target: "#dayparting-strategy-close .btn-close", icon: XCircle, title: "Close Window", content: "Click here to close the modal and return to the main page.", requireClick: true }
    ]
};

tourRegistry.register(daypartingStrategyTourConfig);
tourRegistry.register(addDaypartingStrategyTourConfig);
