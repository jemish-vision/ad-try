import { tourRegistry } from '../TourRegistry';
import {
    Target, ClockCounterClockwise, Stack, PlusCircle, Export,
    Table, TextT, Calendar, SlidersHorizontal, Lightning, FloppyDisk, XCircle, Clock, CalendarBlank, Pencil, Trash, Link, PlayCircle, ToggleRight
} from '@phosphor-icons/react';

export const budgetRulesTourConfig = {
    id: "budget-rules",
    title: "Budget Rules Tour",
    steps: [
        { target: "#budget-rule-history", icon: ClockCounterClockwise, title: "History", content: "Review historical logs of all automated rule executions.", blockTargetInteraction: true },
        { target: "#bulk-actions-dropdown", icon: Stack, title: "Bulk Actions", content: "Enable or disable multiple rules simultaneously.", blockTargetInteraction: true },
        { target: "#budget-rule-add", icon: PlusCircle, title: "Add Rule", content: "Click here to create a new automated budget rule.", childTourId: "add-budget-rule" },
        { target: "#budget-rule-import-export", icon: Export, title: "Import & Export", content: "Bulk manage your rules via Excel files.", blockTargetInteraction: true },
        { target: "#budget-rule-table", icon: Table, title: "Rules Grid", content: "Analyze rule configurations and recent performance.", blockTargetInteraction: true },
        { target: "#budget-rule-edit-btn", icon: Pencil, title: "Edit Rule", content: "Click here to modify the conditions and actions of an existing rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#budget-rule-delete-btn", icon: Trash, title: "Delete Rule", content: "Click here to permanently remove a rule from the system.", blockTargetInteraction: true, placement: "right" },
        { target: "#budget-rule-link-btn", icon: Link, title: "Assign Campaigns", content: "Link your ad campaigns directly to this rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#budget-rule-run-btn", icon: PlayCircle, title: "Run Rule Manually", content: "Execute this rule instantly instead of waiting for the schedule.", blockTargetInteraction: true, placement: "right" },
        { target: "#budget-rule-status-toggle", icon: ToggleRight, title: "Rule Status", content: "Enable or disable this rule at any time.", blockTargetInteraction: true, placement: "right" }
    ]
};

export const addBudgetRuleTourConfig = {
    id: "add-budget-rule",
    title: "Create Budget Rule Tour",
    steps: [
        { target: "#budget-rule-add-modal", icon: PlusCircle, title: "Create New Rule", content: "Configure the logic for your automated budget adjustment.", blockTargetInteraction: true },
        { target: "#rule-wizard-templates-card", icon: Stack, title: "Use Templates", content: "Choose from pre-configured templates to save time.", blockTargetInteraction: true },
        { target: "#rule-wizard-scratch-card", icon: PlusCircle, title: "Start from Scratch", content: "For this tour, let's start from scratch. Click here to proceed.", blockTargetInteraction: false, requireClick: true },
        { target: "#budget-rule-name-input", icon: TextT, title: "Rule Name", content: "Give your rule a clear, identifiable name.", blockTargetInteraction: true },
        { target: "#budget-rule-date-filter", icon: Calendar, title: "Date Filter", content: "Select the lookback window for the performance data.", blockTargetInteraction: true },
        { target: "#budget-rule-days-since", icon: CalendarBlank, title: "Days Since", content: "Toggle and specify days since creation if applicable.", blockTargetInteraction: true },
        { target: "#budget-rule-type", icon: SlidersHorizontal, title: "Rule Type", content: "Choose when this rule should evaluate and run.", blockTargetInteraction: true },
        { target: "#budget-rule-conditions", icon: Target, title: "Conditions", content: "Define performance thresholds that trigger the rule.", blockTargetInteraction: true },
        { target: "#budget-rule-actions", icon: Lightning, title: "Actions", content: "Specify exactly how much to adjust the budgets.", blockTargetInteraction: true },
        { target: "#budget-rule-rule-days", icon: Calendar, title: "Rule Days", content: "Select specific days of the week or intervals to run.", blockTargetInteraction: true },
        { target: "#budget-rule-rule-times", icon: Clock, title: "Rule Times", content: "Set the exact time slots when the rule is active.", blockTargetInteraction: true },
        { target: "#budget-rule-submit", icon: FloppyDisk, title: "Submit", content: "Save and activate your new automated rule.", blockTargetInteraction: true },
        { target: "#budget-rule-close .btn-close", icon: XCircle, title: "Close Window", content: "Click here to close the modal and return to the rules page.", requireClick: true }
    ]
};

tourRegistry.register(budgetRulesTourConfig);
tourRegistry.register(addBudgetRuleTourConfig);
