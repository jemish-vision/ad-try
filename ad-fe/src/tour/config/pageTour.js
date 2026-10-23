import { tourRegistry } from '../TourRegistry';
import {
    Table, MagnifyingGlass, PlusCircle, TextAa, Link, CheckCircle, XCircle,
    TextT, Hash, ToggleRight, Pencil, Trash
} from '@phosphor-icons/react';

export const pageTourConfig = {
    id: "pages",
    title: "Pages Tour",
    steps: [
        { 
            target: "#pages-main-table", 
            icon: Table, 
            title: "Pages Grid", 
            content: "This grid displays all configured system pages along with their URLs, active status, and allocated action counts.",
            blockTargetInteraction: true 
        },
        { 
            target: "#pages-search", 
            icon: MagnifyingGlass, 
            title: "Search Pages", 
            content: "Easily search and filter pages by name or URL to locate specific routes.",
            blockTargetInteraction: true 
        },
        { 
            target: "#pages-add-btn", 
            icon: PlusCircle, 
            title: "Add Page", 
            content: "Click here to add a new page route and configure its available actions.",
            requireClick: true 
        },
        { 
            target: "#page-slug-field", 
            icon: Link, 
            title: "Page Slug", 
            content: "Specify the exact route URL slug (e.g., dashboard or campaigns) for this page.",
            blockTargetInteraction: true 
        },
        { 
            target: "#page-name-field", 
            icon: TextAa, 
            title: "Page Name", 
            content: "Enter a descriptive name for the new page module.",
            blockTargetInteraction: true 
        },
        {
            target: "#display-name-field",
            icon: TextT,
            title: "Display Name",
            content: "Enter the display name for this page module.",
            blockTargetInteraction: true
        },
        {
            target: "#order-field",
            icon: Hash,
            title: "Order",
            content: "Set the numeric order for displaying this page in navigation.",
            blockTargetInteraction: true
        },
        { 
            target: "#page-save-btn", 
            icon: CheckCircle, 
            title: "Save Page", 
            content: "Click Save to create the new page configuration in the system.",
            blockTargetInteraction: true 
        },
        { 
            target: "#page-cancel-btn", 
            icon: XCircle, 
            title: "Close Modal", 
            content: "Click Cancel to close the form modal without saving.",
            requireClick: true 
        },
        {
            target: "#page-status-toggle",
            icon: ToggleRight,
            title: "Toggle Status",
            content: "Click here to toggle the active status of the page.",
            blockTargetInteraction: true,
            placement: "left"
        },
        {
            target: "#page-edit-btn",
            icon: Pencil,
            title: "Edit Page",
            content: "Click here to edit the page configuration.",
            blockTargetInteraction: true,
            placement: "left"
        },
        {
            target: "#page-delete-btn",
            icon: Trash,
            title: "Delete Page",
            content: "Click here to delete the page.",
            blockTargetInteraction: true,
            placement: "left"
        }
    ]
};

tourRegistry.register(pageTourConfig);
