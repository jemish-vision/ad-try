import { tourRegistry } from '../TourRegistry';
import {
    Target, ClockCounterClockwise, Stack, PlusCircle, Export,
    Table, TextT, Calendar, SlidersHorizontal, Lightning, FloppyDisk, XCircle, Clock, CalendarBlank, Pencil, Trash, Link, PlayCircle, ToggleRight
} from '@phosphor-icons/react';

export const ruleTourConfig = {
    id: "rule",
    title: "Rule Tour",
    steps: [
        { target: "#rule-history", icon: ClockCounterClockwise, title: "History", content: "Review historical logs of all automated rule executions.", blockTargetInteraction: true },
        { target: "#bulk-actions-dropdown", icon: Stack, title: "Bulk Actions", content: "Enable or disable multiple rules simultaneously.", blockTargetInteraction: true },
        { target: "#rule-add", icon: PlusCircle, title: "Add Rule", content: "Click here to create a new automated generic rule.", childTourId: "add-rule" },
        { target: "#rule-import-export", icon: Export, title: "Import & Export", content: "Bulk manage your rules via Excel files.", blockTargetInteraction: true },
        { target: "#targeting-rule-table", icon: Table, title: "Rules Grid", content: "Analyze rule configurations and recent performance.", blockTargetInteraction: true },
        { target: "#targeting-rule-edit-btn", icon: Pencil, title: "Edit Rule", content: "Click here to modify the conditions and actions of an existing rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#targeting-rule-delete-btn", icon: Trash, title: "Delete Rule", content: "Click here to permanently remove a rule from the system.", blockTargetInteraction: true, placement: "right" },
        { target: "#targeting-rule-link-btn", icon: Link, title: "Assign Campaigns", content: "Link your ad campaigns directly to this rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#targeting-rule-run-btn", icon: PlayCircle, title: "Run Rule Manually", content: "Execute this rule instantly instead of waiting for the schedule.", blockTargetInteraction: true, placement: "right" },
        { target: "#targeting-rule-status-toggle", icon: ToggleRight, title: "Rule Status", content: "Enable or disable this rule at any time.", blockTargetInteraction: true, placement: "right" }
    ]
};

export const addRuleTourConfig = {
    id: "add-rule",
    title: "Create Rule Tour",
    steps: [
        { target: "#rule-add-modal", icon: PlusCircle, title: "Create New Rule", content: "Configure the logic for your automated generic adjustment.", blockTargetInteraction: true },
        { target: "#rule-wizard-templates-card", icon: Stack, title: "Use Templates", content: "Choose from pre-configured templates to save time.", blockTargetInteraction: true },
        { target: "#rule-wizard-scratch-card", icon: PlusCircle, title: "Start from Scratch", content: "For this tour, let's start from scratch. Click here to proceed.", blockTargetInteraction: false, requireClick: true },
        { target: "#rule-name-input", icon: TextT, title: "Rule Name", content: "Give your rule a clear, identifiable name.", blockTargetInteraction: true },
        { target: "#rule-date-filter", icon: Calendar, title: "Date Filter", content: "Select the lookback window for the performance data.", blockTargetInteraction: true },
        { target: "#rule-days-since", icon: CalendarBlank, title: "Days Since", content: "Toggle and specify days since creation if applicable.", blockTargetInteraction: true },
        { target: "#rule-type", icon: SlidersHorizontal, title: "Rule Type", content: "Choose when this rule should evaluate and run.", blockTargetInteraction: true },
        { target: "#rule-conditions", icon: Target, title: "Conditions", content: "Define performance thresholds that trigger the rule.", blockTargetInteraction: true },
        { target: "#rule-actions", icon: Lightning, title: "Actions", content: "Specify exactly how much to adjust the budgets or bids.", blockTargetInteraction: true },
        { target: "#rule-rule-days", icon: Calendar, title: "Rule Days", content: "Select specific days of the week or intervals to run.", blockTargetInteraction: true },
        { target: "#rule-revert-section", icon: ClockCounterClockwise, title: "Revert Changes", content: "Enable to automatically restore previous bids, budgets, or statuses when the time slot or active day ends.", blockTargetInteraction: true },
        { target: "#rule-hourly-bid-section", icon: Clock, title: "Hourly Bid & Budget Dayparting", content: "Toggle to replace fixed rule times with multi-slot dayparting. Configure custom percentage adjustments (+% or -%) for specific time windows throughout the day.", blockTargetInteraction: true },
        { target: "#rule-rule-times", icon: Clock, title: "Rule Times", content: "When hourly mode is off, set the exact execution times when the rule should run.", blockTargetInteraction: true },
        { target: "#rule-submit", icon: FloppyDisk, title: "Submit", content: "Save and activate your new automated rule.", blockTargetInteraction: true },
        { target: "#rule-close .btn-close", icon: XCircle, title: "Close Window", content: "Click here to close the modal and return to the rules page.", requireClick: true }
    ]
};

tourRegistry.register(ruleTourConfig);
tourRegistry.register(addRuleTourConfig);
