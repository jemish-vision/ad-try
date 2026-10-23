import { tourRegistry } from '../TourRegistry';
import {
    CalendarStar, ListBullets
} from '@phosphor-icons/react';

export const holidaysTourConfig = {
    id: "holiday",
    title: "Holidays Tour",
    steps: [
        { target: "#holidays-upcoming-events", icon: ListBullets, title: "Upcoming Events", content: "Review your upcoming holiday schedules and active bid protection configurations.", blockTargetInteraction: true },
        { target: "#custom-holiday-calendar", icon: CalendarStar, title: "Holiday Calendar", content: "Click on any date to schedule a new holiday or click an existing event to update it.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(holidaysTourConfig);
