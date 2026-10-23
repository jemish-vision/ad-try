import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, CalendarBlank, ArrowsClockwise,
    ChartLineUp, Table, CurrencyDollar, TrendUp, Tag, Folder
} from '@phosphor-icons/react';

export const profitAnalysisTourConfig = {
    id: "profit-analysis",
    title: "Profit Analysis Tour",
    steps: [
        {
            target: "#profit-filters",
            icon: Funnel,
            title: "Global Filters",
            content: "Filter and slice your profit data by SKU, product category, and custom date range.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-search",
            icon: MagnifyingGlass,
            title: "Search Products",
            content: "Quickly search for specific products by title or ASIN.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-category",
            icon: Folder,
            title: "Category Filter",
            content: "Select one or more product categories to narrow your profitability analysis.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-date-picker",
            icon: CalendarBlank,
            title: "Date Range Picker",
            content: "Select preset or custom date ranges to analyze historical profitability.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-refresh-button",
            icon: ArrowsClockwise,
            title: "Refresh Data",
            content: "Fetch the latest real-time profit and loss metrics.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-sales-summary",
            icon: TrendUp,
            title: "Sales Summary",
            content: "Review total sales revenue, order volumes, and average order values.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-summary-card",
            icon: CurrencyDollar,
            title: "Net Profit Summary",
            content: "Track your actual bottom-line net profit, profit margins, and ROAS.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-chart",
            icon: ChartLineUp,
            title: "Performance Trends",
            content: "Visualize interactive breakdown trends across sales, profit, and ad spend over time.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-tabs",
            icon: Tag,
            title: "Analysis Views",
            content: "Toggle between monthly aggregate breakdowns and detailed SKU-level product profitability.",
            blockTargetInteraction: true
        },
        {
            target: "#profit-main-grid",
            icon: Table,
            title: "Profit & Loss Ledger",
            content: "Deep dive into itemized revenue, Amazon fees, COGS, shipping costs, and margins.",
            blockTargetInteraction: true
        }
    ]
};

tourRegistry.register(profitAnalysisTourConfig);
