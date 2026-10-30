import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import moment from "moment-timezone";
import { t } from 'i18next';
import React, { useCallback, useContext, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "../../../../components/ui/card";
import CurrencyCode from '../../../../helper/currencyCode/CurrencyCode';
import CurrencyFormat from '../../../../helper/currencyCode/CurrencyFormat';
import TypeShortName from '../../../../helper/typeShortName/TypeShortName';
import InlineEditPopup from "../../../../helper/modal/InlineEditPopup";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiUpdatePlacementBid } from "../../../../api-wrapper/placement/ApiPlacement";
import { Toast } from "../../../../helper/links/Link";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";
import { AgGridReact } from "ag-grid-react";
import { CustomNoRowsOverlay } from "../../../../common/grid/AgTable";

const Placement = (props) => {
  const { t } = useTranslation();
    const { profileId, currencyCode } = useContext(ProfileContext);

    const {
        data,
        visibleColumns,
        placementEdits,
        handleSubmit,
    } = props

    const updatePlacementBid = async (campaignId, placement, newBid) => {

        const payload = {
            profileId: profileId?.value,
            campaignIds: [campaignId],
            ...(Boolean(placement === "Top of Search") && { topOfSearchBid: newBid }),
            ...(Boolean(placement === "Rest of Search") && { restOfSearchBid: newBid }),
            ...(Boolean(placement === "Product pages") && { productPageBid: newBid }),
        };

        await ApiUpdatePlacementBid(payload)
            .then(async (e) => {
                if (e?.isSuccess) {
                    Toast.success(e?.message);
                    handleSubmit()
                } else {
                    Toast.error(e?.message);
                }
            })
            .catch((e) => {
                Toast.error(t("Something went wrong"));
            });
    };

    // Check if a column should be hidden based on visibleColumns from parent
    const checkHide = (title) => Boolean(visibleColumns?.length && !visibleColumns?.find((col) => col?.title === title));

    // ── Column definitions ─────────────────────────────────────────────────
    const columnDefs = useMemo(() => [
        // ── Placement ─────────────────────────────────────────────────────────
        {
            headerName: t("placement"),
            field: "placement",
            minWidth: 160,
            flex: 1,
            pinned: "left",
            sortable: true,
            resizable: true,
            hide: checkHide("Campaign Name"),
            cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
        },

        // ── Health Score ──────────────────────────────────────────────────────
        {
            headerName: t("Health Score"),
            field: "healthScore",
            minWidth: 130,
            sortable: true,
            resizable: true,
            hide: checkHide("Health Score"),
            cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
        },

        // ── Bid Adjustment ────────────────────────────────────────────────────
        {
            headerName: t("bid Adjustment"),
            field: "placementModifier",
            minWidth: 150,
            sortable: true,
            resizable: true,
            hide: checkHide("Bid Adjustment"),
            cellRenderer: (params) => {
                const row = params.data;
                const currentValue =
                    placementEdits?.[row?.campaignId]?.[row?.placement] ??
                    row?.placementModifier ??
                    "";
                return (
                    <InlineEditPopup
                        value={Number(currentValue)}
                        formatter={(v) => CurrencyFormat(v)}
                        title={t("Bid")}
                        currency={currencyCode}
                        onSave={async (newBid) =>
                            await updatePlacementBid(row?.campaignId, row?.placement, newBid)
                        }
                        append={"%"}
                        disabled={!PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE)}
                    />
                );
            },
        },

        // ── Target ACOS ───────────────────────────────────────────────────────
        {
            headerName: t("Target Acos"),
            field: "targetACOS",
            minWidth: 130,
            sortable: true,
            resizable: true,
            hide: checkHide("Target ACOS"),
            cellRenderer: (params) => (
                <>{params.value ? `${params.value}%` : "N/A"}</>
            ),
        },

        // ── Delta ACOS ────────────────────────────────────────────────────────
        {
            headerName: t("Delta ACOS"),
            field: "deltaACOS",
            minWidth: 120,
            sortable: true,
            resizable: true,
            hide: checkHide("Delta ACOS"),
            cellRenderer: (params) => {
                const delta = params.value;
                if (delta === null || delta === undefined)
                    return <span className="text-gray-500">N/A</span>;
                let className = "text-secondary font-semibold";
                if (delta > 0) className = "text-danger font-semibold";
                else if (delta < 0) className = "text-success font-semibold";
                return (
                    <span className={className}>
                        {delta > 0 ? `+${delta}` : delta}
                    </span>
                );
            },
        },

        // ── Target CPC ───────────────────────────────────────────────────────
        {
            headerName: t("target CPC"),
            field: "targetCPC",
            minWidth: 120,
            sortable: true,
            resizable: true,
            hide: checkHide("Target CPC"),
            cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
        },

        // ── New Bid Adjustment ────────────────────────────────────────────────
        {
            headerName: t("new bid Adjustment"),
            field: "newbidAdjustment",
            minWidth: 150,
            sortable: true,
            resizable: true,
            hide: checkHide("New Bid Adjustment"),
            cellRenderer: (params) => (
                <>
                    {params.value !== null && params.value !== undefined
                        ? `${parseFloat(params.value).toFixed(2)}%`
                        : "N/A"}
                </>
            ),
        },

        // ── Type ──────────────────────────────────────────────────────────────
        {
            headerName: t("type"),
            field: "type",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("Type"),
            cellRenderer: (params) => (
                <>{params.value ? TypeShortName(params.value) : "N/A"}</>
            ),
        },

        // ── Budget ────────────────────────────────────────────────────────────
        {
            headerName: t("Budget"),
            field: "budget",
            minWidth: 120,
            sortable: true,
            resizable: true,
            hide: checkHide("Budget"),
            cellRenderer: (params) => (
                <>{params.value ? CurrencyCode(params.value) : "N/A"}</>
            ),
        },

        // ── Time in Budget ────────────────────────────────────────────────────
        {
            headerName: t("Time in Budget"),
            field: "timeInBudget",
            minWidth: 140,
            sortable: true,
            resizable: true,
            hide: checkHide("Time in Budget"),
            cellRenderer: (params) => (
                <>{params.value ? `${params.value}%` : "N/A"}</>
            ),
        },

        // ── Spend ─────────────────────────────────────────────────────────────
        {
            headerName: t("spend"),
            field: "spend",
            minWidth: 110,
            sortable: true,
            resizable: true,
            hide: checkHide("Spend"),
            cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
        },

        // ── Sales ─────────────────────────────────────────────────────────────
        {
            headerName: t("sales"),
            field: "sales",
            minWidth: 110,
            sortable: true,
            resizable: true,
            hide: checkHide("Sales"),
            cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
        },

        // ── ACOS ──────────────────────────────────────────────────────────────
        {
            headerName: t("acos"),
            field: "acos",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("ACOS"),
            cellRenderer: (params) => <>{`${params.value}%`}</>,
        },

        // ── ROAS ──────────────────────────────────────────────────────────────
        {
            headerName: t("roas"),
            field: "roas",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("ROAS"),
            cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
        },

        // ── Orders ────────────────────────────────────────────────────────────
        {
            headerName: t("Orders"),
            field: "orders",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("Orders"),
            cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
        },

        // ── Impressions ───────────────────────────────────────────────────────
        {
            headerName: t("impressions"),
            field: "impressions",
            minWidth: 120,
            sortable: true,
            resizable: true,
            hide: checkHide("Impressions"),
            cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
        },

        // ── CPC ───────────────────────────────────────────────────────────────
        {
            headerName: t("cpc"),
            field: "cpc",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("CPC"),
            cellRenderer: (params) => <>{CurrencyCode(params.value)}</>,
        },

        // ── Clicks ────────────────────────────────────────────────────────────
        {
            headerName: t("clicks"),
            field: "clicks",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("Clicks"),
            cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
        },

        // ── Conversion ────────────────────────────────────────────────────────
        {
            headerName: t("conversion"),
            field: "conversion",
            minWidth: 120,
            sortable: true,
            resizable: true,
            hide: checkHide("Conversion"),
            cellRenderer: (params) => (
                <>{params.value ? `${params.value}%` : "N/A"}</>
            ),
        },

        // ── CVR ───────────────────────────────────────────────────────────────
        {
            headerName: t("cvr"),
            field: "cvr",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("CVR"),
            cellRenderer: (params) => (
                <>{params.value ? `${params.value}%` : "N/A"}</>
            ),
        },

        // ── CTR ───────────────────────────────────────────────────────────────
        {
            headerName: t("ctr"),
            field: "ctr",
            minWidth: 100,
            sortable: true,
            resizable: true,
            hide: checkHide("CTR"),
            cellRenderer: (params) => (
                <>{params.value ? `${params.value}%` : "N/A"}</>
            ),
        },

        // ── Bid Strategy ──────────────────────────────────────────────────────
        {
            headerName: t("bidStartegy"),
            field: "bidStrategy",
            minWidth: 130,
            sortable: true,
            resizable: true,
            hide: checkHide("Bid Startegy"),
            cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
        },

        // ── Start Date ────────────────────────────────────────────────────────
        {
            headerName: t("startDate"),
            field: "startDate",
            minWidth: 130,
            sortable: true,
            resizable: true,
            hide: checkHide("Start Date"),
            cellRenderer: (params) => (
                <>{params.value ? moment(params.value).format("YYYY-MM-DD") : "N/A"}</>
            ),
        },

        // ── End Date ──────────────────────────────────────────────────────────
        {
            headerName: t("endDate"),
            field: "endDate",
            minWidth: 130,
            sortable: true,
            resizable: true,
            hide: checkHide("End Date"),
            cellRenderer: (params) => (
                <>{params.value ? moment(params.value).format("YYYY-MM-DD") : "N/A"}</>
            ),
        },

        // ── Budget Type ───────────────────────────────────────────────────────
        {
            headerName: t("budgetType"),
            field: "budgetType",
            minWidth: 130,
            sortable: true,
            resizable: true,
            hide: checkHide("Budget Type"),
            valueFormatter: (params) => (params.value ? String(params.value).toUpperCase() : "N/A"),
            cellRenderer: (params) => <>{params.value ? String(params.value).toUpperCase() : "N/A"}</>,
        },
    ], [visibleColumns, placementEdits, currencyCode]);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        suppressMovable: false,
    }), []);

    return (
        <div className="px-3 pb-3">
            <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0">
                    <div
                        className="ag-theme-alpine iq-ag-table"
                        id="campaign-inner-table"
                        style={{ width: "100%", height: "180px" }}
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
                </CardContent>
            </Card>
        </div>
    )
}

export default Placement