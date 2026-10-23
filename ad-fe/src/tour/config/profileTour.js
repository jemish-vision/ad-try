import { tourRegistry } from '../TourRegistry';
import {
    User, EnvelopeSimple, Phone, ShieldCheck, Lock, Upload, ImageSquare, Buildings, CheckCircle, XCircle, Info
} from '@phosphor-icons/react';

export const profileTourConfig = {
    id: "profileTour",
    title: "Profile Settings Tour",
    steps: [
        { target: "#profile-info-section", icon: Info, title: "Profile Information", content: "Update your personal details and profile picture here.", blockTargetInteraction: true },
        { target: "#profile-password-btn", icon: Lock, title: "Change Password", content: "Click here to update your account password securely.", blockTargetInteraction: true },
        { target: "#profile-picture-upload", icon: ImageSquare, title: "Upload Image", content: "Upload a new profile picture. Supported formats are JPG, PNG, GIF, WEBP up to 2MB.", blockTargetInteraction: true },
        { target: "#profile-fullname-wrapper", icon: User, title: "Full Name", content: "Update your full name.", blockTargetInteraction: true },
        { target: "#profile-email-wrapper", icon: EnvelopeSimple, title: "Email Address", content: "Your registered email address. This field is read-only.", blockTargetInteraction: true },
        { target: "#profile-phone-wrapper", icon: Phone, title: "Phone Number", content: "Update your contact phone number.", blockTargetInteraction: true },
        { target: "#profile-save-btn", icon: CheckCircle, title: "Update and Save", content: "Click to save any changes made to your profile details.", blockTargetInteraction: true },
        { target: "#profile-2fa-section", icon: ShieldCheck, title: "Manage 2FA Authentication", content: "Add an extra layer of security to your account by configuring two-factor authentication.", blockTargetInteraction: true },
        { target: "#profile-orgs-section", icon: Buildings, title: "Organizations", content: "Manage the organizations you own or are a member of.", blockTargetInteraction: true },
        { target: "#profile-own-orgs", icon: Info, title: "Own Organizations Manage", content: "Manage the organization that you own. You can rename it from here.", blockTargetInteraction: true },
        { target: "#profile-member-orgs", icon: Info, title: "Organizations You Belong To", content: "List of organizations where you are a member.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(profileTourConfig);
