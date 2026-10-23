import { tourRegistry } from '../TourRegistry';
import {
    Buildings, MagnifyingGlass, Table, Pencil, Users, Info, XCircle, CheckCircle, Calendar, Package
} from '@phosphor-icons/react';

export const organizationsTourConfig = {
    id: "organizationsTour",
    title: "Organizations Tour",
    steps: [
        { target: "#orgs-search", icon: MagnifyingGlass, title: "Search Organizations", content: "Use this to filter the organizations by name or other attributes.", blockTargetInteraction: true },
        { target: "#orgs-main-table", icon: Table, title: "Organizations Grid", content: "This table lists all registered organizations along with their subscription plans and user counts.", blockTargetInteraction: true },
        { target: "#orgs-edit-btn", icon: Pencil, title: "Edit Organization", content: "Click here to edit the organization's details.", requireClick: true },
        { target: "#orgs-edit-modal-content", icon: Info, title: "Edit Organization Details", content: "Update the basic details of the organization.", blockTargetInteraction: true },
        { target: "#orgs-edit-name-wrapper", icon: Buildings, title: "Organization Name", content: "Change the name of the organization.", blockTargetInteraction: true },
        { target: "#orgs-edit-plan-wrapper", icon: Package, title: "Subscription Plan", content: "Select the assigned subscription plan.", blockTargetInteraction: true },
        { target: "#orgs-edit-dates", icon: Calendar, title: "Subscription Duration", content: "Set the start and end dates for the subscription.", blockTargetInteraction: true },
        { target: "#orgs-edit-save", icon: CheckCircle, title: "Save Changes", content: "Click to save the updated organization details.", blockTargetInteraction: true },
        { target: "#orgs-edit-cancel", icon: XCircle, title: "Close Edit Modal", content: "Click here to close the edit modal.", requireClick: true },
        { target: "#orgs-users-btn", icon: Users, title: "Manage Users", content: "Click here to view users associated with this organization.", requireClick: true },
        { target: "#orgs-users-login-btn", icon: Info, title: "Login as User", content: "Super Admins can log in directly into a user's account by clicking this button.", blockTargetInteraction: true },
        { target: "#orgs-users-close", icon: XCircle, title: "Close Users Modal", content: "Click here to close the users modal.", requireClick: true }
    ]
};

tourRegistry.register(organizationsTourConfig);
