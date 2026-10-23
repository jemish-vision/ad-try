import { tourRegistry } from '../TourRegistry';
import { Clock } from '@phosphor-icons/react';

export const hourlyTrackingTourConfig = {
    id: "hourly-tracking",
    title: "Hourly Tracking Model",
    steps: [
        { target: "#hourly-tracking-modal", icon: Clock, title: "Hourly Model", content: "Analyze hourly trends, heatmaps, and dayparting recommendations in this detailed view.", blockTargetInteraction: true },
        { target: "#hourly-tracking-close-btn", icon: Clock, title: "Close Model", content: "Click here to close the hourly model.", requireClick: true }
    ]
};

tourRegistry.register(hourlyTrackingTourConfig);
