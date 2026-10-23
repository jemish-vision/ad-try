import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, Calendar, Table, CheckCircle
} from '@phosphor-icons/react';

export const keywordAnalysisTourConfig = {
    id: "keyword-analysis",
    title: "Keyword Analysis Tour",
    steps: [
        { target: "#keyword-analysis-filters", icon: Funnel, title: "Filters", content: "Filter keyword data by various metrics and conditions.", blockTargetInteraction: true },
        { target: "#keyword-analysis-search", icon: MagnifyingGlass, title: "Search", content: "Search for specific keywords or targeting.", blockTargetInteraction: true },
        { target: "#keyword-analysis-status", icon: CheckCircle, title: "Campaign Status", content: "Filter your analysis based on active, paused, or archived campaigns.", blockTargetInteraction: true },
        { target: "#keyword-analysis-date-picker", icon: Calendar, title: "Date Range", content: "Select a date range for your keyword analysis.", blockTargetInteraction: true },
        { target: "#keyword-analysis-main-table", icon: Table, title: "Analysis Grid", content: "View, sort, and analyze your detailed keyword data here. You can select individual campaigns per row to filter metrics.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(keywordAnalysisTourConfig);
