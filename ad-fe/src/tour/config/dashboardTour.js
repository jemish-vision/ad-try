import { tourRegistry } from '../TourRegistry';
import {
    Funnel, TrendUp, ChartLineUp, Megaphone,
    ChartBar, Clock, Lightbulb, TrendDown,
    WarningCircle, WarningOctagon, GridFour, Trophy, SlidersHorizontal, Table
} from '@phosphor-icons/react';

export const dashboardTourConfig = {
    id: "dashboard",
    title: "Dashboard Tour",
    steps: [
        { 
            target: "#dashboard-top-filters", 
            icon: Funnel, 
            title: "Filter Selection", 
            content: "Use filters and the date picker to quickly isolate specific campaigns and timeframes for your analysis.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-top-cards", 
            icon: TrendUp, 
            title: "Top Cards", 
            content: "Get an immediate snapshot of your core KPIs like spend, sales, and ACOS to check your overall account health.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-chart", 
            icon: ChartLineUp, 
            title: "Interactive Chart", 
            content: "Analyze performance trends over time. Compare multiple metrics side-by-side to uncover hidden patterns.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-campaign-breakdowns", 
            icon: Megaphone, 
            title: "Campaign Allocation", 
            content: "Track performance across assigned and unassigned campaigns to ensure every advertising initiative is properly managed.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-ad-type-breakdown", 
            icon: ChartBar, 
            title: "Ad Type Performance", 
            content: "Compare performance metrics across Sponsored Products, Sponsored Brands, and Sponsored Display formats.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-time-recommendations", 
            icon: Clock, 
            title: "Time Analytics & Recommendations", 
            content: "Identify high-converting days of the week, peak shopping hours, and algorithmic optimization opportunities.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-waste-matrix-section", 
            icon: Lightbulb, 
            title: "Waste Spend & Smart Insights", 
            content: "Monitor spend wasted on non-converting search terms and review AI-powered recommendations tailored to your account.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-ad-blackout", 
            icon: WarningOctagon, 
            title: "Hourly Ad Blackouts", 
            content: "Alerts when active SP, SB, or SD ads suddenly drop to zero impressions within the hour, with plain-language causes from Amazon serving status, Buy Box, listing, and rule data.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-performance-decline", 
            icon: TrendDown, 
            title: "Performance Decline & Root Cause Triage", 
            content: "Detect campaigns with sudden drops in sales or spikes in ACoS, estimate revenue loss, and view diagnosed root causes with actionable fixes.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-out-of-stock-ads", 
            icon: WarningCircle, 
            title: "Out-of-Stock Running Ads", 
            content: "Identify campaigns actively spending advertising budget on products that are currently out of stock so you can avoid wasted spend.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dash-matrix-section", 
            icon: GridFour, 
            title: "Performance Matrix", 
            content: "Evaluate how products stack up across multiple dimensions. Instantly categorize items into strategic quadrants.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-top-products", 
            icon: Trophy, 
            title: "Top Products", 
            content: "Analyze the performance of your best-selling and highest-spending products to ensure they are fully optimized.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-top-products-customize", 
            icon: SlidersHorizontal, 
            title: "Customize Columns", 
            content: "Tailor the data grid to your needs by choosing exactly which metric columns you want to view or hide.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-product-grid", 
            icon: Table, 
            title: "Data Grid", 
            content: "Browse your complete campaign and product data in a customizable grid for your own deep-dive analysis.",
            blockTargetInteraction: true 
        }
    ]
};

tourRegistry.register(dashboardTourConfig);
