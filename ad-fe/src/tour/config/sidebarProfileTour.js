import { tourRegistry } from '../TourRegistry';
import { GoogleLogo, Key, ChartLineUp } from '@phosphor-icons/react';

export const sidebarProfileTourConfig = {
    id: "sidebar-dock-profile",
    title: "Sidebar Profile",
    steps: [
        { target: "#sidebar-sheet-item", icon: ChartLineUp, title: "Top Performance Sheet", content: "Access your top performing metrics and analytics directly via Google Sheets.", placement: "right", blockTargetInteraction: true },
        { target: "#sidebar-keyword-item", icon: GoogleLogo, title: "Keyword Analysis", content: "Deep dive into your keyword performance data to optimize your campaigns.", placement: "right", blockTargetInteraction: true },
        { target: "#sidebar-password-item", icon: Key, title: "Change Password", content: "Secure your account by updating your password anytime from this menu.", placement: "right", blockTargetInteraction: true }
    ]
};

tourRegistry.register(sidebarProfileTourConfig);
