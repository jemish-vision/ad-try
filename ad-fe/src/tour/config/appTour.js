import { tourRegistry } from '../TourRegistry';
import {
    HandWaving, Question, Bell, Palette, UserCircle,
    ListDashes, List, ChartLineUp, Package, Gear, Headset, Buildings, SignOut
} from '@phosphor-icons/react';

export const appTourConfig = {
    id: "app",
    title: "Application Tour",
    steps: [
        { target: "body", icon: HandWaving, title: "Welcome to AdvertiseIQ", content: "Let's take a quick tour of the workspace. We'll show you exactly where to find all the essential tools to manage your campaigns like a pro.", placement: "center", disableBeacon: true },
        { target: "#help-center", icon: Question, title: "User Guide", content: "Access page-specific guided tours here anytime you need a refresher. Our interactive guides walk you through complex features step-by-step.", disableBeacon: true, blockTargetInteraction: true },
        { target: "#notification", icon: Bell, title: "Notification", content: "Stay updated with real-time alerts regarding campaign performance, account status, and critical billing updates so you never miss a thing.", childTourId: "notification-dropdown-panel" },
        { target: "#theme-toggle", icon: Palette, title: "Theme Change Mode", content: "Switch seamlessly between our crisp light mode and sleek dark mode based on your personal viewing preference." },
        { target: "#profile-selection", icon: UserCircle, title: "Profile Selection", content: "Quickly switch between your connected advertising profiles and seller accounts without logging out. All relevant data will instantly sync.", blockTargetInteraction: true },
        { target: "#org-switcher", icon: Buildings, title: "Organization Switcher", content: "Easily switch between different organizations if you manage multiple accounts.", blockTargetInteraction: true },
        { target: "#adtype-dropdown", icon: ListDashes, title: "AdType Dropdown", content: "Filter your dashboard by specific advertisement types. Easily drill down into sponsored products, display ads, or brand campaigns.", blockTargetInteraction: true },
        { target: "#help-support", icon: Headset, title: "Help & Support", content: "Need assistance? Open our interactive support chatbot anytime to submit tickets or get instant answers.", childTourId: "chat-window" },
        { target: "#sidebar-dock-profile", icon: List, title: "Sidebar Profile", content: "Click here to open your profile menu, where you can access your Top Performer Sheet, Keyword Analysis, or Change your password.", childTourId: "sidebar-dock-profile" },
        { target: "#sidebar-dock-logout", icon: SignOut, title: "Logout", content: "Securely sign out of your account.", blockTargetInteraction: true },
        { target: "#nav-settings", icon: Gear, title: "Settings", content: "Configure global system preferences.", childTourId: "settings" },
        { target: "#optimize", icon: ChartLineUp, title: "Optimization", content: "Configure optimization tools for your campaigns. Click here to take a sub-tour focusing on automated bidding and performance tweaking!", childTourId: "optimization" },
        { target: "#operations", icon: Package, title: "Operations", content: "Manage bulk operations, custom rules, and scheduled actions. Click here to explore a deep-dive tour on streamlining repetitive tasks.", childTourId: "operations" },
        { target: "#management", icon: Gear, title: "Management", content: "Control your team members, oversee billing, and adjust account preferences. Click to take a guided walkthrough of administrative tools.", childTourId: "management" }
    ]
};

tourRegistry.register(appTourConfig);
