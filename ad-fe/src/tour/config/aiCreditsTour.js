import { tourRegistry } from '../TourRegistry';
import { Sparkle, Gauge, ChartBar, ChartPieSlice, ClockCounterClockwise, Receipt, Funnel, ShoppingCart, SlidersHorizontal, CalendarBlank } from '@phosphor-icons/react';

export const aiCreditsTourConfig = {
    id: "ai-credits",
    title: "AI Credits Tour",
    steps: [
        { target: "#ai-credits-meter", icon: Sparkle, title: "Available Credits", content: "Credits your organization can still use: this month's allowance plus any purchased credits. Everyone in the organization shares them; the bar shows how much of the monthly credits is used.", blockTargetInteraction: true },
        { target: "#ai-credits-buy", icon: ShoppingCart, title: "Buy More Credits", content: "Need more AI? The organization owner can buy a credit package here and pay securely on Stripe. Purchased credits never expire and are used after the monthly credits.", blockTargetInteraction: true },
        { target: "#ai-credits-custom", icon: SlidersHorizontal, title: "Custom Amount", content: "Need a number of credits no package offers? The organization owner can enter any amount within the limits shown and see the total before paying on Stripe.", blockTargetInteraction: true },
        { target: "#ai-credits-kpis", icon: Gauge, title: "This Month", content: "Credits used, your monthly allowance and where it comes from, the next reset date, and the tokens AI read and wrote.", blockTargetInteraction: true },
        { target: "#ai-credits-daily", icon: ChartBar, title: "Daily Usage", content: "Credits used each day this month. Hover a bar for the exact credits and number of requests.", blockTargetInteraction: true },
        { target: "#ai-credits-by-feature", icon: ChartPieSlice, title: "By Feature", content: "How the credits split between the AI features.", blockTargetInteraction: true },
        { target: "#ai-credits-tab-requests", icon: ClockCounterClockwise, title: "AI Requests", content: "Every AI request: who ran it, the AI model, input and output tokens and the credits it cost. Failed requests are not charged.", blockTargetInteraction: true },
        { target: "#ai-credits-usage-view", icon: CalendarBlank, title: "Each Request or Daily Totals", content: "Each request is listed on its own for the number of days Super Admin keeps them; older requests are combined into daily totals per user and AI model. Switch here to see them.", blockTargetInteraction: true },
        { target: "#ai-credits-tab-transactions", icon: Receipt, title: "Credit History", content: "Click to see monthly allowances, usage, month closes and adjustments made by an administrator.", requireClick: true },
        { target: "#ai-credits-type-filter", icon: Funnel, title: "Filter History", content: "Show only one kind of entry, for example only adjustments.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(aiCreditsTourConfig);
