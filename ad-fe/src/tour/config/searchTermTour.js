import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, Calendar,
    SlidersHorizontal, ArrowsClockwise, Tabs, Table, Faders, ListBullets
} from '@phosphor-icons/react';

export const searchTermTourConfig = {
    id: "search-term",
    title: "Search Term Tour",
    steps: [
        { target: "#search-term-filters", icon: Funnel, title: "Global Filters", content: "Filter search terms by various metrics and status.", blockTargetInteraction: true },
        { target: "#search-term-search-option", icon: MagnifyingGlass, title: "Search", content: "Search for specific search terms.", blockTargetInteraction: true },
        { target: "#search-term-date-picker", icon: Calendar, title: "Date Range", content: "Select a date range for your data.", blockTargetInteraction: true },
        { target: "#search-term-customize-columns", icon: SlidersHorizontal, title: "Customize Columns", content: "Choose which metric columns to display.", blockTargetInteraction: true },
        { target: "#search-term-refresh-button", icon: ArrowsClockwise, title: "Refresh", content: "Refresh the data in the grid.", blockTargetInteraction: true },
        { target: "#search-term-tab-campaign", icon: Tabs, title: "Campaign View", content: "Click here to view search terms grouped by Campaign.", requireClick: true },
        { target: "#search-term-applied-filter", icon: Faders, title: "Applied Filters (Campaign)", content: "Review and manage the active filters applied to the campaign view.", blockTargetInteraction: true },
        { target: "#search-term-main-table", icon: Table, title: "Campaign Grid", content: "Analyze the search term data across your campaigns.", blockTargetInteraction: true },
        { target: "#search-term-tab-product", icon: Tabs, title: "Product View", content: "Click here to switch and view search terms grouped by Product.", requireClick: true },
        { target: "#search-term-applied-filter", icon: Faders, title: "Applied Filters (Product)", content: "Review and manage the active filters applied to the product view.", blockTargetInteraction: true },
        { target: "#search-term-product-view-sidebar", icon: ListBullets, title: "Product List", content: "Select a product from the list to view its specific search terms.", blockTargetInteraction: true },
        { target: "#search-term-main-table", icon: Table, title: "Product Grid", content: "Analyze the search term data for the selected product.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(searchTermTourConfig);
