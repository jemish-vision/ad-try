import { tourRegistry } from '../TourRegistry';
import {
    ChartLineUp, ClockCountdown, List, CalendarCheck,
    CurrencyCircleDollar, Users, Package, BookOpen
} from '@phosphor-icons/react';

export const managementTourConfig = {
    id: "management",
    title: "Management Tour",
    steps: [
        { target: "#nav-analytics-parent", icon: ChartLineUp, title: "Brand Analysis Menu", content: "Expand to access brand analytics.", blockTargetInteraction: true },
        { target: "#nav-brand-analytics", icon: ChartLineUp, title: "Brand Analysis", content: "Review comprehensive brand analytics.", childTourId: "brand-analysis" },

        { target: "#nav-history", icon: ClockCountdown, title: "History", content: "View chronological log of account changes.", childTourId: "history" },
        { target: "#nav-audit-log", icon: List, title: "Audit Log", content: "Review security audit logs.", childTourId: "audit-log" },
        { target: "#nav-cron-job-scheduler", icon: CalendarCheck, title: "Job Scheduler", content: "Manage automated background tasks.", childTourId: "cron-schedular" },
        { target: "#nav-p-l-calculater", icon: CurrencyCircleDollar, title: "P&L Calculator", content: "Calculate your true profit and loss.", childTourId: "pl-calculater" },
        { target: "#nav-users", icon: Users, title: "Users", content: "Manage team members and permissions.", childTourId: "users" },
        { target: "#nav-role", icon: Users, title: "Roles", content: "Manage team roles and permissions.", childTourId: "roles" },
        { target: "#nav-holiday-special-days", icon: CalendarCheck, title: "Special Days", content: "Configure holidays and special events.", childTourId: "holiday" },
        { target: "#nav-user-guide", icon: BookOpen, title: "User Guide", content: "Access documentation and guides.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(managementTourConfig);
