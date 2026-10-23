import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, Calendar, Table, CheckCircle
} from '@phosphor-icons/react';

export const productAdsTourConfig = {
    id: "product-ads",
    title: "Product Ads Tour",
    steps: [
        { target: "#product-ads-top-cards", icon: Table, title: "Performance Overview", content: "Quickly view your top 10 products broken down by Orders, Sales, and Conversion Rate.", blockTargetInteraction: true },
        { target: "#product-ads-filters", icon: Funnel, title: "Global Filters", content: "Filter your product ads based on specific profiles and accounts.", blockTargetInteraction: true },
        { target: "#product-ads-search", icon: MagnifyingGlass, title: "Search Product Ads", content: "Search for specific product ads using their title, ASIN, or SKU.", blockTargetInteraction: true },
        { target: "#product-ads-status", icon: CheckCircle, title: "Ad Status", content: "Filter your product ads based on their advertising status.", blockTargetInteraction: true },
        { target: "#product-ads-date-picker", icon: Calendar, title: "Date Range", content: "Adjust the timeframe to view historical ad performance.", blockTargetInteraction: true },
        { target: "#product-ads-customize-columns", icon: Table, title: "Customize Columns", content: "Personalize your grid view by toggling specific performance columns.", blockTargetInteraction: true },
        { target: "#product-main-table", icon: Table, title: "Product Ads Grid", content: "View all your product ads and track their key performance metrics here.", blockTargetInteraction: true },
    ]
};

tourRegistry.register(productAdsTourConfig);
