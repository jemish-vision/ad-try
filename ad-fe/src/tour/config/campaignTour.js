import { tourRegistry } from '../TourRegistry';
import {
    Funnel, CurrencyDollar, ArrowsClockwise,
    TrendUp, Bell, Gear, ChartLineUp, Table,
    MagnifyingGlass, Clock, SlidersHorizontal, PlusCircle, Faders, Cards, CalendarBlank
} from '@phosphor-icons/react';

export const campaignTourConfig = {
    id: "campaign",
    title: "Campaign Tour",
    steps: [
        { target: "#campaign-filters", icon: Funnel, title: "Global Filters", content: "Filter your campaigns by date, status, portfolio, and targeting type.", blockTargetInteraction: true },
        { target: "#campaign-filter-by", icon: Funnel, title: "Filter By", content: "Filter campaigns by state, portfolio, or apply your saved filter presets.", blockTargetInteraction: true },
        { target: "#campaign-date-picker", icon: CalendarBlank, title: "Date Range", content: "Select a custom date range or preset period for your campaign performance data.", blockTargetInteraction: true },
        { target: "#profit-filter-dropdown", icon: CurrencyDollar, title: "Profit Filters", content: "Filter campaigns based on specific profitability metrics.", blockTargetInteraction: true },
        { target: "#campaign-applied-filter", icon: Faders, title: "Applied Filters", content: "View and save your currently applied active filters.", blockTargetInteraction: true },
        { target: "#refresh-button", icon: ArrowsClockwise, title: "Refresh", content: "Reload the grid with the latest campaign data.", blockTargetInteraction: true },
        { target: "#ads-trends-button", icon: TrendUp, title: "Ads Trends", content: "Analyze overall ad trends and historical performance.", blockTargetInteraction: true },
        { target: "#notification-setting-button", icon: Bell, title: "Notifications", content: "Configure custom alert settings for your campaigns.", blockTargetInteraction: true },
        { target: "#setting-button", icon: Gear, title: "Settings", content: "Manage global campaign configurations and preferences.", blockTargetInteraction: true },
        { target: "#campaignTop", icon: Cards, title: "Top Metrics", content: "Review your aggregate KPI metrics at a glance.", blockTargetInteraction: true },
        { target: "#chart", icon: ChartLineUp, title: "Performance Chart", content: "Visualize campaign performance metrics over time.", blockTargetInteraction: true },
        { target: "#campaign-data", icon: Table, title: "Campaign Data", content: "View detailed statistics for all your active campaigns.", blockTargetInteraction: true },
        { target: "#campaign-search-option", icon: MagnifyingGlass, title: "Search", content: "Quickly search for specific campaigns by name.", blockTargetInteraction: true },
        { target: "#campaign-hourly-data", icon: Clock, title: "Hourly Data", content: "Track campaign performance on an hourly basis. Click here to explore the detailed hourly model.", childTourId: "hourly-tracking" },
        { target: "#campaign-customize-columns", icon: SlidersHorizontal, title: "Customize Columns", content: "Tailor the grid by showing or hiding specific metric columns.", blockTargetInteraction: true },
        { target: "#campaign-add", icon: PlusCircle, title: "Add Campaign", content: "Create and launch a brand new advertising campaign.", blockTargetInteraction: true },
        { target: "#campaign-main-table", icon: Table, title: "Main Data Grid", content: "Sort, filter, and interact with your campaign data.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(campaignTourConfig);
