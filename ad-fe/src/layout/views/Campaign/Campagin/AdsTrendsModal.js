import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiCampainListing } from "../../../../api-wrapper/campaign/ApiCampaign";
import DataTable from "react-data-table-component";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import { tableStyles } from "../../../../helper/table/TableStyle";
import moment from "moment";

/* ---------------- ACoS Color Helper ---------------- */
const getAcosClass = (acos) => {
    if (acos <= 30) return "text-success";
    if (acos <= 50) return "text-warning";
    return "text-danger";
};

const AdsTrendsModal = ({ show, onClose }) => {
    const { t } = useTranslation();
    const { profileId, selectedAdType } = useContext(ProfileContext);
    const [loading, setLoading] = useState(false);
    const [tableData, setTableData] = useState([]);

    /* ---------------- Period Definitions ---------------- */
    const PERIODS = [
        { label: "Today", from: 0, to: 0 },
        { label: "Yesterday", from: 1, to: 1 },
        { label: "Last 7 Days", from: 7, to: 1 },
        { label: "Last 30 Days", from: 30, to: 1 },
        { label: "Last 60 Days", from: 59, to: 0 },
    ];

    /* ---------------- Fetch Ads Trends ---------------- */
    const fetchAdsTrends = async () => {
        setLoading(true);
        try {
            const results = await Promise.all(
                PERIODS.map(async (period) => {
                    const fromDate = moment().subtract(period.from, "days").format("YYYY-MM-DD");
                    const toDate = moment().subtract(period.to, "days").format("YYYY-MM-DD");

                    const res = await ApiCampainListing({
                        profileId: profileId.value,
                        fromDate,
                        toDate,
                        filteredCampaignIds: [],
                        customFilter: JSON.stringify({
                            status: { $eq: "ENABLED" },
                        }),
                    });

                    return {
                        period: period.label,
                        spend: res?.totalRow?.spend || 0,
                        sales: res?.totalRow?.sales || 0,
                        acos: res?.totalRow?.acos || 0,
                        roas: res?.totalRow?.roas || 0,
                        orders: res?.totalRow?.orders || 0,
                        cpc: res?.totalRow?.cpc || 0,
                    };
                })
            );

            setTableData(results);
        } catch (error) {
            console.error("Ads Trends Error:", error);
        } finally {
            setLoading(false);
        }
    };

    /* ---------------- Load on Open ---------------- */
    useEffect(() => {
        if (show && profileId?.value && selectedAdType) fetchAdsTrends();
    }, [show, profileId?.value, selectedAdType]);

    /* ---------------- Table Columns ---------------- */
    const columns = [
        {
            name: t("Period"),
            selector: (row) => row.period,
            grow: 2,
            cell: (row) => (
                <div className="font-semibold text-dark" style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    {t(row.period)}
                </div>
            ),
        },
        {
            name: t("Spend"),
            cell: (row) => (
                <div style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    <div className="font-bold text-dark">{CurrencyCode(row.spend)}</div>
                </div>
            ),
        },
        {
            name: t("Sales"),
            cell: (row) => (
                <div style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    <div className="font-bold text-success">
                        {CurrencyCode(row.sales)}
                    </div>
                </div>
            ),
        },
        {
            name: t("ACoS"),
            cell: (row) => (
                <div className="w-full" style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    <div className={`fw-bold ${getAcosClass(row.acos)}`}>
                        {row.acos}%
                    </div>
                    <div className="progress mt-1 bg-secondary bg-opacity-25" style={{ height: 6, borderRadius: "3px" }}>
                        <div className={`progress-bar ${row.acos <= 30 ? "bg-success" : row.acos <= 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${Math.min(row.acos, 100)}%` }} />
                    </div>
                </div>
            ),
        },
        {
            name: t("ROAS"),
            cell: (row) => (
                <div className="font-bold text-primary" style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    {CurrencyFormat(row.roas)}
                </div>
            ),
        },
        {
            name: t("Orders"),
            cell: (row) => (
                <div className="font-bold text-dark" style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    {CurrencyFormat(row.orders)}
                </div>
            ),
        },
        {
            name: t("CPC"),
            cell: (row) => (
                <div className="font-bold text-dark" style={{ fontFamily: "Inter", fontSize: "13.5px" }}>
                    {CurrencyCode(row.cpc)}
                </div>
            ),
        },
    ];

    /* ---------------- Custom Table Styles ---------------- */
    const customTableStyles = {
        ...tableStyles,
        table: {
            style: {
                backgroundColor: 'transparent',
            },
        },
        header: {
            style: {
                backgroundColor: 'transparent',
            },
        },
        headRow: {
            style: {
                background: 'rgba(2, 70, 139, 0.04) !important',
                borderBottom: '1.5px solid rgba(2, 70, 139, 0.08) !important',
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#475569',
            },
        },
        cells: {
            style: {
                border: 'none !important',
            },
        },
        rows: {
            style: {
                background: 'rgba(255, 255, 255, 0.4) !important',
                borderBottom: '1px solid rgba(2, 70, 139, 0.05) !important',
                minHeight: '52px',
                '&:not(:last-of-type)': {
                    borderBottom: '1px solid rgba(2, 70, 139, 0.05) !important',
                },
                '&:hover': {
                    backgroundColor: 'rgba(2, 70, 139, 0.04) !important',
                    cursor: 'pointer',
                }
            },
        },
        progress: {
            style: {
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
            },
        },
    };

    /* ---------------- Render ---------------- */
    return (
        <>
            <style>{`
                .ads-trends-modal .modal-content {
                    background: rgba(255, 255, 255, 0.85) !important;
                    backdrop-filter: blur(16px) saturate(180%) !important;
                    -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
                    border: 1px solid rgba(255, 255, 255, 0.4) !important;
                    border-radius: 20px !important;
                    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12) !important;
                    overflow: hidden !important;
                }
                .ads-trends-modal .modal-header {
                    background: rgba(255, 255, 255, 0.5) !important;
                    border-bottom: 1px solid rgba(2, 70, 139, 0.08) !important;
                    backdrop-filter: blur(8px) !important;
                    -webkit-backdrop-filter: blur(8px) !important;
                    padding: 18px 24px !important;
                }
                .ads-trends-modal .modal-body {
                    background: rgba(248, 250, 252, 0.5) !important;
                    padding: 24px 24px !important;
                }
                .ads-trends-modal .modal-footer {
                    background: rgba(248, 250, 252, 0.6) !important;
                    border-top: 1px solid rgba(2, 70, 139, 0.08) !important;
                    padding: 14px 24px !important;
                }
                .ads-trends-modal .rdt_Table {
                    background: transparent !important;
                }
                
                /* Dark Theme Overrides */
                [data-theme="dark"] .ads-trends-modal .modal-content {
                    background: #151e2e !important;
                    border: 1px solid rgba(59, 130, 246, 0.25) !important;
                    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(59, 130, 246, 0.15) !important;
                }
                [data-theme="dark"] .ads-trends-modal .modal-header {
                    background: #1e293b !important;
                    border-bottom: 1px solid rgba(59, 130, 246, 0.2) !important;
                }
                [data-theme="dark"] .ads-trends-modal .modal-body {
                    background: #151e2e !important;
                }
                [data-theme="dark"] .ads-trends-modal .modal-footer {
                    background: #1e293b !important;
                    border-top: 1px solid rgba(59, 130, 246, 0.2) !important;
                }
                [data-theme="dark"] .ads-trends-modal .modal-header .btn-close {
                    filter: invert(1) grayscale(1) brightness(2) !important;
                }
                [data-theme="dark"] .ads-trends-modal .text-dark {
                    color: #e2e8f0 !important;
                }
                [data-theme="dark"] .ads-trends-modal .rdt_TableCol {
                    color: #94a3b8 !important;
                }
                [data-theme="dark"] .ads-trends-modal .rdt_TableHeadRow {
                    background: rgba(255, 255, 255, 0.03) !important;
                    border-bottom: 1.5px solid rgba(255, 255, 255, 0.08) !important;
                    color: #94a3b8 !important;
                }
                [data-theme="dark"] .ads-trends-modal .rdt_TableRow {
                    background: rgba(255, 255, 255, 0.02) !important;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
                }
                [data-theme="dark"] .ads-trends-modal .rdt_TableRow:hover {
                    background: rgba(255, 255, 255, 0.05) !important;
                }
                
                .ads-trends-modal .rdt_TableCell,
                .ads-trends-modal .rdt_TableCell * {
                    border: none !important;
                    border-right: none !important;
                    border-bottom: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                }
                .ads-trends-modal .rdt_TableCol,
                .ads-trends-modal .rdt_TableCol * {
                    border: none !important;
                    border-right: none !important;
                    border-bottom: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                }
                .ads-trends-modal .rdt_TableRow:hover .rdt_TableCell,
                .ads-trends-modal .rdt_TableRow:focus .rdt_TableCell,
                .ads-trends-modal .rdt_TableRow:hover,
                .ads-trends-modal .rdt_TableRow:focus {
                    border-right: none !important;
                    border-bottom: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                }
                
                /* Make progress/loading container background transparent */
                .ads-trends-modal div:has(> .spinner-border),
                .ads-trends-modal div:has(> * > .spinner-border),
                .ads-trends-modal [role="status"],
                .ads-trends-modal .data_table > div:nth-child(2),
                .ads-trends-modal .data_table > div:nth-child(3) {
                    background-color: transparent !important;
                    background: transparent !important;
                    color: var(--text-primary) !important;
                }
            `}</style>
            <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="w-[92vw] sm:max-w-5xl p-0 gap-0 overflow-hidden border-0 rounded-2xl shadow-xl ads-trends-modal bg-white dark:bg-[#1e293b]">
                    <DialogHeader className="border-b border-slate-100 dark:border-slate-800 p-5 px-6">
                        <DialogTitle>
                            <div className="flex items-center gap-3 text-left">
                                <span className="flex items-center justify-center shrink-0 w-9 h-9 rounded-lg bg-[#eef5ff] text-[#2374f2] dark:bg-[#1f2c3e] dark:border dark:border-[#265680] dark:text-[#38bdf8]">
                                    <i className="fa-solid fa-chart-line" style={{ fontSize: 16 }}></i>
                                </span>
                                <div>
                                    <div className="text-[16px] font-bold text-slate-800 dark:text-slate-100">{t("Ads Performance Trends")}</div>
                                    <div style={{ fontSize: "12px", fontWeight: "500", color: "#64748b", marginTop: "2px" }}>
                                        {t("Quick performance snapshot across key periods")}
                                    </div>
                                </div>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="overflow-auto p-6 bg-white dark:bg-[#1e293b]">
                        <div
                            className="data_table position-relative border-0"
                            style={{
                                background: "transparent",
                                borderRadius: "12px",
                                overflow: "hidden",
                                border: "1px solid rgba(2, 70, 139, 0.08)"
                            }}
                        >
                            <DataTable
                                columns={columns}
                                data={tableData}
                                customStyles={customTableStyles}
                                fixedHeader
                                fixedHeaderScrollHeight="50vh"
                                progressPending={loading}
                                progressComponent={
                                    <div className="py-5 text-center text-gray-500 font-semibold" style={{ fontSize: "13.5px" }}>
                                        <span className="spinner-border spinner-border-sm mr-2 text-primary" role="status" aria-hidden="true"></span>
                                        {t("Fetching ads trends…")}
                                    </div>
                                }
                                noDataComponent={<div className="py-5 text-center text-gray-500 font-semibold">{t("No data available")}</div>}
                                highlightOnHover
                            />
                        </div>
                    </div>

                    <DialogFooter className="bg-white dark:bg-[#1e293b] border-t border-slate-100 dark:border-slate-800 p-4 px-6 sm:justify-end">
                        <Button
                            onClick={onClose}
                            className="btn-campaign-primary"
                        >
                            {t("Close")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default AdsTrendsModal;
