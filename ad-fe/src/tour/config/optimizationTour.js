import { tourRegistry } from '../TourRegistry';
import {
    House, Megaphone, Target, CurrencyCircleDollar, Star,
    ChartBar, ListMagnifyingGlass, ChartPie, ClockCountdown, Infinity as PhosphorInfinity
} from '@phosphor-icons/react';

export const optimizationTourConfig = {
    id: "optimization",
    title: "Optimization Tour",
    steps: [
        { target: "#nav-dashboard", icon: House, title: "Dashboard", content: "View high-level analytics.", childTourId: "dashboard" },
        { target: "#nav-campaigns", icon: Megaphone, title: "Campaigns", content: "Manage and optimize your campaigns.", childTourId: "campaign" },

        { target: "#nav-placement-parent", icon: Target, title: "Placement Menu", content: "Expand to access placement tools.", blockTargetInteraction: true },
        { target: "#nav-placement", icon: Target, title: "Placements", content: "Adjust bid multipliers for placements.", childTourId: "placement" },
        { target: "#nav-placement-rule", icon: Target, title: "Bid Rules", content: "Set automated bid rules.", childTourId: "bid-placement-rule" },

        { target: "#nav-budget-rules", icon: CurrencyCircleDollar, title: "Budget Rules", content: "Set budget adjustment rules.", childTourId: "budget-rules" },
        { target: "#nav-recommandation", icon: Star, title: "Recommendations", content: "Review smart recommendations.", childTourId: "recommandation" },

        { target: "#nav-targeting-parent", icon: Target, title: "Targeting Menu", content: "Expand to configure targeting.", blockTargetInteraction: true },
        { target: "#nav-targeting", icon: Target, title: "Targeting", content: "Adjust your targeting bids.", childTourId: "targeting" },
        { target: "#nav-targeting-rule", icon: PhosphorInfinity, title: "Automation Rules", content: "Create automation rules.", childTourId: "rule" },
        { target: "#nav-keyword-tracker", icon: ChartBar, title: "Keyword Tracker", content: "Track your keyword rankings.", childTourId: "keyword-tracker" },

        { target: "#nav-search-term-parent", icon: ListMagnifyingGlass, title: "Search Term Menu", content: "Expand to analyze search terms.", blockTargetInteraction: true },
        { target: "#nav-search-term", icon: ListMagnifyingGlass, title: "Search Terms", content: "Analyze raw search query data.", childTourId: "search-term" },
        { target: "#nav-search-term-rule", icon: PhosphorInfinity, title: "Search Term Rules", content: "Automate search term harvesting.", childTourId: "search-term-rule" },
        { target: "#nav-keyword-analysis", icon: ChartPie, title: "Keyword Analysis", content: "Deep dive into keyword metrics.", childTourId: "keyword-analysis" },

        { target: "#nav-hourly-performance-tracking", icon: ClockCountdown, title: "Hourly Performance Tracking", content: "Track and analyze hourly performance trends.", childTourId: "dayparting-strategy" }
    ]
};

tourRegistry.register(optimizationTourConfig);
