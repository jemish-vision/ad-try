import { tourRegistry } from '../TourRegistry';
import {
    Funnel, Stack, ArrowsClockwise,
    ChartLineUp, Table, ClockCounterClockwise,
    MagnifyingGlass, SlidersHorizontal, Faders, Calendar, Cards, ListDashes
} from '@phosphor-icons/react';

export const targetingTourConfig = {
    id: "targeting",
    title: "Targeting Tour",
    steps: [
        { target: "#targeting-filters", icon: Funnel, title: "Global Filters", content: "Filter your targets by status, type, and specific criteria.", blockTargetInteraction: true },
        { target: "#targeting-filter-by-dropdown", icon: Funnel, title: "Filter By Options", content: "Select specific saved filters or apply new filter parameters.", blockTargetInteraction: true },
        { target: "#targeting-search-option", icon: MagnifyingGlass, title: "Search", content: "Quickly search for specific keyword or product targets.", blockTargetInteraction: true },
        { target: "#targeting-date-picker", icon: Calendar, title: "Date Range", content: "Select the date range to analyze targeting performance.", blockTargetInteraction: true },
        { target: "#targeting-refresh-button", icon: ArrowsClockwise, title: "Refresh", content: "Reload the grid with the latest targeting data.", blockTargetInteraction: true },
        { target: "#campaignTop", icon: Cards, title: "Top Metrics", content: "Review your aggregate KPI metrics at a glance.", blockTargetInteraction: true },
        { target: "#targeting-chart", icon: ChartLineUp, title: "Performance Chart", content: "Visualize targeting performance metrics over time.", blockTargetInteraction: true },
        { target: "#targeting-tabs", icon: ListDashes, title: "Target Categories", content: "Quickly toggle between different types of targets such as Keywords or Products.", blockTargetInteraction: true },
        { target: "#bulk-actions-dropdown", icon: Stack, title: "Bulk Actions", content: "Apply bulk changes to multiple selected targets at once.", blockTargetInteraction: true },
        { target: "#targeting-history", icon: ClockCounterClockwise, title: "History", content: "Review historical logs and adjustments made to your targets.", blockTargetInteraction: true },
        { target: "#targeting-customize-columns", icon: SlidersHorizontal, title: "Customize Columns", content: "Tailor the grid by showing or hiding specific metric columns.", blockTargetInteraction: true },
        { target: "#targeting-applied-filter", icon: Faders, title: "Applied Filters", content: "View and save your currently active filters.", blockTargetInteraction: true },
        { target: "#targeting-main-table", icon: Table, title: "Main Data Grid", content: "Sort, filter, and interact with your targeting data. Click any targeting keyword link to view scoped KPIs, charts, and its complete change history audit trail.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(targetingTourConfig);
