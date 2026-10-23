import { tourRegistry } from '../TourRegistry';
import {
    Target, Calendar, Cards,
    ChartLineUp, Lightning, MagnifyingGlass,
    Table, ClockCounterClockwise
} from '@phosphor-icons/react';

export const targetingDetailTourConfig = {
    id: "targeting-detail",
    title: "Targeting Detail Tour",
    steps: [
        {
            target: "#targeting-detail-hero",
            icon: Target,
            title: "Target Overview",
            content: "Review key properties for this specific target, including match type, campaign association, status, and current bid.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-detail-date-picker",
            icon: Calendar,
            title: "Date Range Selector",
            content: "Filter performance metrics and history audit logs across customized date windows.",
            blockTargetInteraction: true
        },
        {
            target: "#campaignTop",
            icon: Cards,
            title: "Target KPIs",
            content: "Monitor scoped KPI cards (Spend, Sales, Orders, ACOS, ROAS, Impressions, Clicks) reflecting only this target's performance.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-detail-chart",
            icon: ChartLineUp,
            title: "Performance Trends",
            content: "Visualize interactive metric trends over time specifically for this targeting keyword.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-detail-source-filter",
            icon: Lightning,
            title: "Filter by Change Source",
            content: "Quickly filter audit records by origin: Manual edits, Automation Rules, Dayparting schedules, or Amazon Stream syncs.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-detail-search",
            icon: MagnifyingGlass,
            title: "Search Audit Logs",
            content: "Search through change history records by user, rule name, or action description.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-detail-export",
            icon: Table,
            title: "Export History",
            content: "Download the complete change history audit trail as an Excel spreadsheet.",
            blockTargetInteraction: true
        },
        {
            target: "#targeting-detail-history-grid",
            icon: ClockCounterClockwise,
            title: "Change History Audit Trail",
            content: "Inspect granular logs of all bid adjustments and actions, comparing previous values, new values, deltas, timestamps, and execution sources.",
            blockTargetInteraction: true
        }
    ]
};

tourRegistry.register(targetingDetailTourConfig);
