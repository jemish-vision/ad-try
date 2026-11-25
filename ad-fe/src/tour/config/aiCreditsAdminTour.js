import { tourRegistry } from '../TourRegistry';
import { Sparkle, ChartLine, Buildings, MagnifyingGlass, ListBullets, GearSix, ToggleLeft, Cpu, Calculator, FloppyDisk } from '@phosphor-icons/react';

export const aiCreditsAdminTourConfig = {
    id: "ai-credits-admin",
    title: "AI Credit Management Tour",
    steps: [
        { target: "#ai-credits-admin-tabs", icon: Sparkle, title: "AI Credit Management", content: "Overview, organization wallets, the usage log and settings for AI credits.", blockTargetInteraction: true },
        { target: "#ai-credit-admin-overview", icon: ChartLine, title: "Overview", content: "Credits and tokens used this month across all organizations, by feature and by AI model, and the organizations using the most.", blockTargetInteraction: true },
        { target: "#ai-credits-admin-tab-organizations", icon: Buildings, title: "Organizations", content: "Click to see every organization's wallet.", requireClick: true },
        { target: "#ai-credit-org-search", icon: MagnifyingGlass, title: "Find an Organization", content: "Search by name. Use the buttons on each row to view its usage, add or remove credits, or give it its own monthly allowance.", blockTargetInteraction: true },
        { target: "#ai-credits-admin-tab-usage", icon: ListBullets, title: "Usage Log", content: "Click to see every AI request with its organization, user, model, tokens and cost.", requireClick: true },
        { target: "#ai-credits-admin-tab-settings", icon: GearSix, title: "Settings", content: "Click to set how tokens convert to credits.", requireClick: true },
        { target: "#ai-credit-enforcement", icon: ToggleLeft, title: "Enforce Credit Limits", content: "Turn off to let AI run without taking credits (usage is still recorded).", blockTargetInteraction: true },
        { target: "#ai-credit-model-rates", icon: Cpu, title: "Rates per AI Model", content: "Give expensive models their own credits per 1,000 input and output tokens.", blockTargetInteraction: true },
        { target: "#ai-credit-cost-preview", icon: Calculator, title: "Cost Preview", content: "Check what a request would cost before you save.", blockTargetInteraction: true },
        { target: "#ai-credit-settings-save", icon: FloppyDisk, title: "Save", content: "New rates apply to new AI requests within a minute.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(aiCreditsAdminTourConfig);
