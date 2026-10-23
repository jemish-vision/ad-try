import { tourRegistry } from '../TourRegistry';
import {
    ChartBar, Funnel, CalendarBlank, Table, MagnifyingGlass, Package, Eye, XCircle
} from '@phosphor-icons/react';

export const brandAnalysisTourConfig = {
    id: "brand-analysis",
    title: "Brand Analysis Tour",
    steps: [
        { 
            target: "#brand-analysis-asin", 
            icon: Package, 
            title: "Product Filter", 
            content: "Select specific products to filter the brand analytics data.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-search-query", 
            icon: MagnifyingGlass, 
            title: "Search Query Filter", 
            content: "Filter the analytics by specific customer search queries.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-period", 
            icon: CalendarBlank, 
            title: "Report Period", 
            content: "Adjust the reporting period (e.g. Month or Year) for your analysis.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-year", 
            icon: CalendarBlank, 
            title: "Year Filter", 
            content: "Select the year for the brand analytics data.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-month", 
            icon: CalendarBlank, 
            title: "Month Filter", 
            content: "Select a specific month to analyze.",
            blockTargetInteraction: true 
        },
        {
            target: "#brand-analysis-applied-filters",
            icon: Funnel,
            title: "Applied Filters",
            content: "View and quickly clear any currently active filters.",
            blockTargetInteraction: true
        },
        { 
            target: "#brand-analysis-funnel", 
            icon: ChartBar, 
            title: "Funnel Analysis", 
            content: "Visualize your brand's market share at each stage of the funnel, from Impressions down to Purchases.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-main-table", 
            icon: Table, 
            title: "Performance Grid", 
            content: "Review detailed metrics for each search query, including CTR and Conversion Rates.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-products-first-btn", 
            icon: Eye, 
            title: "View Products", 
            content: "Click this button to view the specific products contributing to this search query's performance.",
            requireClick: true 
        },
        { 
            target: "#brand-analysis-product-drawer", 
            icon: Package, 
            title: "Product Breakdown", 
            content: "This drawer displays the individual products and their specific contribution to the selected search query.",
            blockTargetInteraction: true 
        },
        { 
            target: "#brand-analysis-drawer-close", 
            icon: XCircle, 
            title: "Close Drawer", 
            content: "Click here to close the product breakdown drawer and finish the tour.",
            requireClick: true 
        }
    ]
};

tourRegistry.register(brandAnalysisTourConfig);
