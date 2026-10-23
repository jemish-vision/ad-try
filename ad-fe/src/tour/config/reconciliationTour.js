import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Calendar, Table, CheckCircle, Gear, HandCoins, ListBullets, X
} from '@phosphor-icons/react';

export const reconciliationTourConfig = {
    id: "reconciliation",
    title: "Reconciliation & Reimbursement Tour",
    steps: [
        { target: "#recon-tab-0", icon: HandCoins, title: "Reconciliation Tab", content: "Switch to this tab to track missing units and damaged inventory.", requireClick: true },
        { target: "#recon-search", icon: MagnifyingGlass, title: "Search Shipments", content: "Search for specific shipments using their name or ID.", blockTargetInteraction: true },
        { target: "#recon-status", icon: CheckCircle, title: "Status Filter", content: "Filter shipments by their current status.", blockTargetInteraction: true },
        { target: "#recon-date-picker", icon: Calendar, title: "Date Range", content: "Select a date range to filter your shipments.", blockTargetInteraction: true },
        { target: "#recon-settings", icon: Gear, title: "Settings", content: "Click here to open the global reconciliation settings.", requireClick: true },
        { target: "#recon-settings-drawer", icon: Gear, title: "Settings Drawer", content: "Configure notifications and alerts for reimbursement activities.", blockTargetInteraction: true },
        { target: "#recon-settings-close", icon: X, title: "Close Settings", content: "Close the settings drawer to continue.", requireClick: true },
        { target: "#reconciliation-table", icon: Table, title: "Reconciliation Grid", content: "View all your shipments and identify any discrepancies between shipped and received units.", blockTargetInteraction: true },
        
        { target: "#recon-tab-1", icon: HandCoins, title: "Reimbursement Tab", content: "Click this tab to monitor your reimbursement claims and recovered amounts.", requireClick: true },
        { target: "#reimbursement-search", icon: MagnifyingGlass, title: "Search Reimbursements", content: "Search for specific reimbursements.", blockTargetInteraction: true },
        { target: "#reimbursement-reason", icon: ListBullets, title: "Reason Filter", content: "Filter reimbursements by specific reasons.", blockTargetInteraction: true },
        { target: "#reimbursement-date-picker", icon: Calendar, title: "Date Selection", content: "Filter reimbursements by approval date.", blockTargetInteraction: true },
        { target: "#reimbursement-table", icon: Table, title: "Reimbursement Grid", content: "View detailed information about your reimbursed quantities and amounts.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(reconciliationTourConfig);
