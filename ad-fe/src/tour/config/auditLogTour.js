import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Funnel, CalendarBlank, Table, Eye, Info, XCircle
} from '@phosphor-icons/react';

export const auditLogTourConfig = {
    id: "audit-log",
    title: "Audit Log Tour",
    steps: [
        { target: "#audit-log-search", icon: MagnifyingGlass, title: "Search Audit Logs", content: "Search for specific events or actions.", blockTargetInteraction: true },
        { target: "#audit-log-type", icon: Funnel, title: "Filter by Event Type", content: "Filter logs by specific categories like Security, Campaigns, or Settings.", blockTargetInteraction: true },
        { target: "#audit-log-date-picker", icon: CalendarBlank, title: "Date Range", content: "Select a date range to filter the audit log history.", blockTargetInteraction: true },
        { target: "#audit-log-main-table", icon: Table, title: "Audit Log Grid", content: "View all tracked events, user actions, and their timestamps.", blockTargetInteraction: true },
        { 
            target: ".audit-log-view-btn", 
            icon: Eye, 
            title: "View Details", 
            content: "Click this button to view the full metadata and details for a specific event.", 
            requireClick: true 
        },
        { 
            target: "#audit-log-modal-body", 
            icon: Info, 
            title: "Event Details Modal", 
            content: "This modal displays comprehensive information, including IP address, user agent, and specific event metadata.",
            blockTargetInteraction: true 
        },
        { 
            target: "#audit-log-close-btn", 
            icon: XCircle, 
            title: "Close Modal", 
            content: "Click here to close the details modal and finish this tour.", 
            requireClick: true 
        }
    ]
};

tourRegistry.register(auditLogTourConfig);
