import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Plus, TextAa, ArrowRight, ShieldCheck, 
    List, Checks, CheckCircle, XCircle
} from '@phosphor-icons/react';

export const roleTourConfig = {
    id: "roles",
    title: "Roles Tour",
    steps: [
        {
            target: "#roles-search", 
            icon: MagnifyingGlass, 
            title: "Role Search", 
            content: "Use this search bar to quickly find roles or organizations by name.", 
            blockTargetInteraction: true 
        },
        {
            target: "#roles-add-btn",
            icon: Plus,
            title: "Add Role",
            content: "Click here to add a new custom role to your organization.",
            requireClick: true
        },
        {
            target: "#role-name-field",
            icon: TextAa,
            title: "Role Name",
            content: "Enter a unique name for the new role you are creating.",
            blockTargetInteraction: true
        },
        {
            target: "#role-create-continue-btn",
            icon: ArrowRight,
            title: "Continue to Permissions",
            content: "Click 'Create & Continue' to proceed to configuring permissions for this role.",
            requireClick: true
        },
        {
            target: "#role-permissions-search",
            icon: MagnifyingGlass,
            title: "Search Permissions",
            content: "Search for specific modules or permissions you want to assign.",
            blockTargetInteraction: true
        },
        {
            target: "#role-grant-all",
            icon: ShieldCheck,
            title: "Grant All Permissions",
            content: "Toggle this to quickly grant or revoke all permissions across all modules.",
            blockTargetInteraction: true
        },
        {
            target: "#role-modules-sidebar",
            icon: List,
            title: "Modules & Pages",
            content: "Select a module from this list to configure its specific permissions.",
            blockTargetInteraction: true
        },
        {
            target: "#role-actions-panel",
            icon: Checks,
            title: "Standard Actions",
            content: "Enable or disable specific actions (View, Create, Update, Remove) for the selected module.",
            blockTargetInteraction: true
        },
        {
            target: "#role-submit-btn",
            icon: CheckCircle,
            title: "Update Permissions",
            content: "Click 'Update' to save the permission configuration for this role.",
            blockTargetInteraction: true
        },
        {
            target: "#role-cancel-btn",
            icon: XCircle,
            title: "Close Modal",
            content: "Click Cancel to close the modal without saving.",
            requireClick: true
        }
    ]
};

tourRegistry.register(roleTourConfig);
