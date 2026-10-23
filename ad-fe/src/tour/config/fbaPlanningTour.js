import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Calendar, Table, CheckCircle, ChartBar, Cards, Gear, X
} from '@phosphor-icons/react';

export const fbaPlanningTourConfig = {
    id: "fba-planning",
    title: "FBA Planning Tour",
    steps: [
        { target: "#fba-date-picker", icon: Calendar, title: "Date Filter", content: "Filter your FBA planning data by a specific date range.", blockTargetInteraction: true },
        { target: "#fba-search", icon: MagnifyingGlass, title: "Search Products", content: "Quickly locate products by SKU or ASIN.", blockTargetInteraction: true },
        { target: "#fba-cards", icon: Cards, title: "Summary Cards", content: "Get an overview of your total restocking needs, FBA stock, and inbound shipments.", blockTargetInteraction: true },
        { target: "#fba-sales-trend-chart", icon: ChartBar, title: "Sales Trend", content: "Visualize your sales trend to understand your daily units sold.", blockTargetInteraction: true },
        { target: "#fba-inventory-forecast-chart", icon: ChartBar, title: "Inventory Forecast", content: "View projected stock levels to prevent stockouts.", blockTargetInteraction: true },
        { target: "#status-dropdown", icon: CheckCircle, title: "Status Filter", content: "Filter products by their current status (e.g. URGENT, HEALTHY).", blockTargetInteraction: true },
        { target: "#fba-configure-planning", icon: Gear, title: "Configure Planning", content: "Click here to adjust global lead times and buffer days for all your products.", requireClick: true },
        { target: "#fba-settings-drawer", icon: Gear, title: "Configuration Drawer", content: "This drawer contains all your planning parameters.", blockTargetInteraction: true },
        { target: "#fba-settings-close", icon: X, title: "Close Drawer", content: "Once you have adjusted the settings, you can close the configuration drawer.", requireClick: true },
        { target: "#fba-planning-grid", icon: Table, title: "FBA Planning Grid", content: "View detailed restocking recommendations, current stock, and sales velocity for each product.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(fbaPlanningTourConfig);
