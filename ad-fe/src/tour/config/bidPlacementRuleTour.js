import { tourRegistry } from '../TourRegistry';
import {
    Target, ClockCounterClockwise, Stack, PlusCircle, Export,
    Table, TextT, Calendar, SlidersHorizontal, Lightning, FloppyDisk, XCircle, Clock, CalendarBlank, Pencil, Trash, Link, PlayCircle, ToggleRight
} from '@phosphor-icons/react';

export const bidPlacementRuleTourConfig = {
    id: "bid-placement-rule",
    title: "Placement Rule Tour",
    steps: [
        { target: "#bid-placement-rule-history", icon: ClockCounterClockwise, title: "History", content: "Review historical logs of all automated rule executions.", blockTargetInteraction: true },
        { target: "#bulk-actions-dropdown", icon: Stack, title: "Bulk Actions", content: "Enable or disable multiple rules simultaneously.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-add", icon: PlusCircle, title: "Add Rule", content: "Click here to create a new automated placement rule.", childTourId: "add-bid-placement-rule" },
        { target: "#bid-placement-rule-import-export", icon: Export, title: "Import & Export", content: "Bulk manage your rules via Excel files.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-table", icon: Table, title: "Rules Grid", content: "Analyze rule configurations and recent performance.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-edit-btn", icon: Pencil, title: "Edit Rule", content: "Click here to modify the conditions and actions of an existing rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#bid-placement-rule-delete-btn", icon: Trash, title: "Delete Rule", content: "Click here to permanently remove a rule from the system.", blockTargetInteraction: true, placement: "right" },
        { target: "#bid-placement-rule-link-btn", icon: Link, title: "Assign Campaigns", content: "Link your ad campaigns directly to this rule.", blockTargetInteraction: true, placement: "right" },
        { target: "#bid-placement-rule-run-btn", icon: PlayCircle, title: "Run Rule Manually", content: "Execute this rule instantly instead of waiting for the schedule.", blockTargetInteraction: true, placement: "right" },
        { target: "#bid-placement-rule-status-toggle", icon: ToggleRight, title: "Rule Status", content: "Enable or disable this rule at any time.", blockTargetInteraction: true, placement: "right" }
    ]
};

export const addBidPlacementRuleTourConfig = {
    id: "add-bid-placement-rule",
    title: "Create Rule Tour",
    steps: [
        { target: "#placement-rule-add-modal", icon: PlusCircle, title: "Create New Rule", content: "Configure the logic for your automated bid adjustment.", blockTargetInteraction: true },
        { target: "#rule-wizard-templates-card", icon: Stack, title: "Use Templates", content: "Choose from pre-configured templates to save time.", blockTargetInteraction: true },
        { target: "#rule-wizard-scratch-card", icon: PlusCircle, title: "Start from Scratch", content: "For this tour, let's start from scratch. Click here to proceed.", blockTargetInteraction: false, requireClick: true },
        { target: "#bid-placement-rule-name-input", icon: TextT, title: "Rule Name", content: "Give your rule a clear, identifiable name.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-date-filter", icon: Calendar, title: "Date Filter", content: "Select the lookback window for the performance data.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-days-since", icon: CalendarBlank, title: "Days Since", content: "Toggle and specify days since creation if applicable.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-type", icon: SlidersHorizontal, title: "Rule Type", content: "Choose when this rule should evaluate and run.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-conditions", icon: Target, title: "Conditions", content: "Define performance thresholds (like ACOS) that trigger the rule.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-actions", icon: Lightning, title: "Actions", content: "Specify exactly how much to adjust the placement bids.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-rule-days", icon: Calendar, title: "Rule Days", content: "Select specific days of the week or intervals to run.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-rule-times", icon: Clock, title: "Rule Times", content: "Set the exact time slots when the rule is active.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-submit", icon: FloppyDisk, title: "Submit", content: "Save and activate your new automated rule.", blockTargetInteraction: true },
        { target: "#bid-placement-rule-close .btn-close", icon: XCircle, title: "Close Window", content: "Click here to close the modal and return to the rules page.", requireClick: true, }
    ]
};

tourRegistry.register(bidPlacementRuleTourConfig);
tourRegistry.register(addBidPlacementRuleTourConfig);
