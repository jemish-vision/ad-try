import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Calendar, Table, CheckCircle, ChartBar, MapTrifold
} from '@phosphor-icons/react';

export const dealsDashboardTourConfig = {
    id: "deals-dashboard",
    title: "Deals Tour",
    steps: [
        { target: "#deals-search", icon: MagnifyingGlass, title: "Search Deals", content: "Quickly locate specific deals by their name, ID, or ASIN.", blockTargetInteraction: true },
        { target: "#deals-date-picker", icon: Calendar, title: "Date Range", content: "Filter deals by their start or end dates.", blockTargetInteraction: true },
        { target: "#deals-status", icon: CheckCircle, title: "Status Filter", content: "Filter deals based on their status like Running, Upcoming, or Ended.", blockTargetInteraction: true },
        { target: "#deals-type", icon: MapTrifold, title: "Deal Type", content: "Filter your deals by type (e.g., Best Deal, Lightning Deal).", blockTargetInteraction: true },
        { target: "#deals-stats", icon: ChartBar, title: "Performance Overview", content: "Quickly see your total sales, units sold, glance views, and average conversion rate.", blockTargetInteraction: true },
        { target: "#deals-main-table", icon: Table, title: "Deals Grid", content: "View all your deals and expand them to see the performance of individual products within the deal.", blockTargetInteraction: true },
    ]
};

tourRegistry.register(dealsDashboardTourConfig);
