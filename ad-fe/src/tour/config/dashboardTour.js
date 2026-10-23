import { tourRegistry } from '../TourRegistry';
import {
    Funnel, TrendUp, ChartLineUp, Megaphone,
    Package, MagnifyingGlass, GridFour, Trophy,
    Table, Lightbulb, SlidersHorizontal
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
            target: "#dashboard-changes-by-campaign", 
            icon: Megaphone, 
            title: "Campaign Momentum", 
            content: "Instantly identify campaigns with the most significant positive or negative performance changes.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-changes-by-asin", 
            icon: Package, 
            title: "Product Fluctuations", 
            content: "Monitor product-level fluctuations to see which items are driving changes in your overall performance.",
            blockTargetInteraction: true 
        },
        { 
            target: "#dashboard-changes-by-keyword", 
            icon: MagnifyingGlass, 
            title: "Keyword Volatility", 
            content: "Track your most volatile keywords to understand which search terms are impacting your spend and sales.",
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
        },
        { 
            target: "#dashboard-smart-insights", 
            icon: Lightbulb, 
            title: "Smart Insights", 
            content: "Leverage our AI to receive proactive recommendations and actionable insights tailored to your account.",
            blockTargetInteraction: true 
        }
    ]
};

tourRegistry.register(dashboardTourConfig);
