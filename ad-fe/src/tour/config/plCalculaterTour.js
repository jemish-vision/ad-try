import { tourRegistry } from '../TourRegistry';
import {
    Calculator, Receipt, CurrencyDollar, TrendUp, ClockCounterClockwise, ArrowRight, X
} from '@phosphor-icons/react';

export const plCalculaterTourConfig = {
    id: "pl-calculater",
    title: "Amazon Profit Calculator Tour",
    steps: [
        { target: "#pl-input-parameters", icon: Receipt, title: "Input Parameters", content: "Enter your product's selling price, landed costs, category, and fulfillment settings here.", blockTargetInteraction: true },
        { target: "#pl-top-metrics", icon: CurrencyDollar, title: "Key Metrics", content: "Instantly view your estimated settlement amount, net profit per unit, margin percentage, and ROI based on your inputs.", blockTargetInteraction: true },
        { target: "#pl-cost-breakdown-table", icon: Calculator, title: "Cost Breakdown Table", content: "View a detailed tabular breakdown of every single cost component, from product cost and Amazon fees to marketing and returns.", blockTargetInteraction: true },
        { target: "#pl-breakdown-chart", icon: Calculator, title: "Visual Cost Breakdown", content: "See exactly where every rupee of your selling price goes in this visual chart.", blockTargetInteraction: true },
        { target: "#pl-benchmark", icon: TrendUp, title: "Category Benchmark", content: "Compare your net margin against the median margin for your product's category to ensure you remain competitive.", blockTargetInteraction: true },
    ]
};

export const plCalculaterDrawerTourConfig = {
    id: "pl-calculater-drawer-tour",
    title: "P&L History Tour",
    steps: [
        { target: "#pl-history-drawer", icon: ArrowRight, title: "Your History", content: "View all your past profit calculations, compare results, and clear your history if needed.", blockTargetInteraction: true }
    ]
};

export const breakevenCalculaterTourConfig = {
    id: "breakeven-calculater",
    title: "Break Even Calculator Tour",
    steps: [
        { target: "#be-revenue-details", icon: Receipt, title: "Revenue", content: "Enter your product's selling price here.", blockTargetInteraction: true },
        { target: "#be-cost-details", icon: CurrencyDollar, title: "Non-Advertising Costs", content: "Input your product costs, Amazon fees, and shipping costs to calculate your remaining margin.", blockTargetInteraction: true },
        { target: "#be-action-buttons", icon: Calculator, title: "Calculate", content: "Click here to instantly calculate your Break Even ACOS.", blockTargetInteraction: true },
        { target: "#be-output-card", icon: TrendUp, title: "Break Even Target", content: "Your Break Even ACOS target and remaining margin will be displayed here.", blockTargetInteraction: true },
    ]
};

tourRegistry.register(plCalculaterTourConfig);
tourRegistry.register(plCalculaterDrawerTourConfig);
tourRegistry.register(breakevenCalculaterTourConfig);
