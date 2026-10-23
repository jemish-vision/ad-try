import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, CalendarBlank, Table, Lightning, Target
} from '@phosphor-icons/react';

export const historyTourConfig = {
    id: "history",
    title: "History Tour",
    steps: [
        { 
            target: "#history-type", 
            icon: Funnel, 
            title: "Filter by Type", 
            content: "Filter the history logs to see specific types of changes like Budgets or Bids.",
            blockTargetInteraction: true 
        },
        { 
            target: "#history-source", 
            icon: Lightning, 
            title: "Triggered From", 
            content: "Filter history logs based on who or what made the change (Manual user action, Automation Rule, or Amazon API sync).",
            blockTargetInteraction: true 
        },
        { 
            target: "#history-search", 
            icon: MagnifyingGlass, 
            title: "Search History", 
            content: "Search for specific changes, campaigns, or keywords in your history.",
            blockTargetInteraction: true 
        },
        { 
            target: "#history-targeting", 
            icon: Target, 
            title: "Search by Targeting", 
            content: "Filter history logs by specific keyword or targeting expressions.",
            blockTargetInteraction: true 
        },
        { 
            target: "#history-date-picker", 
            icon: CalendarBlank, 
            title: "Date Range", 
            content: "Select a custom date range to review historical modifications.",
            blockTargetInteraction: true 
        },
        { 
            target: "#history-main-table", 
            icon: Table, 
            title: "History Grid", 
            content: "View the complete list of changes, including previous values, new values, and the user who made the change.",
            blockTargetInteraction: true 
        }
    ]
};

tourRegistry.register(historyTourConfig);

