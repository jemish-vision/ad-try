import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, Calendar, Table, CheckCircle
} from '@phosphor-icons/react';

export const orderReportTourConfig = {
    id: "order-report",
    title: "Order Report Tour",
    steps: [
        { target: "#order-report-filters", icon: Funnel, title: "Global Filters", content: "Filter your report data using specific date ranges and profile settings.", blockTargetInteraction: true },
        { target: "#order-report-search", icon: MagnifyingGlass, title: "Search Report", content: "Search your order reports by ASIN, SKU, or Product Title.", blockTargetInteraction: true },
        { target: "#order-report-status", icon: CheckCircle, title: "Order Status", content: "Filter the report down to specific fulfillment statuses.", blockTargetInteraction: true },
        { target: "#order-report-applied-filter", icon: Funnel, title: "Applied Filters", content: "View all active status filters applied to your report.", blockTargetInteraction: true },
        { target: "#order-report-date-picker", icon: Calendar, title: "Date Range", content: "Adjust the reporting period to analyze different timeframes.", blockTargetInteraction: true },
        { target: "#order-report-top-cards", icon: Table, title: "Key Metrics", content: "Quickly review your high-level totals including Orders, Sales, Cost, and Margin.", blockTargetInteraction: true },
        { target: "#order-report-tab-view", icon: Table, title: "View Toggle", content: "Switch between Product Wise and State Wise breakdowns for different insights.", blockTargetInteraction: true },
        { target: "#order-report-main-table", icon: Table, title: "Report Grid", content: "View the comprehensive breakdown of your aggregated order metrics.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(orderReportTourConfig);
