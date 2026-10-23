import { tourRegistry } from '../TourRegistry';
import {
    CalendarBlank, Cards, MapPin, Tag, Table
} from '@phosphor-icons/react';

export const warehouseTourConfig = {
    id: "warehouse",
    title: "Warehouse Inventory Tour",
    steps: [
        {
            target: "#warehouse-date-picker",
            icon: CalendarBlank,
            title: "Report Date Filter",
            content: "Select the specific ledger report date to view warehouse snapshot balances.",
            blockTargetInteraction: true
        },
        {
            target: "#warehouse-kpi-cards",
            icon: Cards,
            title: "Warehouse Stock KPIs",
            content: "Track total in-warehouse units, inter-FC in-transit movements, unfulfillable units, and estimated storage fees.",
            blockTargetInteraction: true
        },
        {
            target: "#warehouse-geo-distribution",
            icon: MapPin,
            title: "State-wise Distribution",
            content: "Inspect geographic breakdown of inventory units and active fulfillment centers across different states.",
            blockTargetInteraction: true
        },
        {
            target: "#warehouse-tabs",
            icon: Tag,
            title: "Inventory Views",
            content: "Switch between the FC Inventory Ledger, Monthly Storage Fees audit, and Warehouse Master directory.",
            blockTargetInteraction: true
        },
        {
            target: "#warehouse-main-grid",
            icon: Table,
            title: "Fulfillment Center Grid",
            content: "Examine detailed SKU-by-SKU starting balances, receipts, customer shipments, returns, and ending warehouse balances.",
            blockTargetInteraction: true
        }
    ]
};

tourRegistry.register(warehouseTourConfig);
