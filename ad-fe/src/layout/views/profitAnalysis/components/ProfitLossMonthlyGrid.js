import React, { useMemo, forwardRef, useImperativeHandle } from "react";
import { exportGridToExcel } from "../../../../utility/exportExcel";
import AgTable from "../../../../common/grid/AgTable";
import moment from "moment";
import { useTranslation } from "react-i18next";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";

const formatCurrency = (val) => {
    if (val == null || isNaN(val)) return CurrencyCode(0);
    const formatted = CurrencyCode(Math.abs(val));
    return val < 0 ? `-${formatted}` : formatted;
};


const formatPercent = (val) => {
    if (val == null || isNaN(val)) return "0%";
    return `${Number(val).toFixed(0)}%`;
};

const formatNumber = (val) => {
    if (val == null || isNaN(val)) return "0";
    const formatted = new Intl.NumberFormat('en-IN').format(Math.abs(val));
    return val < 0 ? `-${formatted}` : formatted;
};

const METRIC_ROWS = [
    { field: "grossQty", label: "Gross Qty", type: "number" },
    { field: "cancelledQty", label: "Cancelled Qty", type: "number" },
    { field: "returnedQty", label: "Return Qty", type: "number" },
    { field: "claimedQty", label: "Claimed Qty", type: "number" },
    { field: "totalQty", label: "Net Qty", type: "number", highlight: true },

    { field: "grossSales", label: "Gross Sales", type: "currency" },
    { field: "cancelledSales", label: "Cancelled Sales", type: "currency" },
    { field: "returnedSales", label: "Return Sales", type: "currency" },
    { field: "claimedSales", label: "Claimed Sales", type: "currency" },
    { field: "totalSales", label: "Net Sales", type: "currency", highlight: true },

    { field: "productCost", label: "Product Cost", type: "currency" },
    { field: "amazonFees", label: "Amazon Fees", type: "currency" },
    { field: "shippingFees", label: "Shipping Fees", type: "currency" },
    { field: "adSpend", label: "Ad Spend", type: "currency" },
    { field: "otherCost", label: "Other Cost", type: "currency" },

    { field: "totalProfit", label: "Total Profit (INR)", type: "currency", highlight: true },

    { field: "grossASP", label: "Gross ASP", type: "currency" },
    { field: "netASP", label: "Net ASP", type: "currency" },
    { field: "returnPercent", label: "Return %", type: "percent" },
    { field: "tacos", label: "TACOS", type: "percent" },
    { field: "profitMargin", label: "Profit Margin", type: "percent" },
];

