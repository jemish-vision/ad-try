import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Calendar, Table, CheckCircle, ChartBar, Cards
} from '@phosphor-icons/react';

export const inventoryTourConfig = {
    id: "inventory",
    title: "Inventory Tour",
    steps: [
        { target: "#inventory-summary-cards", icon: Cards, title: "Summary Metrics", content: "Get a quick overview of your total SKUs, FBA vs FBM stock, and critical alerts.", blockTargetInteraction: true },
        { target: "#inventory-chart", icon: ChartBar, title: "Inventory Chart", content: "Visualize your current and inbound stock levels compared against days left.", blockTargetInteraction: true },
        { target: "#inventory-search", icon: MagnifyingGlass, title: "Search Inventory", content: "Search for specific products using their ASIN or SKU.", blockTargetInteraction: true },
        { target: "#inventory-status", icon: CheckCircle, title: "Status Filter", content: "Filter inventory by status such as Healthy, Low Stock, or Out of Stock.", blockTargetInteraction: true },
        { target: "#inventory-date-picker", icon: Calendar, title: "Date Range", content: "Select a date range to filter your inventory data.", blockTargetInteraction: true },
        { target: "#inventory-management-main-table", icon: Table, title: "Inventory Grid", content: "View detailed information about your inventory, including current stock and aging buckets.", blockTargetInteraction: true },
    ]
};

tourRegistry.register(inventoryTourConfig);
