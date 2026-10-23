import moment from "moment-timezone";
import { t } from "i18next";
import React, { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { CustomNoRowsOverlay } from "../../../../common/grid/AgTable";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import CustomCVRTag from "../../../../common/grid/CustomCVRTag";
import { CampaignNameCell } from "../../../../utility/campaignNavigation";

const ProductCampagin = ({ data, visibleColumns }) => {

    const checkHide = (title) => Boolean(visibleColumns?.length && !visibleColumns?.find((col) => col?.title === title));

    const columnDefs = useMemo(() => [

        // ── Product Details ─────────────────────────────
        {
            headerName: t("Campaign Name"),
            field: "name",
            pinned: "left",
            minWidth: 450,
            flex: 1,
            hide: checkHide("Product Details"),
            cellRenderer: (p) => {
                const row = p.data;
                if (!row) return null;
                return <CampaignNameCell row={row} name={row?.name} showStatusDot={true} />;
            }
        },

        // ── Spend ───────────────────────────────────────
        {
            headerName: t("spend"),
            field: "spend",
            minWidth: 120,
            hide: checkHide("Spend"),
            cellRenderer: (p) => <>{CurrencyCode(p.value)}</>
        },

        // ── Sales ───────────────────────────────────────
        {
            headerName: t("sales"),
            field: "sales",
            minWidth: 120,
            hide: checkHide("Sales"),
            cellRenderer: (p) => <>{CurrencyCode(p.value)}</>
        },

        // ── ROAS ────────────────────────────────────────
        {
            headerName: t("roas"),
            field: "roas",
            minWidth: 100,
            hide: checkHide("ROAS"),
            cellRenderer: (p) => <>{p.value ?? "N/A"}</>
        },

        // ── Impressions ─────────────────────────────────
        {
            headerName: t("impressions"),
            field: "impressions",
            minWidth: 130,
            hide: checkHide("Impressions"),
            cellRenderer: (p) => <>{CurrencyFormat(p.value ?? 0)}</>
        },

        // ── Clicks ──────────────────────────────────────
        {
            headerName: t("clicks"),
            field: "clicks",
            minWidth: 110,
            hide: checkHide("Clicks"),
            cellRenderer: (p) => <>{CurrencyFormat(p.value ?? 0)}</>
        },

        // ── CTR ─────────────────────────────────────────
        {
            headerName: t("ctr"),
            field: "ctr",
            minWidth: 100,
            hide: checkHide("CTR"),
            cellRenderer: (p) => <>{p.value ? `${p.value}%` : "N/A"}</>
        },

        // ── CVR ─────────────────────────────────────────
        {
            headerName: t("cvr"),
            field: "conversionRate",
            minWidth: 100,
            hide: checkHide("CVR"),
            cellRenderer: (p) => <>{p.value ? `${p.value}%` : "N/A"}</>
        },

        // ── Performance ─────────────────────────────────────────
        {
            headerName: t("performance"),
            field: "conversionRate",
            minWidth: 100,
            hide: checkHide("Performance CVR"),
            cellRenderer: (params) => <CustomCVRTag value={params?.value} isValueShow={false} />,
        },

        // ── CPC ─────────────────────────────────────────
        {
            headerName: t("cpc"),
            field: "cpc",
            minWidth: 100,
            hide: checkHide("CPC"),
            cellRenderer: (p) => <>{CurrencyCode(p.value)}</>
        },

        // ── Orders ──────────────────────────────────────
        {
            headerName: t("Orders"),
            field: "orders",
            minWidth: 110,
            hide: checkHide("Orders"),
            cellRenderer: (p) => <>{CurrencyFormat(p.value ?? 0)}</>
        },

        // ── ACOS ────────────────────────────────────────
        {
            headerName: t("acos"),
            field: "acos",
            minWidth: 100,
            hide: checkHide("ACOS"),
            cellRenderer: (p) => <>{`${p.value}%`}</>
        }

    ], [visibleColumns]);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        suppressMovable: false,
    }), []);

    return (
        <div className="p-0 bg-white dark:bg-transparent rounded-lg">
            <div
                className="ag-theme-alpine iq-ag-table"
                id="campaign-inner-table"
                style={{ width: "100%", height: "300px" }}
            >
                <AgGridReact
                    rowData={data ?? []}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    sortingOrder={["asc", "desc"]}
                    suppressRowClickSelection={true}
                    suppressCellFocus={true}
                    rowHeight={40}
                    headerHeight={40}
                    suppressHorizontalScroll={false}
                    domLayout="normal"
                    noRowsOverlayComponent={CustomNoRowsOverlay}
                />
            </div>
        </div>
    );
};

export default ProductCampagin;