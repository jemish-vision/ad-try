import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, PlusCircle, Table
} from '@phosphor-icons/react';

export const ruleBlockedTourConfig = {
    id: "rule-blocked-time",
    title: "Rule Blocked Time Tour",
    steps: [
        { target: "#rule-blocked-search", icon: MagnifyingGlass, title: "Search Blocked Times", content: "Easily search for specific blocked time intervals.", blockTargetInteraction: true },
        { target: "#rule-blocked-add-btn", icon: PlusCircle, title: "Add Blocked Time", content: "Click here to add a new rule blocked time window.", blockTargetInteraction: true },
        { target: "#ruleBlockedTime-main-table", icon: Table, title: "Blocked Time Grid", content: "View all your configured blocked times here. Use the action menu to edit or remove them.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(ruleBlockedTourConfig);
