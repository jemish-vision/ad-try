import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Funnel, Table
} from '@phosphor-icons/react';

export const supportTicketTourConfig = {
    id: "support-ticket",
    title: "Support Tickets Tour",
    steps: [
        { target: "#support-ticket-search", icon: MagnifyingGlass, title: "Search Tickets", content: "Easily search for specific support tickets by user name or email.", blockTargetInteraction: true },
        { target: "#support-ticket-status", icon: Funnel, title: "Filter by Status", content: "Filter the tickets to see only Open, Pending, or Closed support requests.", blockTargetInteraction: true },
        { target: "#supportTicket-main-table", icon: Table, title: "Tickets Grid", content: "View all your support tickets here. You can view the full details or close an active ticket.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(supportTicketTourConfig);
