import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, CheckCircle, Table, Funnel
} from '@phosphor-icons/react';

export const cronJobSchedularTourConfig = {
    id: "cron-schedular",
    title: "Cron Job Scheduler Tour",
    steps: [
        { target: "#cron-history-btn", icon: Table, title: "Cron Job History", content: "Click here to view the execution history of your scheduled jobs.", childTourId: "cron-history" },
        { target: "#cron-search", icon: MagnifyingGlass, title: "Search Cron Jobs", content: "Search for specific cron jobs by name.", blockTargetInteraction: true },
        { target: "#cron-type-filter", icon: Funnel, title: "Type Filter", content: "Filter cron jobs by their specific type or function.", blockTargetInteraction: true },
        { target: "#cron-status-filter", icon: CheckCircle, title: "Status Filter", content: "Filter cron jobs by active or inactive status.", blockTargetInteraction: true },
        { target: "#cronJob-main-table", icon: Table, title: "Cron Job Grid", content: "View all scheduled jobs, their frequency, and their next run time.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(cronJobSchedularTourConfig);
