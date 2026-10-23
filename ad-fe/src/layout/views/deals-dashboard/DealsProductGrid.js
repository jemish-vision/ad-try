import React, { useMemo, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "../../../components/ui/card";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { AgGridReact } from "ag-grid-react";
import { CustomNoRowsOverlay } from "../../../common/grid/AgTable";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";

const DealsProductGrid = ({ data }) => {
    const { t } = useTranslation();
    const { currencyCode } = useContext(ProfileContext);

    const columnDefs = useMemo(() => [
        {
            headerName: t("Product Details"),
            field: "productName",
            pinned: "left",
            minWidth: 350,
            flex: 1,
            cellRenderer: (p) => {
                const row = p.data;
                return (
                    <div className="flex flex-col justify-center h-full">
                        <div className="text-truncate font-semibold" title={row?.productName}>
                            {row?.productName || t("Unknown Product")}
                        </div>
                        <div className="small text-gray-500" style={{ lineHeight: "1" }}>
                            {t("ASIN:")} {row?.asin || "-"}
                        </div>
                    </div>
                );
            }
        },
        {
            headerName: t("Glance Views"),
            field: "productGlanceViews",
            minWidth: 120,
            cellRenderer: (p) => (p.value || 0).toLocaleString()
        },
        {
            headerName: t("Units Sold"),
            field: "productUnitsSold",
            minWidth: 120,
            cellRenderer: (p) => (p.value || 0).toLocaleString()
        },
        {
            headerName: t("Conv. Rate"),
            colId: "conversionRate",
            minWidth: 120,
            cellRenderer: (p) => {
                const row = p.data;
                const rate = row.productGlanceViews > 0 ? ((row.productUnitsSold / row.productGlanceViews) * 100).toFixed(2) : 0;
                return `${rate}%`;
            }
        },
        {
            headerName: t("Sales"),
            field: "productRevenue",
            minWidth: 120,
            flex: 1,
            cellRenderer: (p) => CurrencyCode(p.value || 0, currencyCode || "INR")
        }
    ], [currencyCode, t]);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        suppressMovable: false,
    }), []);

    return (
        <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="p-0">
                <div
                    id="deals-product-grid"
                    className="ag-theme-alpine iq-ag-table"
                    style={{ width: "100%" }}
                >
                    <AgGridReact
                        rowData={data ?? []}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                        sortingOrder={["asc", "desc"]}
                        suppressRowClickSelection={true}
                        suppressCellFocus={true}
                        rowHeight={50}
                        headerHeight={40}
                        suppressHorizontalScroll={false}
                        domLayout="autoHeight"
                        noRowsOverlayComponent={CustomNoRowsOverlay}
                    />
                </div>
            </CardContent>
        </Card>
    );
};

export default DealsProductGrid;
