import { useEffect, useState } from "react";
import { t } from "i18next";
import DataTable from "react-data-table-component";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { tableStyles } from "../../../helper/table/TableStyle";
import { ApiRuleEffectedBudgets } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";

const AD_TABS = [
    { key: "All", label: "All" },
    { key: "SP", label: "Products" },
    { key: "SB", label: "Brands" },
    { key: "SD", label: "Display" },
];

function BudgetRuleConfirmationModel({
    showModal,
    setShowModal,
    ruleId,
    title,
    onConfirm
}) {
    const [rawData, setRawData] = useState({ SP: [], SB: [], SD: [] });
    const [activeTab, setActiveTab] = useState("All");
    const [loading, setLoading] = useState(false);
    const [selectionError, setSelectionError] = useState(false);
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const handleClose = () => {
        setRawData({ SP: [], SB: [], SD: [] });
        setSelectionError(false);
        setShowModal(false);
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await ApiRuleEffectedBudgets(ruleId);
                if (res?.isSuccess) {
                    setRawData({
                        SP: res.data?.SP || [],
                        SB: res.data?.SB || [],
                        SD: res.data?.SD || [],
                    });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (showModal && ruleId) fetchData();
    }, [showModal, ruleId]);

    useEffect(() => {
        if (showModal) setActiveTab("All");
    }, [showModal]);

    const getTabData = (tab) => {
        if (tab === "All") return [
            ...rawData.SP.map(r => ({ ...r, _type: "SP" })),
            ...rawData.SB.map(r => ({ ...r, _type: "SB" })),
            ...rawData.SD.map(r => ({ ...r, _type: "SD" })),
        ];
        return rawData[tab] ?? [];
    };

    const tableData = getTabData(activeTab);

    const updateRow = (type, row, checked) => {
        setSelectionError(false);
        setRawData(prev => ({
            ...prev,
            [type]: prev[type].map(item => item.campaignId === row.campaignId ? { ...item, isSelected: checked } : item),
        }));
    };

    const statusHandler = (event, row) => {
        const type = activeTab === "All" ? row._type : activeTab;
        updateRow(type, row, event.target.checked);
    };

    const eligibleData = tableData.filter(r => r.isEligible !== false);
    const allChecked = eligibleData.length > 0 && eligibleData.every(r => r.isSelected);

    const handleSelectAll = (e) => {
        const checked = e.target.checked;
        setSelectionError(false);
        const applySelection = (arr) => arr.map(r => r.isEligible === false ? r : { ...r, isSelected: checked });

        if (activeTab === "All") {
            setRawData(prev => ({
                SP: applySelection(prev.SP),
                SB: applySelection(prev.SB),
                SD: applySelection(prev.SD),
            }));
        } else {
            setRawData(prev => ({
                ...prev,
                [activeTab]: applySelection(prev[activeTab]),
            }));
        }
    };

    const handleConfirm = () => {
        const filtered = {
            SP: rawData.SP.filter(r => r.isSelected === true),
            SB: rawData.SB.filter(r => r.isSelected === true),
            SD: rawData.SD.filter(r => r.isSelected === true),
        };

        if ((filtered?.SP.length + filtered?.SB.length + filtered?.SD.length) === 0) {
            setSelectionError(true);
            return;
        }

        onConfirm(filtered);
        handleClose();
    };

    const tabCount = (key) => {
        if (key === "All") return rawData.SP.length + rawData.SB.length + rawData.SD.length;
        return rawData[key]?.length ?? 0;
    };

    const columns = [
        {
            name: (
                <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={handleSelectAll}
                />
            ),
            width: "50px",
            selector: (row) => row.isSelected,
            cell: (row) => (
                <input
                    type="checkbox"
                    name="isSelected"
                    onChange={(event) => statusHandler(event, row)}
                    checked={!!row.isSelected}
                    disabled={row.isEligible === false}
                />
            ),
        },
        {
            name: t("Type"),
            selector: (row) => row._type,
            cell: (row) => {
                const typeMap = { SP: "Products", SB: "Brands", SD: "Display" };
                const type = row._type ?? activeTab;
                return type ? (
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap border ${
                        type === "SP" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" :
                        type === "SB" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
                        "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                    }`}>
                        {t(typeMap[type] ?? type)}
                    </span>
                ) : null;
            },
            width: "100px",
            omit: activeTab !== "All",
        },
        {
            name: t("Campaign Name"),
            selector: (row) => row.name,
            wrap: true,
            minWidth: "220px"
        },
        {
            name: t("Eligible"),
            selector: (row) => row.isEligible,
            cell: (row) => {
                const isEligible = row.isEligible !== false;
                return (
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap border ${
                        isEligible ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
                        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                    }`}>
                        {isEligible ? t("Yes") : t("No")}
                    </span>
                );
            },
            width: "90px"
        },
        {
            name: t("Status"),
            selector: (row) => row.status,
            cell: (row) => {
                const isEnabled = row.status === "ENABLED";
                const isOOB = row.status === "OUT_OF_BUDGET" || row.status === "out_of_budget";
                return (
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap border ${
                        isEnabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
                        isOOB ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" :
                        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                    }`}>
                        {row.status === "ENABLED" ? t("Enabled") : row.status === "PAUSED" ? t("Paused") : row.status === "ARCHIVED" ? t("Archived") : isOOB ? t("Out of Budget") : t(row.status)}
                    </span>
                );
            },
            maxWidth: "200px"
        },
        {
            name: t("Today Budget"),
            selector: (row) => row?.todayBudget,
            cell: (row) => CurrencyCode(row?.todayBudget),
            right: true,
            width: "130px"
        },
        {
            name: t("Today Spend"),
            selector: (row) => row?.todaySpend,
            cell: (row) => CurrencyCode(row?.todaySpend),
            right: true,
            width: "130px"
        },
        {
            name: t("Budget Usage"),
            selector: (row) => row?.todaySpend,
            cell: (row) => {
                const budget = Number(row?.todayBudget) || 0;
                const spend = Number(row?.todaySpend) || 0;
                if (!budget) return "-";
                const usage = ((spend * 100) / budget).toFixed(2);
                return `${usage}%`;
            },
            right: true,
            width: "130px"
        },
        {
            name: t("Start Date"),
            selector: (row) => row.startDate,
            width: "110px"
        },
        {
            name: t("Impressions"),
            selector: (row) => row.impressions ?? 0,
            right: true,
            width: "120px"
        },
        {
            name: t("Clicks"),
            selector: (row) => row.clicks ?? 0,
            right: true,
            width: "100px"
        },
        {
            name: t("Total Budget"),
            selector: (row) => row?.totalBudget,
            cell: (row) => CurrencyCode(row?.totalBudget),
            right: true,
            width: "130px"
        },
        {
            name: t("Total Spend"),
            selector: (row) => row.spend,
            cell: (row) => CurrencyCode(row.spend),
            right: true,
            width: "130px"
        },
        {
            name: t("Orders"),
            selector: (row) => row.orders ?? 0,
            right: true,
            width: "100px"
        },
        {
            name: t("Sales"),
            selector: (row) => row.sales,
            cell: (row) => CurrencyCode(row.sales),
            right: true,
            width: "110px"
        },
        {
            name: t("ACOS"),
            selector: (row) => `${row.acos}%`,
            right: true,
            width: "100px"
        },
        {
            name: t("ROAS"),
            selector: (row) => row.roas,
            right: true,
            width: "100px"
        },
        {
            name: t("CPC"),
            selector: (row) => row.cpc,
            cell: (row) => CurrencyCode(row.cpc),
            right: true,
            width: "100px"
        },
        {
            name: t("CTR"),
            selector: (row) => `${row.ctr}%`,
            right: true,
            width: "100px"
        }
    ];

    const customTableStyles = {
        ...tableStyles,
        table: {
            style: {
                backgroundColor: 'transparent',
                color: 'inherit',
            },
        },
        noData: {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#cbd5e1' : '#475569',
                backgroundColor: 'transparent',
                minHeight: '200px',
            },
        },
        progress: {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: 'inherit',
                minHeight: '200px',
            },
        },
    };

    return (
        <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="w-[92vw] max-w-5xl p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10 st-confirm-modal" id="budget-rule-confirmation-modal">
                <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                    <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white flex justify-between items-center w-full">
                        {typeof title === 'string' ? t(title) : title}
                    </DialogTitle>
                </DialogHeader>

                <div className="max-h-[80vh] overflow-y-auto">
                    {/* Body */}
                    <div className="px-6 py-4 flex flex-col gap-3">
                        {/* Tabs */}
                        <div className="campaign-type-tabs">
                            {AD_TABS.map(({ key, label }) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`tab-btn${activeTab === key ? " active" : ""}`}
                                    onClick={() => setActiveTab(key)}
                                >
                                    {t(label)}
                                    <span className="tab-badge">{tabCount(key)}</span>
                                </button>
                            ))}
                        </div>

                        {/* Info row */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex justify-between items-center mb-0">
                            <span>{t("Below data will be affected. Please confirm.")}</span>
                            <b className="text-slate-700 dark:text-slate-200">{t("Total: ")}{tableData.length} {t("Records")}</b>
                        </p>

                        {/* Selection error */}
                        {selectionError && (
                            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold" role="alert">
                                <span>⚠️</span>
                                <span>{t("Please select at least one campaign to Run Budget Rule Manually.")}</span>
                            </div>
                        )}

                        {/* Data Table */}
                        <div className="data_table position-relative" id="budget-main-table">
                            <DataTable
                                className="table_content"
                                customStyles={customTableStyles}
                                columns={columns}
                                theme={isDark ? "dark" : "default"}
                                striped={true}
                                data={tableData}
                                progressPending={loading}
                                progressComponent={
                                    <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 font-sans text-xs">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
                                        <span>{t("Loading records...")}</span>
                                    </div>
                                }
                                highlightOnHover
                                fixedHeader
                                fixedHeaderScrollHeight="55vh"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        className="cancel_btn"
                    >
                        {t("No")}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="save_btn"
                    >
                        {t("Yes")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default BudgetRuleConfirmationModel;
