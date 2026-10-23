import { tourRegistry } from '../TourRegistry';
import {
    Package, ShoppingCart, Megaphone, Storefront,
    Receipt, Tag, Percent, ClipboardText, BoxArrowDown, ArrowUUpLeft
} from '@phosphor-icons/react';

export const operationsTourConfig = {
    id: "operations",
    title: "Operations Tour",
    steps: [
        { target: "#nav-orders-parent", icon: ShoppingCart, title: "Orders Menu", content: "Expand to access your order management and reports.", blockTargetInteraction: true },
        { target: "#nav-orders", icon: ShoppingCart, title: "Orders", content: "Track and manage your customer orders.", childTourId: "orders" },
        { target: "#nav-order-report", icon: Receipt, title: "Order Report", content: "Analyze detailed reports of your orders.", childTourId: "order-report" },

        { target: "#nav-product-list-parent", icon: Package, title: "Product List Menu", content: "Expand to access product management.", blockTargetInteraction: true },
        { target: "#nav-product-list", icon: Package, title: "Product List", content: "View and optimize your product listings.", childTourId: "product-list" },
        { target: "#nav-product-ads", icon: Tag, title: "Product Ads", content: "Manage and track your advertised products.", childTourId: "product-ads" },

        { target: "#nav-promotions-parent", icon: Megaphone, title: "Promotions Menu", content: "Expand to manage your marketing promotions.", blockTargetInteraction: true },
        { target: "#nav-coupons", icon: Percent, title: "Coupons", content: "Create and manage your discount coupons.", childTourId: "coupons" },
        { target: "#nav-deals", icon: Tag, title: "Deals", content: "Track the performance of your deals.", childTourId: "deals-dashboard" },

        { target: "#nav-inventory-parent", icon: Storefront, title: "Inventory Menu", content: "Expand to access inventory tools.", blockTargetInteraction: true },
        { target: "#nav-inventory", icon: ClipboardText, title: "Inventory", content: "Monitor your stock levels.", childTourId: "inventory" },
        { target: "#nav-fba-planning", icon: BoxArrowDown, title: "FBA Planning", content: "Plan your FBA shipments.", childTourId: "fba-planning" },
        { target: "#nav-reconciliation-reimbursement", icon: Receipt, title: "Reconciliation", content: "Manage your reimbursements.", childTourId: "reconciliation" },
        { target: "#nav-returns-refunds", icon: ArrowUUpLeft, title: "Returns & Refunds", content: "Track customer returns and refunds.", childTourId: "returns" }
    ]
};

tourRegistry.register(operationsTourConfig);
