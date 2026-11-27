import { tourRegistry } from '../TourRegistry';
import { Sparkle, ChartLine, Buildings, MagnifyingGlass, ListBullets, GearSix, ToggleLeft, Cpu, Calculator, FloppyDisk, Image, Package, Plus, Receipt, Globe, SlidersHorizontal, CalendarBlank, Archive } from '@phosphor-icons/react';

export const aiCreditsAdminTourConfig = {
    id: "ai-credits-admin",
    title: "AI Credit Management Tour",
    steps: [
        { target: "#ai-credits-admin-tabs", icon: Sparkle, title: "AI Credit Management", content: "Overview, organization wallets, the usage log and settings for AI credits.", blockTargetInteraction: true },
        { target: "#ai-credit-admin-overview", icon: ChartLine, title: "Overview", content: "Credits and tokens used this month across all organizations, by feature and by AI model, and the organizations using the most.", blockTargetInteraction: true },
        { target: "#ai-credits-admin-tab-organizations", icon: Buildings, title: "Organizations", content: "Click to see every organization's wallet.", requireClick: true },
        { target: "#ai-credit-org-search", icon: MagnifyingGlass, title: "Find an Organization", content: "Search by name. Use the buttons on each row to view its usage, add or remove credits, or give it its own monthly allowance.", blockTargetInteraction: true },
        { target: "#ai-credits-admin-tab-usage", icon: ListBullets, title: "Usage Log", content: "Click to see every AI request with its organization, user, model, tokens and cost.", requireClick: true },
        { target: "#ai-credit-admin-usage-view", icon: CalendarBlank, title: "Each Request or Daily Totals", content: "Switch between each AI request and the daily totals of older requests.", blockTargetInteraction: true },
        { target: "#ai-credits-admin-tab-packages", icon: Package, title: "Credit Packages", content: "Click to manage the credit packages organizations can buy: credits, price, regional prices and availability.", requireClick: true },
        { target: "#ai-pkg-add", icon: Plus, title: "Add a Package", content: "Create a package. Purchased credits never expire and are used after the monthly credits.", blockTargetInteraction: true },
        { target: "#ai-pkg-region-prices", icon: Globe, title: "Regional Prices", content: "Set this package's price for each pricing region, like plan prices. Buyers are matched to a region by their country and pay in its currency; everyone else pays the default price.", blockTargetInteraction: true },
        { target: "#ai-custom-pricing", icon: SlidersHorizontal, title: "Custom Amount", content: "Let buyers choose their own number of credits: set the price per credit, the minimum and maximum, and optional prices per pricing region.", blockTargetInteraction: true },
        { target: "#ai-credits-admin-tab-payments", icon: Receipt, title: "Payments", content: "Click to see every credit purchase and whether it was paid, is pending, failed or was cancelled.", requireClick: true },
        { target: "#ai-credits-admin-tab-settings", icon: GearSix, title: "Settings", content: "Click to set how tokens convert to credits.", requireClick: true },
        { target: "#ai-credit-enforcement", icon: ToggleLeft, title: "Enforce Credit Limits", content: "Turn off to let AI run without taking credits (usage is still recorded).", blockTargetInteraction: true },
        { target: "#ai-image-rate", icon: Image, title: "Credits per Image", content: "A+ Content banners are charged per generated image. Batch images are charged when Google returns them; failed batches are free.", blockTargetInteraction: true },
        { target: "#ai-credit-model-rates", icon: Cpu, title: "Rates per AI Model", content: "Give expensive models their own credits per 1,000 input and output tokens.", blockTargetInteraction: true },
        { target: "#ai-credit-cost-preview", icon: Calculator, title: "Cost Preview", content: "Check what a request would cost before you save.", blockTargetInteraction: true },
        { target: "#ai-usage-retention", icon: Archive, title: "Usage History Retention", content: "Choose how many days each AI request is kept on its own (e.g. 30, 60 or 90). Every night, older requests are combined into daily totals and deleted. 0 keeps every request. Wallet transactions are never affected.", blockTargetInteraction: true },
        { target: "#ai-credit-settings-save", icon: FloppyDisk, title: "Save", content: "New rates apply to new AI requests within a minute.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(aiCreditsAdminTourConfig);
