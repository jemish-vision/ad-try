import { tourRegistry } from '../TourRegistry';
import {
    Funnel, ArrowsClockwise, Table, Stack, MagnifyingGlass,
    Clock, SlidersHorizontal, Tabs, Faders
} from '@phosphor-icons/react';

export const placementTourConfig = {
    id: "placement",
    title: "Placement Tour",
    steps: [
        { target: "#placement-filters", icon: Funnel, title: "Global Filters", content: "Filter placement data by specific dates, campaigns, and portfolios.", blockTargetInteraction: true },
        { target: "#bulk-actions-dropdown", icon: Stack, title: "Bulk Actions", content: "Apply percentage increases or decreases to multiple placement bids at once.", blockTargetInteraction: true },
        { target: "#placement-applied-filter", icon: Faders, title: "Applied Filters", content: "Review and save your currently active filtering options.", blockTargetInteraction: true },
        { target: "#placement-refresh-button", icon: ArrowsClockwise, title: "Refresh", content: "Reload the grid with the latest placement metrics.", blockTargetInteraction: true },
        { target: "#placement-data", icon: Table, title: "Data Container", content: "Access detailed statistics and controls for your ad placements.", blockTargetInteraction: true },
        { target: "#placement-search-option", icon: MagnifyingGlass, title: "Search", content: "Quickly locate specific campaigns or ad groups by name.", blockTargetInteraction: true },
        { target: "#placement-hourly-data", icon: Clock, title: "Hourly Data", content: "Track placement performance metrics on an hourly basis. Click here to explore the detailed hourly model.", childTourId: "hourly-tracking" },
        { target: "#placement-customize-columns", icon: SlidersHorizontal, title: "Customize Columns", content: "Tailor the grid by showing or hiding specific data columns.", blockTargetInteraction: true },
        { target: "#placement-tabs", icon: Tabs, title: "Placement Tabs", content: "Switch between Top of Search, Product Pages, and Rest of Search metrics.", blockTargetInteraction: true },
        { target: "#placement-main-table", icon: Table, title: "Main Data Grid", content: "Analyze and adjust your placement bidding strategy directly in the grid.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(placementTourConfig);
