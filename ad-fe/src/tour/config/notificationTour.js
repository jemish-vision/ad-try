import { tourRegistry } from '../TourRegistry';
import { Bell } from '@phosphor-icons/react';

export const notificationTourConfig = {
    id: "notification-dropdown-panel",
    title: "Notifications",
    steps: [
        { target: "#notification-dropdown-panel", icon: Bell, title: "Notification Panel", content: "Here you can see all your recent notifications, including system alerts, billing, and campaign updates.", placement: "bottom", blockTargetInteraction: true },
        { target: "#notification", icon: Bell, title: "Close Panel", content: "Click the bell icon to close the notification panel and continue.", placement: "bottom", requireClick: true }
    ]
};

tourRegistry.register(notificationTourConfig);
