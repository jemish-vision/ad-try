import { tourRegistry } from '../TourRegistry';
import {
    Plus, TextAa, CurrencyDollar, CalendarBlank, Link, ToggleLeft, CheckCircle, XCircle, Table,
    Users, UserPlus, ArrowRight, MagnifyingGlass, ShieldCheck, List, Checks
} from '@phosphor-icons/react';

export const packagesTourConfig = {
    id: "packages",
    title: "Plans Tour",
    steps: [
        {
            target: "#packages-main-table",
            icon: Table,
            title: "Plans Grid",
            content: "View all available packages, their pricing, trial days, and edit their details.",
            blockTargetInteraction: true
        },
        {
            target: "#packages-add-btn",
            icon: Plus,
            title: "Add Package",
            content: "Click here to add a new subscription package.",
            requireClick: true
        },
        {
            target: ".premium-modal .modal-content",
            icon: Plus,
            title: "Add Subscription Plan",
            content: "This is the modal where you can configure the details of the new subscription plan.",
            blockTargetInteraction: true
        },
        {
            target: "#package-name-field",
            icon: TextAa,
            title: "Plan Name",
            content: "Enter the name of the new subscription plan.",
            blockTargetInteraction: true
        },
        {
            target: "#package-monthly-price-field",
            icon: CurrencyDollar,
            title: "Monthly Price",
            content: "Set the monthly price for this package.",
            blockTargetInteraction: true
        },
        {
            target: "#package-yearly-price-field",
            icon: CurrencyDollar,
            title: "Yearly Price",
            content: "Set the yearly price for this package.",
            blockTargetInteraction: true
        },
        {
            target: "#package-trial-field",
            icon: CalendarBlank,
            title: "Trial Days",
            content: "Specify the number of trial days allowed.",
            blockTargetInteraction: true
        },
        {
            target: "#package-amazon-field",
            icon: Link,
            title: "Amazon Connection",
            content: "Enter the allowed Amazon connection limit.",
            blockTargetInteraction: true
        },
        {
            target: "#package-profile-limit-field",
            icon: Users,
            title: "Profile Limit",
            content: "Set the maximum number of profiles allowed for this plan.",
            blockTargetInteraction: true
        },
        {
            target: "#package-invites-limit-field",
            icon: UserPlus,
            title: "Number of Invites",
            content: "Specify the number of user invites allowed.",
            blockTargetInteraction: true
        },
        {
            target: "#package-active-switch",
            icon: ToggleLeft,
            title: "Active Status",
            content: "Toggle this switch to mark the plan as active or inactive.",
            blockTargetInteraction: true
        },
        {
            target: "#package-public-switch",
            icon: ToggleLeft,
            title: "Public Plan",
            content: "Toggle this switch to make the plan public or private.",
            blockTargetInteraction: true
        },
        {
            target: "#package-next-btn",
            icon: ArrowRight,
            title: "Configure Permissions",
            content: "Click Next to proceed to the permissions configuration tab.",
            requireClick: true
        },
        {
            target: "#package-permissions-search",
            icon: MagnifyingGlass,
            title: "Search Permissions",
            content: "Search for specific pages, modules, or actions to configure.",
            blockTargetInteraction: true
        },
        {
            target: "#package-grant-all",
            icon: ShieldCheck,
            title: "Grant All Permissions",
            content: "Quickly enable or disable all available permissions.",
            blockTargetInteraction: true
        },
        {
            target: "#package-modules-sidebar",
            icon: List,
            title: "Modules & Pages",
            content: "Select a module from this list to configure its specific permissions.",
            blockTargetInteraction: true
        },
        {
            target: "#package-actions-panel",
            icon: Checks,
            title: "Standard Actions",
            content: "Enable or disable specific actions (View, Create, Update, Remove) for the selected module.",
            blockTargetInteraction: true
        },
        {
            target: "#package-create-btn",
            icon: CheckCircle,
            title: "Create Package",
            content: "Click to save the newly created package and its permissions.",
            blockTargetInteraction: true
        },
        {
            target: "#package-cancel-btn",
            icon: XCircle,
            title: "Close Modal",
            content: "Click cancel to close the modal without saving.",
            requireClick: true
        }
    ]
};

tourRegistry.register(packagesTourConfig);
