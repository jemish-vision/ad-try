import { tourRegistry } from '../TourRegistry';
import {
    TrendUp, ChartBar, Funnel, MagnifyingGlass, Table
} from '@phosphor-icons/react';

export const adminDashboardTourConfig = {
    id: "admin-dashboard",
    title: "Owner Dashboard Tour",
    steps: [
        { 
            target: "#od-hero", 
            icon: TrendUp, 
            title: "Dashboard Overview", 
            content: "Welcome to the Super Admin Dashboard Overview! Here you can manage subscriptions, monitor total revenue, and track platform growth.",
            blockTargetInteraction: true 
        },
        { 
            target: "#od-stats-grid", 
            icon: ChartBar, 
            title: "Summary KPI Cards", 
            content: "Get instant visibility into your core metrics: Total Revenue, Active Subscriptions, Cancelled plans, and All-Time Total Subscriptions.",
            blockTargetInteraction: true 
        },
        { 
            target: "#od-status-tabs", 
            icon: Funnel, 
            title: "Status Filter Tabs", 
            content: "Quickly filter the subscription history table by status: Active, Canceled, Expired, or All.",
            blockTargetInteraction: true 
        },
        { 
            target: "#od-search", 
            icon: MagnifyingGlass, 
            title: "Search Subscriptions", 
            content: "Search across customer names, emails, and plan types to locate specific subscription records in seconds.",
            blockTargetInteraction: true 
        },
        { 
            target: "#ownerDashboard-main-table", 
            icon: Table, 
            title: "Subscription History Grid", 
            content: "Review detailed customer subscription data, amounts, start/end dates, and Stripe Subscription IDs in this customizable data grid.",
            blockTargetInteraction: true 
        }
    ]
};

tourRegistry.register(adminDashboardTourConfig);
