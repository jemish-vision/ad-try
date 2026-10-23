import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Calendar, Table, CheckCircle, Sidebar, X, Funnel, ChartBar
} from '@phosphor-icons/react';

export const couponsTourConfig = {
    id: "coupons",
    title: "Coupons Tour",
    steps: [
        { target: "#coupons-search", icon: MagnifyingGlass, title: "Search Coupons", content: "Search for specific coupons using their name or keywords.", blockTargetInteraction: true },
        { target: "#coupons-date-picker", icon: Calendar, title: "Date Range", content: "Adjust the timeframe to view coupon performance over specific dates.", blockTargetInteraction: true },
        { target: "#coupons-status", icon: CheckCircle, title: "Status Filter", content: "Filter coupons based on their current status like Running, Expired, etc.", blockTargetInteraction: true },
        { target: "#coupons-performance", icon: Funnel, title: "Performance Filter", content: "Filter coupons by performance tags (e.g., Profitable, Loss Making).", blockTargetInteraction: true },
        { target: "#coupons-main-table", icon: Table, title: "Coupons Grid", content: "View and manage your coupons, including their budget, redemptions, and overall performance.", blockTargetInteraction: true },
        { target: "#coupons-first-target-0", icon: Sidebar, title: "Coupon Details", content: "Click on any coupon name to view its detailed metrics and associated products.", childTourId: "coupons-modal-tour" }
    ]
};

export const couponsModalTourConfig = {
    id: "coupons-modal-tour",
    title: "Coupon Details Tour",
    steps: [
        { target: "#coupons-modal", icon: Sidebar, title: "Coupon Modal", content: "This modal displays all the information, budget, and performance metrics for the selected coupon.", blockTargetInteraction: true },
        { target: "#coupons-modal-budget-activity", icon: Table, title: "Budget & Activity", content: "Check how much of your budget has been spent and how many times the coupon was redeemed.", blockTargetInteraction: true },
        { target: "#coupons-modal-performance", icon: ChartBar, title: "Performance Metrics", content: "Review revenue, profit, ROI, and margin to gauge the success of the coupon.", blockTargetInteraction: true },
        { target: "#coupons-modal-products", icon: Table, title: "Included Products", content: "Scroll through all the products that are eligible for this coupon.", blockTargetInteraction: true },
        { target: "#coupons-modal-close", icon: X, title: "Close Details", content: "Close the modal to return to the main coupons list.", requireClick: true }
    ]
};

tourRegistry.register(couponsTourConfig);
tourRegistry.register(couponsModalTourConfig);
