import { tourRegistry } from '../TourRegistry';
import {
    Target, ClockCounterClockwise, Stack, PlusCircle,
    Table, TextT, Calendar, SlidersHorizontal, Lightning, FloppyDisk, XCircle, Pencil, Trash, Link, PlayCircle, ToggleRight
} from '@phosphor-icons/react';

export const searchTermRuleTourConfig = {
    id: "search-term-rule",
    title: "Search Term Rule Tour",
    steps: [
        { target: "#search-term-rule-history", icon: ClockCounterClockwise, title: "History", content: "Review historical logs of all automated search term rule executions.", blockTargetInteraction: true },
        { target: "#bulk-actions-dropdown", icon: Stack, title: "Bulk Actions", content: "Enable or disable multiple rules simultaneously.", blockTargetInteraction: true },
        { target: "#search-term-rule-add", icon: PlusCircle, title: "Add Rule", content: "Click here to create a new automated search term rule.", childTourId: "add-search-term-rule" },
        { target: "#search-term-rule-table", icon: Table, title: "Rules Grid", content: "Analyze rule configurations and recent performance.", blockTargetInteraction: true },
        { target: "#search-term-rule-edit-btn", icon: Pencil, title: "Edit Rule", content: "Click here to modify the conditions and actions of an existing rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#search-term-rule-delete-btn", icon: Trash, title: "Delete Rule", content: "Click here to permanently remove a rule from the system.", blockTargetInteraction: true, placement: "right" },
        { target: "#search-term-rule-link-btn", icon: Link, title: "Assign Campaigns", content: "Link your ad campaigns directly to this rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#search-term-rule-run-btn", icon: PlayCircle, title: "Run Rule Manually", content: "Execute this rule instantly instead of waiting for the schedule.", blockTargetInteraction: true, placement: "right" },
        { target: "#search-term-rule-status-toggle", icon: ToggleRight, title: "Rule Status", content: "Enable or disable this rule at any time.", blockTargetInteraction: true, placement: "right" }
    ]
};

export const addSearchTermRuleTourConfig = {
    id: "add-search-term-rule",
    title: "Create Search Term Rule Tour",
    steps: [
        { target: "#search-term-rule-add-modal", icon: PlusCircle, title: "Create New Rule", content: "Configure the logic for your automated search term adjustment.", blockTargetInteraction: true },
        { target: "#rule-wizard-templates-card", icon: Stack, title: "Use Templates", content: "Choose from pre-configured templates to save time.", blockTargetInteraction: true },
        { target: "#rule-wizard-scratch-card", icon: PlusCircle, title: "Start from Scratch", content: "For this tour, let's start from scratch. Click here to proceed.", blockTargetInteraction: false, requireClick: true },
        { target: "#search-term-rule-name-input", icon: TextT, title: "Rule Name", content: "Give your rule a clear, identifiable name.", blockTargetInteraction: true },
        { target: "#search-term-rule-date-filter", icon: Calendar, title: "Date Filter", content: "Select the lookback window for the performance data.", blockTargetInteraction: true },
        { target: "#search-term-rule-type", icon: SlidersHorizontal, title: "Rule Type", content: "Choose when this rule should evaluate and run.", blockTargetInteraction: true },
        { target: "#search-term-rule-conditions", icon: Target, title: "Conditions", content: "Define performance thresholds that trigger the rule.", blockTargetInteraction: true },
        { target: "#search-term-rule-actions", icon: Lightning, title: "Actions", content: "Specify exactly how much to adjust the bids or status.", blockTargetInteraction: true },
        { target: "#search-term-rule-submit", icon: FloppyDisk, title: "Submit", content: "Save and activate your new automated rule.", blockTargetInteraction: true },
        { target: "#search-term-rule-close .btn-close", icon: XCircle, title: "Close Window", content: "Click here to close the modal and return to the rules page.", requireClick: true }
    ]
};

tourRegistry.register(searchTermRuleTourConfig);
tourRegistry.register(addSearchTermRuleTourConfig);
