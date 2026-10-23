import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, Calendar, Table, CheckCircle, Sidebar, XCircle
} from '@phosphor-icons/react';

export const ordersTourConfig = {
    id: "orders",
    title: "Orders Tour",
    steps: [
        { target: "#orders-filters", icon: Funnel, title: "Global Filters", content: "Use these filters to refine the data shown on the Orders page.", blockTargetInteraction: true },
        { target: "#orders-search", icon: MagnifyingGlass, title: "Search Orders", content: "Quickly find specific orders using ID, ASIN, SKU, or buyer details.", blockTargetInteraction: true },
        { target: "#orders-status", icon: CheckCircle, title: "Order Status", content: "Filter orders based on their current status (e.g., Shipped, Pending).", blockTargetInteraction: true },
        { target: "#orders-applied-filter", icon: Funnel, title: "Applied Filters", content: "View and manage all currently active status filters at a glance.", blockTargetInteraction: true },
        { target: "#orders-date-picker", icon: Calendar, title: "Date Range", content: "Select a specific date range to view historical orders.", blockTargetInteraction: true },
        { target: "#orders-main-table", icon: Table, title: "Orders Grid", content: "View all matching orders and their detailed metrics here.", blockTargetInteraction: true },
        { target: "#orders-first-target-0", icon: Sidebar, title: "Order Details", content: "Click on any Order ID to view a detailed summary including items, fulfillment, and financial breakdown.", requireClick: true },
        { target: "#orders-drawer", icon: Sidebar, title: "Order Details Modal", content: "This modal provides an in-depth look at the selected order's proceeds and items.", blockTargetInteraction: true },
        { target: "#orders-drawer .btn-close", icon: XCircle, title: "Close Details", content: "Click here to close the order details when you're done.", requireClick: true }
    ]
};

tourRegistry.register(ordersTourConfig);
