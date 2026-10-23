import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, DownloadSimple, Table
} from '@phosphor-icons/react';

export const asanaUserTourConfig = {
    id: "asana-users",
    title: "Asana Users Tour",
    steps: [
        { target: "#asana-users-search", icon: MagnifyingGlass, title: "Search Users", content: "Easily search for specific Asana users by name or email.", blockTargetInteraction: true },
        { target: "#asana-users-fetch-btn", icon: DownloadSimple, title: "Fetch Users", content: "Click here to synchronize and fetch the latest user list from Asana.", blockTargetInteraction: true },
        { target: "#asanaUsers-main-table", icon: Table, title: "Users Grid", content: "View all your Asana users. Use the action menu to assign support tickets to specific users.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(asanaUserTourConfig);
