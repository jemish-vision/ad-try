import { tourRegistry } from '../TourRegistry';
import { Sparkle, Gauge, ChartBar, ChartPieSlice, ClockCounterClockwise, Receipt, Funnel } from '@phosphor-icons/react';

export const aiCreditsTourConfig = {
    id: "ai-credits",
    title: "AI Credits Tour",
    steps: [
        { target: "#ai-credits-meter", icon: Sparkle, title: "Available Credits", content: "Credits your organization can still use this month. Everyone in the organization shares them; the bar shows how much is used.", blockTargetInteraction: true },
        { target: "#ai-credits-kpis", icon: Gauge, title: "This Month", content: "Credits used, your monthly allowance and where it comes from, the next reset date, and the tokens AI read and wrote.", blockTargetInteraction: true },
        { target: "#ai-credits-daily", icon: ChartBar, title: "Daily Usage", content: "Credits used each day this month. Hover a bar for the exact credits and number of requests.", blockTargetInteraction: true },
        { target: "#ai-credits-by-feature", icon: ChartPieSlice, title: "By Feature", content: "How the credits split between the AI features.", blockTargetInteraction: true },
        { target: "#ai-credits-tab-requests", icon: ClockCounterClockwise, title: "AI Requests", content: "Every AI request: who ran it, the AI model, input and output tokens and the credits it cost. Failed requests are not charged.", blockTargetInteraction: true },
        { target: "#ai-credits-tab-transactions", icon: Receipt, title: "Credit History", content: "Click to see monthly allowances, usage, month closes and adjustments made by an administrator.", requireClick: true },
        { target: "#ai-credits-type-filter", icon: Funnel, title: "Filter History", content: "Show only one kind of entry, for example only adjustments.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(aiCreditsTourConfig);
