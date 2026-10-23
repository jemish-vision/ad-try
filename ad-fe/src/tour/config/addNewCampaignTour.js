import { tourRegistry } from '../TourRegistry';
import {
    Sliders, TextT, CurrencyDollar, CalendarBlank, CalendarCheck,
    UsersThree, Globe, Crosshair, ChartBar, ArrowFatUp, ArrowFatDown, ShoppingBag,
    Package, Target, Prohibit, ClipboardText,
    ArrowRight, ArrowLeft, Trash, ArrowUUpLeft
} from '@phosphor-icons/react';

// ─── Parent Tour (Stepper-level overview + navigation) ───────────────────────
export const addNewCampaignTourConfig = {
    id: "add-new-campaign",
    title: "Add New Campaign Tour",
    steps: [
        { target: "#campaign-step-0", icon: Sliders, title: "Campaign Basic Details", content: "Step 1 — Configure name, budget, dates, targeting, bidding strategy, and placement adjustments.", childTourId: "campaign-basic-details" },
        { target: "#campaign-step-1", icon: Package, title: "Product", content: "Step 2 — Search or enter ASINs to add products you want to advertise in this campaign.", blockTargetInteraction: true },
        { target: "#campaign-step-2", icon: Target, title: "Targeting", content: "Step 3 — Configure keyword or product targeting to control when and where your ads are shown.", blockTargetInteraction: true },
        { target: "#campaign-step-3", icon: Prohibit, title: "Negative Targeting", content: "Step 4 — Add negative keywords or ASINs to prevent your ads from appearing on irrelevant searches.", blockTargetInteraction: true },
        { target: "#campaign-step-4", icon: ClipboardText, title: "Review", content: "Step 5 — Review all your campaign settings before launching.", blockTargetInteraction: true },
        { target: "#campaign-next-btn", icon: ArrowRight, title: "Next Step", content: "Click this button to advance to the next step of the campaign creation flow.", blockTargetInteraction: true },
        { target: "#campaign-back-btn", icon: ArrowLeft, title: "Back Step", content: "Click this button to go back to the previous step and make changes.", blockTargetInteraction: true },
        { target: "#campaign-discard-btn", icon: Trash, title: "Discard", content: "Click Discard to abandon all changes and return to the campaigns list.", blockTargetInteraction: true },
        { target: "#campaign-back-link", icon: ArrowUUpLeft, title: "Back to Campaign", content: "Click this link to navigate back to the campaigns listing page.", blockTargetInteraction: true }
    ]
};

// ─── Child Tour (Campaign Basic Details form fields) ─────────────────────────
export const campaignBasicDetailsTourConfig = {
    id: "campaign-basic-details",
    title: "Campaign Basic Details Tour",
    steps: [
        { target: "#campaign-name-field", icon: TextT, title: "Campaign Name", content: "Enter a unique, descriptive name for your campaign (e.g. 'Q4 Global Brand Awareness').", blockTargetInteraction: true },
        { target: "#campaign-budget-field", icon: CurrencyDollar, title: "Daily Budget", content: "Set the maximum amount you're willing to spend per day on this campaign.", blockTargetInteraction: true },
        { target: "#campaign-start-date", icon: CalendarBlank, title: "Start Date", content: "Pick the date when your campaign will begin running.", blockTargetInteraction: true },
        { target: "#campaign-end-date", icon: CalendarCheck, title: "End Date", content: "Optionally set an end date. If left empty, the campaign runs indefinitely.", blockTargetInteraction: true },
        { target: "#campaign-adgroup-field", icon: UsersThree, title: "AdGroup Name", content: "Name the ad group that organizes your products and targeting within this campaign.", blockTargetInteraction: true },
        { target: "#campaign-site-field", icon: Globe, title: "Site", content: "Choose the marketplace site where your ads will appear — Amazon or Amazon Business.", blockTargetInteraction: true },
        { target: "#campaign-targeting-field", icon: Crosshair, title: "Targeting", content: "Select Automatic or Manual targeting. Automatic lets Amazon match your ads; Manual gives you full keyword control.", blockTargetInteraction: true },
        { target: "#campaign-bidding-strategy", icon: ChartBar, title: "Bidding Strategy", content: "Pick a bidding strategy: Dynamic Down-Only, Dynamic Up & Down, or Fixed Bids to control how Amazon adjusts your bids.", blockTargetInteraction: true },
        { target: "#campaign-top-search", icon: ArrowFatUp, title: "Top of Search", content: "Set the bid adjustment percentage for the top-of-search placement — the most visible ad position.", blockTargetInteraction: true },
        { target: "#campaign-rest-search", icon: ArrowFatDown, title: "Rest of Search", content: "Set the bid adjustment percentage for mid and bottom search result placements.", blockTargetInteraction: true },
        { target: "#campaign-product-pages", icon: ShoppingBag, title: "Product Pages", content: "Set the bid adjustment percentage for product detail page placements.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(addNewCampaignTourConfig);
tourRegistry.register(campaignBasicDetailsTourConfig);
