import { tourRegistry } from '../TourRegistry';
import {
    Funnel, MagnifyingGlass, PlusCircle, Sidebar, X, UploadSimple
} from '@phosphor-icons/react';

export const productListTourConfig = {
    id: "product-list",
    title: "Product List Tour",
    steps: [
        { target: "#product-list-filters", icon: Funnel, title: "Global Filters", content: "Filter your catalog based on specific profiles and accounts.", blockTargetInteraction: true },
        { target: "#product-list-favorites", icon: Funnel, title: "Favorites", content: "Toggle to view only your favorite products.", blockTargetInteraction: true },
        { target: "#product-list-search", icon: MagnifyingGlass, title: "Search Products", content: "Quickly locate specific products using their ASIN, SKU, or Title.", blockTargetInteraction: true },
        { target: "#product-list-bulk-price-upload", icon: UploadSimple, title: "Bulk Price Update", content: "Upload an Excel or CSV file to update multiple product prices and limits in bulk.", blockTargetInteraction: true },
        { target: "#product-list-add-product", icon: PlusCircle, title: "Add Product", content: "Create and add new product listings directly to your catalog.", blockTargetInteraction: true },
        { target: "#product-list-first-target-0", icon: Sidebar, title: "Product Details", content: "Click on any product to open the side drawer and view in-depth details, pricing, and performance.", childTourId: "product-list-drawer-tour" },
        { target: "#product-list-optimize-ai-0", icon: Funnel, title: "Optimize with AI", content: "Automatically optimize your product listings with AI.", blockTargetInteraction: true },
        { target: "#product-list-view-competitors-0", icon: Funnel, title: "View Competitors", content: "Open the Competitor Analysis Modal to see how your product stacks up.", blockTargetInteraction: true },
    ]
};

export const productListDrawerTourConfig = {
    id: "product-list-drawer-tour",
    title: "Product Drawer Tour",
    steps: [
        { target: "#product-list-drawer", icon: Sidebar, title: "Product Drawer", content: "Review all settings, inventory levels, and historical data for this product.", placement: "left", blockTargetInteraction: true },
        { target: "#product-list-drawer-close", icon: X, title: "Close Drawer", content: "Click here to close the drawer and return to the main product list.", requireClick: true }
    ]
};

tourRegistry.register(productListTourConfig);
tourRegistry.register(productListDrawerTourConfig);