export const ProfitLossMonthlyGrid = forwardRef(({ rowData, loading, isDark }, ref) => {
    const { t } = useTranslation();

    const columnsAndData = useMemo(() => {
        let monthsData = rowData || [];

        // If no data, generate last 4 months with 0s
        if (monthsData.length === 0) {
            monthsData = Array.from({ length: 4 }).map((_, i) => ({
                month: moment().subtract(3 - i, 'months').format('MMM/YY')
            }));
        }
        // Columns definition
        const colDefs = [
            {
                headerName: t("Metric"),
                field: "metricLabel",
                pinned: "left",
                width: 220,
                sortable: false,
                filter: false,
                cellStyle: (params) => {
                    // Pinned column MUST have a background color otherwise they are transparent and overlap horizontally
                    const base = { display: 'flex', alignItems: 'center', height: '100%', backgroundColor: isDark ? '#1e293b' : '#ffffff' };
                    if (params.data.highlight) return { ...base, fontWeight: "bold", color: isDark ? "#38bdf8" : "#0f172a", backgroundColor: isDark ? "#0c4a6e" : "#e0f2fe" };
                    return { ...base, color: isDark ? "#cbd5e1" : "#475569", fontWeight: "500" };
                },
                cellClass: (params) => params.data?.highlight ? 'monthly-highlight-neutral' : ''
            }
        ];

        // Add a column for each month
        monthsData.forEach((mData, index) => {
            colDefs.push({
                headerName: mData.month,
                field: mData.month,
                minWidth: 160,
                flex: 1,
                sortable: false,
                filter: false,
                cellRenderer: (params) => {
                    const val = params.value;
                    const pct = params.data[`${params.colDef.field}_pct`];

                    if (pct !== undefined && pct !== null) {
                        const isPositive = pct > 0;
                        const isNegative = pct < 0;
                        const pctColor = isPositive ? (isDark ? '#4ade80' : '#16a34a') : (isNegative ? (isDark ? '#f87171' : '#dc2626') : (isDark ? '#94a3b8' : '#94a3b8'));
                        const pctText = `(${pct.toFixed(0)}%)`;

                        return (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', width: '100%', gap: '12px' }}>
                                <span>{val}</span>
                                <span style={{ color: pctColor, fontSize: '0.75rem', minWidth: '40px', textAlign: 'left', fontWeight: 'bold' }}>{pctText}</span>
                            </div>
                        );
                    }
                    return <span>{val}</span>;
                },
                cellStyle: (params) => {
                    const baseStyle = { textAlign: "right", display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' };
                    const pct = params.data[`${params.colDef.field}_pct`];

                    if (params.data.highlight) {
                        if (pct > 0) {
                            return { ...baseStyle, fontWeight: "bold", backgroundColor: isDark ? "#052e16" : "#dcfce7", color: isDark ? "#4ade80" : "#166534" };
                        } else if (pct < 0) {
                            return { ...baseStyle, fontWeight: "bold", backgroundColor: isDark ? "#450a0a" : "#fee2e2", color: isDark ? "#f87171" : "#991b1b" };
                        }
                        return { ...baseStyle, fontWeight: "bold", backgroundColor: isDark ? "#0c4a6e" : "#e0f2fe", color: isDark ? "#38bdf8" : "#0369a1" };
                    }

                    const rawVal = params.data[`${params.colDef.field}_raw`] || 0;
                    if (rawVal < 0) {
                        return { ...baseStyle, color: isDark ? "#f87171" : "#ef4444" };
                    }
                    return { ...baseStyle, color: isDark ? "#cbd5e1" : "#475569" };
                },
                cellClass: (params) => {
                    if (params.data?.highlight) {
                        const pct = params.data[`${params.colDef.field}_pct`];
                        if (pct > 0) return 'monthly-highlight-positive';
                        if (pct < 0) return 'monthly-highlight-negative';
                        return 'monthly-highlight-neutral';
                    }
                    return '';
                }
            });
        });

        // Transpose Data
        const transposedData = METRIC_ROWS.map(metric => {
            const row = { metricLabel: t(metric.label), highlight: metric.highlight };

            monthsData.forEach((mData, index) => {
                const rawValue = mData[metric.field] || 0;
                let formattedValue = "0";

                if (metric.type === "currency") {
                    formattedValue = formatCurrency(rawValue);
                } else if (metric.type === "percent") {
                    formattedValue = formatPercent(rawValue);
                } else {
                    formattedValue = formatNumber(rawValue);
                }

                row[mData.month] = formattedValue;
                row[`${mData.month}_raw`] = rawValue;

                // Calculate MoM percentage if not the first month and not a percent type
                if (index > 0 && metric.type !== "percent") {
                    const prevValue = monthsData[index - 1][metric.field] || 0;
                    if (prevValue !== 0) {
                        const pct = ((rawValue - prevValue) / Math.abs(prevValue)) * 100;
                        row[`${mData.month}_pct`] = pct;
                    } else if (rawValue > 0) {
                        row[`${mData.month}_pct`] = 100;
                    } else if (rawValue < 0) {
                        row[`${mData.month}_pct`] = -100;
                    } else {
                        row[`${mData.month}_pct`] = 0;
                    }
                }
            });

            return row;
        });

        return { colDefs, transposedData };
    }, [rowData, isDark]);

    useImperativeHandle(ref, () => ({
        exportToExcel: () => {
            exportGridToExcel(columnsAndData.transposedData, columnsAndData.colDefs, "monthly_profit_loss.xlsx");
        }
    }));

    const defaultColDef = useMemo(() => {
        return {
            resizable: true,
            sortable: false,
        };
    }, []);

    const hasData = rowData && rowData.length > 0;

    return (
        <div className="w-full">
            <AgTable rowData={columnsAndData.transposedData}
                columnDefs={columnsAndData.colDefs}
                defaultColDef={defaultColDef}
                totalRecords={hasData ? METRIC_ROWS.length : 0}
                perPage={100}
                currentPage={1}
                height="650px"
                loading={loading}
                suppressPaginationPanel={true}
                showPagination={false}
            />
        </div>
    );
});
