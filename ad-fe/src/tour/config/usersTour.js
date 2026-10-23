import { tourRegistry } from '../TourRegistry';
import {
    Table, MagnifyingGlass, UserPlus, EnvelopeSimple, ShieldCheck, CheckCircle, XCircle, ClockCounterClockwise, Pencil, LockKey, Trash
} from '@phosphor-icons/react';
import { ROLES } from 'src/common/constants';

const role = localStorage.getItem("role");
const isSuperAdmin = role === ROLES.SUPER_ADMIN;

export const usersTourConfig = {
    id: "users",
    title: "Users Tour",
    steps: isSuperAdmin ? [
        { 
            target: "#users-main-table", 
            icon: Table, 
            title: "Users Grid", 
            content: "This grid displays all the registered users along with their details like Email, Role, and Company.",
            blockTargetInteraction: true 
        },
        { 
            target: "#users-search", 
            icon: MagnifyingGlass, 
            title: "Search Users", 
            content: "Quickly find a specific user by searching for their name, email, or company.",
            blockTargetInteraction: true 
        },
        { 
            target: "#user-edit-btn-0", 
            icon: Pencil, 
            title: "Edit User", 
            content: "Click this icon to update a user's details.",
            blockTargetInteraction: true 
        },
        { 
            target: "#user-permission-edit-btn-0", 
            icon: LockKey, 
            title: "Edit Permissions", 
            content: "Click here to modify the permissions and organizations assigned to the user.",
            blockTargetInteraction: true 
        }
    ] : [
        { 
            target: "#users-main-table", 
            icon: Table, 
            title: "Users Grid", 
            content: "This grid displays all the active users in your organization.",
            blockTargetInteraction: true 
        },
        { 
            target: "#users-search", 
            icon: MagnifyingGlass, 
            title: "Search Users", 
            content: "Quickly find a specific user by searching their details.",
            blockTargetInteraction: true 
        },
        { 
            target: "#user-edit-btn-0", 
            icon: Pencil, 
            title: "Edit Profile", 
            content: "Click this icon to modify a user's profile details.",
            blockTargetInteraction: true 
        },
        { 
            target: "#user-delete-btn-0", 
            icon: Trash, 
            title: "Delete User", 
            content: "Click here to remove a user from the system.",
            blockTargetInteraction: true 
        },
        {
            target: "#users-history-btn",
            icon: ClockCounterClockwise,
            title: "Invited Users",
            content: "Click here to view the history and status of all your sent invitations.",
            blockTargetInteraction: true
        },
        { 
            target: "#users-invite-btn", 
            icon: UserPlus, 
            title: "Invite User", 
            content: "Click this button to invite a new user to your organization.",
            requireClick: true 
        },
        { 
            target: "#invite-email-field", 
            icon: EnvelopeSimple, 
            title: "User Email", 
            content: "Enter the email address of the person you want to invite.",
            blockTargetInteraction: true 
        },
        { 
            target: "#invite-role-field", 
            icon: ShieldCheck, 
            title: "User Role", 
            content: "Assign an appropriate role to determine their permissions.",
            blockTargetInteraction: true 
        },
        { 
            target: "#invite-profile-field", 
            icon: Table, 
            title: "Profile Access", 
            content: "Select which profiles this user should be allowed to access.",
            blockTargetInteraction: true 
        },
        { 
            target: "#invite-submit-btn", 
            icon: CheckCircle, 
            title: "Send Invitation", 
            content: "Click 'Send Invitation' to email the invite link to the user.",
            blockTargetInteraction: true 
        },
        { 
            target: "#invite-cancel-btn", 
            icon: XCircle, 
            title: "Close Modal", 
            content: "Click 'Cancel' to close the modal without inviting.",
            requireClick: true
        }
    ]
};

tourRegistry.register(usersTourConfig);
