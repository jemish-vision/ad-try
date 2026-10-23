import { tourRegistry } from '../TourRegistry';
import {
    Layout, Desktop, Tabs, Placeholder, Target, ListChecks, CheckCircle, ArrowLineDown, ArrowRight, ArrowLeft
} from '@phosphor-icons/react';

export const dynamicFormFieldTour = {
    id: "dynamicFormFieldTour",
    title: "Product Details Form Tour",
    steps: [
        {
            target: "#df-header",
            icon: Target,
            title: "Form Header",
            content: "View the primary category and monitor your overall progress as you complete the required product attributes.",
            blockTargetInteraction: true
        },
        {
            target: "#df-center",
            icon: Layout,
            title: "Workspace Area",
            content: "This central area contains all the input fields and validation tools needed to configure your product details.",
            blockTargetInteraction: true
        },
        {
            target: "#df-sub-tabs",
            icon: Tabs,
            title: "Category Navigation",
            content: "Use these tabs to switch between different groups of attributes, such as basic info, dimensions, and advanced details.",
            blockTargetInteraction: true
        },
        {
            target: "#df-left-side",
            icon: Placeholder,
            title: "Attribute Configuration",
            content: "Fill in the specific details for your product here. Required fields are marked to ensure your listing is compliant.",
            blockTargetInteraction: true
        },
        {
            target: "#df-right-side",
            icon: Desktop,
            title: "Status & Validation Panel",
            content: "This sidebar provides real-time feedback on your progress and highlights any fields that require your attention.",
            blockTargetInteraction: true
        },
        {
            target: "#df-listing-progress",
            icon: CheckCircle,
            title: "Completion Tracker",
            content: "Keep an eye on this gauge to see how close you are to fully completing the product setup.",
            blockTargetInteraction: true
        },
        {
            target: "#df-validation-checks",
            icon: ListChecks,
            title: "Error Diagnostics",
            content: "If any required information is missing or invalid, it will appear here. Click an error to jump directly to the affected field.",
            blockTargetInteraction: true
        },
        {
            target: "#df-bottom-view",
            icon: ArrowLineDown,
            title: "Action Footer",
            content: "Navigate through the form steps or return to the previous screen using these primary action buttons.",
            blockTargetInteraction: true
        },
        {
            target: "#df-back-preview",
            icon: ArrowLeft,
            title: "Return to Field Selection",
            content: "Need to add or remove attributes? Click here to go back to the schema selection step.",
            blockTargetInteraction: true
        },
        {
            target: "#df-prev-btn",
            icon: ArrowLeft,
            title: "Previous Section",
            content: "Click to return to the previous attribute category to review or adjust your earlier entries.",
            blockTargetInteraction: true
        },
        {
            target: "#df-next-btn",
            icon: ArrowRight,
            title: "Next Section",
            content: "Once you have completed the current category, click here to proceed to the next set of attributes or submit the form.",
            blockTargetInteraction: true
        }
    ]
};

tourRegistry.register(dynamicFormFieldTour);

