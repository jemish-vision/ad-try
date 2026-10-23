import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Calendar, Table, Funnel, ChartBar, WarningCircle
} from '@phosphor-icons/react';

export const returnsTourConfig = {
    id: "returns",
    title: "Returns & Refunds Tour",
    steps: [
        { target: "#returns-filter-by", icon: Funnel, title: "Filter Returns", content: "Filter your returns data by type, reason, status, source, or policy.", blockTargetInteraction: true },
        { target: "#returns-search", icon: MagnifyingGlass, title: "Search Returns", content: "Search for specific return requests by product, ASIN, SKU, or Order ID.", blockTargetInteraction: true },
        { target: "#returns-date-picker", icon: Calendar, title: "Date Filter", content: "Select a date range to narrow down the returns data.", blockTargetInteraction: true },
        { target: "#returns-applied-filters", icon: WarningCircle, title: "Applied Filters", content: "View and manage the filters you have currently applied to the returns data.", blockTargetInteraction: true },
        { target: "#returns-charts", icon: ChartBar, title: "Return Insights", content: "Visualize your return trends, top return reasons, and overall return rates.", blockTargetInteraction: true },
        { target: "#return-tracking-grid", icon: Table, title: "Returns Grid", content: "View detailed information about each return request, including reason, status, and refund amount.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(returnsTourConfig);
