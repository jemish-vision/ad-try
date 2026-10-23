import React, { useMemo, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { exportGridToExcel } from "../../../../utility/exportExcel";
import AgTable from "../../../../common/grid/AgTable";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";

const formatCurrency = (val) => {
    if (val == null) return CurrencyCode(0);
    return CurrencyCode(val);
};


const formatPercent = (val) => {
    if (val == null) return "0%";
    return `${Number(val).toFixed(1)}%`;
};

export const ProductAnalysisGrid = forwardRef(({
    rowData,
    loading,
    totalRecords = 0,
    perPage = 25,
    currentPage = 1,
    onPageChange,
    onPerPageChange,
    onSortChanged
}, ref) => {
    const { t } = useTranslation();

    const columnDefs = useMemo(() => [
        {
            headerName: t("Product Details"),
            field: "productDetails",
            exportFormatter: (val) => val ? `${val.name || ""} - SKU: ${val.sku || ""} - ASIN: ${val.asin || ""}` : "",
            width: 340,
            pinned: "left",
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const { name, sku, asin, image } = params.value || {};
                return (
                    <div className="flex items-center gap-3 py-2 w-full">
                        {image ? (
                            <img src={image} alt={sku} className="w-10 h-10 object-contain rounded border border-gray-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-800" />
                        ) : (
                            <div className="w-10 h-10 bg-gray-200 dark:bg-slate-700 rounded flex items-center justify-center text-xs text-gray-500 dark:text-slate-400 shrink-0">{t("No Img")}</div>
                        )}
                        <div className="flex flex-col min-w-0 flex-1 whitespace-normal">
                            <span className="font-semibold text-xs leading-tight text-gray-800 dark:text-slate-200 line-clamp-2" title={name}>{name || t("Unknown Product")}</span>
                            <span className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{t("SKU:")} <span className="font-medium text-blue-600 dark:text-blue-400">{sku}</span> | {t("ASIN:")} <span className="font-medium text-blue-600 dark:text-blue-400">{asin}</span></span>
                        </div>
                    </div>
                );
            }
        },
        {
            headerName: t("Status"),
            field: "statusTag",
            width: 145,
            pinned: "left",
            exportFormatter: (val) => {
                const str = val || "Profitable";
                if (str.includes("Ad Bleeding")) return t("Ad Bleeding");
                if (str.includes("Ad Loss")) return t("Ad Loss");
                if (str.includes("High Return")) return t("High Return");
                if (str.includes("Fee Heavy")) return t("Fee Heavy");
                if (str.includes("Loss-Making")) return t("Loss-Making");
                return t("Profitable");
            },
            cellRenderer: (p) => {
                const rawTag = p.value || "Profitable";
                let bg = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80";
                let icon = "🟢";
                let labelKey = "Profitable";

                if (rawTag.includes("Ad Bleeding")) {
                    bg = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80";
                    icon = "🟠";
                    labelKey = "Ad Bleeding";
                } else if (rawTag.includes("Ad Loss")) {
                    bg = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80";
                    icon = "🔴";
                    labelKey = "Ad Loss";
                } else if (rawTag.includes("High Return")) {
                    bg = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80";
                    icon = "⚠️";
                    labelKey = "High Return";
                } else if (rawTag.includes("Fee Heavy")) {
                    bg = "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80";
                    icon = "📦";
                    labelKey = "Fee Heavy";
                } else if (rawTag.includes("Loss-Making")) {
                    bg = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80";
                    icon = "🔴";
                    labelKey = "Loss-Making";
                }

                return (
                    <div className="flex items-center h-full">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${bg}`}>
                            <span>{icon}</span>
                            <span>{t(labelKey)}</span>
                        </span>
                    </div>
                );
            }
        },

        // --- Original Quantities & Returns ---
        { headerName: t("Gross Qty"), field: "grossQty", width: 100 },
        { headerName: t("Return Qty"), field: "returnQty", width: 100, cellStyle: { color: "#ef4444" } },
        { headerName: t("Return Per."), field: "returnPercent", width: 105, valueFormatter: (p) => formatPercent(p.value) },
        { headerName: t("Net Qty"), field: "netQty", width: 100 },

        // --- Original Sales & Revenue ---
        { headerName: t("Gross Sales (INR)"), field: "grossSales", width: 135, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("Return Sales (INR)"), field: "returnSales", width: 135, cellStyle: { color: "#ef4444" }, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("Net Sales (INR)"), field: "netSales", width: 135, valueFormatter: (p) => formatCurrency(p.value) },

        // --- Original Costs & Margins ---
        { headerName: t("Product Cost (INR)"), field: "productCost", width: 140, valueFormatter: (p) => formatCurrency(p.value) },
        
        // --- Granular Amazon Fees ---
        { headerName: t("Amazon Fees (INR)"), field: "amazonFees", width: 140, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("Commission (INR)"), field: "commission", width: 130, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("FBA Pick & Pack (INR)"), field: "fbaPickPack", width: 140, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("FBA Weight Fee (INR)"), field: "fbaWeight", width: 140, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("Closing Fees (INR)"), field: "closingFees", width: 130, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("Shipping Fees (INR)"), field: "shippingFees", width: 135, valueFormatter: (p) => formatCurrency(p.value || p.data?.easyShipFees) },

        // --- Advertising Breakdown ---
        { headerName: t("Ad Spend (INR)"), field: "adSpend", width: 130, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("SP Spend (INR)"), field: "spAdSpend", width: 125, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("SB Spend (INR)"), field: "sbAdSpend", width: 125, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("SD Spend (INR)"), field: "sdAdSpend", width: 125, valueFormatter: (p) => formatCurrency(p.value) },
        { headerName: t("TACoS %"), field: "tacos", width: 100, valueFormatter: (p) => formatPercent(p.value) },

        // --- Other Cost & Profitability ---
        { headerName: t("Other Cost (INR)"), field: "otherCost", width: 130, valueFormatter: (p) => formatCurrency(p.value) },
        {
            headerName: t("Profit (INR)"),
            field: "profit",
            width: 130,
            cellRenderer: (p) => {
                const isPos = (p.value || 0) >= 0;
                return (
                    <span className={`font-bold ${isPos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCurrency(p.value)}
                    </span>
                );
            }
        },
        {
            headerName: t("Profit Per."),
            field: "profitPercent",
            width: 110,
            cellRenderer: (p) => {
                const val = p.value || 0;
                const isPos = val >= 0;
                return (
                    <span className={`font-semibold ${isPos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatPercent(val)}
                    </span>
                );
            }
        },

        // --- New Profitability & Break-Even Safeguards ---
        {
            headerName: t("Profit / Order"),
            field: "profitPerOrder",
            width: 125,
            cellRenderer: (p) => {
                const val = p.value || 0;
                const isPos = val >= 0;
                return (
                    <span className={`font-medium ${isPos ? "text-slate-800 dark:text-slate-200" : "text-red-600 dark:text-red-400"}`}>
                        {formatCurrency(val)}
                    </span>
                );
            }
        },
        { headerName: t("Break-Even ACOS"), field: "breakEvenAcos", width: 130, valueFormatter: (p) => formatPercent(p.value) },
        { headerName: t("Break-Even ROAS"), field: "breakEvenRoas", width: 125, valueFormatter: (p) => Number(p.value || 0).toFixed(2) }
    ], [t]);

    useImperativeHandle(ref, () => ({
        exportToExcel: (fullData) => {
            exportGridToExcel(fullData, columnDefs, "sku_true_profit_analysis.xlsx");
        }
    }));

    const defaultColDef = useMemo(() => {
        return {
            resizable: true,
            sortable: true,
            filter: false
        };
    }, []);

    return (
        <div className="w-full">
            <AgTable
                onRefresh={() => onPageChange?.(currentPage)} rowData={rowData || []}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                rowHeight={70}
                totalRecords={totalRecords}
                perPage={perPage}
                currentPage={currentPage}
                onPageChange={onPageChange}
                onPerPageChange={onPerPageChange}
                onSortChanged={onSortChanged}
                height="500px"
                loading={loading}
            />
        </div>
    );
});
