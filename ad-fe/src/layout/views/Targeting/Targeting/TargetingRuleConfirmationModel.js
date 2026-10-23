import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DataTable from "react-data-table-component";
import { StyleSheetManager } from "styled-components";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import { ApiRuleEffectedTargeting } from "../../../../api-wrapper/targeting/ApiTargeting";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { FiPlay, FiAlertCircle, FiCalendar, FiZap } from "react-icons/fi";

import { getConditionSummary, rowIdentity, consumeShiftWheel, forwardTableProp } from "./targetingRulePreview";

const AD_TABS = [
    { key: "All", label: "All" },
    { key: "SP", label: "Products" },
    { key: "SB", label: "Brands" },
    { key: "SD", label: "Display" },
];


function TargetingRuleConfirmationModel({
    showModal,
    setShowModal,
    ruleId,
    ruleData,
    title,
    onConfirm
}) {
    const { t } = useTranslation();
    const [rawData, setRawData] = useState({ SP: [], SB: [], SD: [] });
    const [activeTab, setActiveTab] = useState("All");
    const [loading, setLoading] = useState(false);
    const [selectionError, setSelectionError] = useState(false);
    const [fetchError, setFetchError] = useState(false);
    const [loadedRuleId, setLoadedRuleId] = useState(null);
    const previewReady = !!ruleId && loadedRuleId === ruleId && !loading && !fetchError;
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
    const [tableContainer, setTableContainer] = useState(null);

    const conditionSummary = useMemo(() => getConditionSummary(ruleData), [ruleData]);

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Horizontal scroll support with Shift + Mouse wheel
    useEffect(() => {
        const container = tableContainer;
        if (!container) return;

        const findHorizontalScrollable = () => {
            const tableContent = container.querySelector(".table_content");
            if (tableContent && tableContent.scrollWidth > tableContent.clientWidth + 1 && ["auto", "scroll", "overlay"].includes(window.getComputedStyle(tableContent).overflowX)) {
                return tableContent;
            }
            const all = container.querySelectorAll("*");
            for (const el of all) {
                if (el.scrollWidth > el.clientWidth + 5) {
                    const style = window.getComputedStyle(el);
                    if (["auto", "scroll", "overlay"].includes(style.overflowX)) {
                        return el;
                    }
                }
            }
            return null;
        };

        const handleWheel = (e) => {
            consumeShiftWheel(e, findHorizontalScrollable());
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => container.removeEventListener("wheel", handleWheel);
    }, [tableContainer]);

    const handleClose = () => {
        setRawData({ SP: [], SB: [], SD: [] });
        setLoadedRuleId(null);
        setSelectionError(false);
        setShowModal(false);
    };

    useEffect(() => {
        let isCurrent = true;
        if (showModal && ruleId) {
            setLoading(true);
            setFetchError(false);
            setSelectionError(false);
            setActiveTab("All");
            setRawData({ SP: [], SB: [], SD: [] });
            ApiRuleEffectedTargeting(ruleId)
                .then((res) => {
                    if (!isCurrent) return;
                    if (res?.isSuccess) {
                        setLoadedRuleId(ruleId);
                        setRawData({
                            SP: (res.data?.SP || []).map(r => ({ ...r, isSelected: false })),
                            SB: (res.data?.SB || []).map(r => ({ ...r, isSelected: false })),
                            SD: (res.data?.SD || []).map(r => ({ ...r, isSelected: false })),
                        });
                    } else {
                        setFetchError(true);
                    }
                })
                .catch((err) => {
                    if (isCurrent) { setFetchError(true); console.error(err); }
                })
                .finally(() => {
                    if (isCurrent) setLoading(false);
                });
        }
        return () => {
            isCurrent = false;
        };
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
        return (rawData[tab] ?? []).map(r => ({ ...r, _type: tab }));
    };

    const tableData = getTabData(activeTab);

    const updateRow = (type, row, checked) => {
        if (!previewReady || row.isEligible === false) return;
        setSelectionError(false);
        setRawData(prev => ({
            ...prev,
            [type]: prev[type].map(item => rowIdentity(type, item) === rowIdentity(type, row) ? { ...item, isSelected: checked } : item),
        }));
    };

    const statusHandler = (event, row) => {
        const type = activeTab === "All" ? row._type : activeTab;
        updateRow(type, row, event.target.checked);
    };

    const eligibleData = tableData.filter(r => r.isEligible !== false);
    const selectedEligibleCount = Object.values(rawData).flat().filter(r => r.isEligible !== false && r.isSelected).length;
    const allChecked = eligibleData.length > 0 && eligibleData.every(r => r.isSelected);

    const handleSelectAll = (e) => {
        if (!previewReady) return;
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
        if (!previewReady) return;
        const filtered = {
            SP: rawData.SP.filter(r => r.isSelected === true && r.isEligible !== false),
            SB: rawData.SB.filter(r => r.isSelected === true && r.isEligible !== false),
            SD: rawData.SD.filter(r => r.isSelected === true && r.isEligible !== false),
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
                <div className="flex items-center justify-center">
                    <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer accent-sky-500"
                        disabled={!previewReady || eligibleData.length === 0}
                        checked={allChecked}
                        onChange={handleSelectAll}
                    />
                </div>
            ),
            width: "55px",
            selector: (row) => row.isSelected,
            cell: (row) => (
                <div className="flex items-center justify-center">
                    <input
                        type="checkbox"
                        name="isSelected"
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer accent-sky-500"
                        onChange={(event) => statusHandler(event, row)}
                        checked={!!row.isSelected}
                        disabled={!previewReady || row.isEligible === false}
                    />
                </div>
            ),
        },
        {
            name: t("Type"),
            selector: (row) => row._type,
            cell: (row) => {
                const typeMap = { SP: "Products", SB: "Brands", SD: "Display" };
                const type = row._type ?? activeTab;
                return type ? (
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap border ${
                        type === "SP" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25" :
                        type === "SB" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" :
                        "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25"
                    }`}>
                        {t(typeMap[type] ?? type)}
                    </span>
                ) : null;
            },
            width: "110px",
            omit: activeTab !== "All",
        },
        {
            name: t("Targeting"),
            selector: (row) => row.targeting,
            cell: (row) => (
                <div className="py-1 w-full max-w-[280px]">
                    <span 
                        className="font-semibold text-xs text-slate-900 dark:text-white block break-words break-all whitespace-normal leading-relaxed" 
                        title={row.targeting}
                    >
                        {row.targeting || "—"}
                    </span>
                </div>
            ),
            wrap: true,
            minWidth: "220px",
            maxWidth: "300px",
        },
        {
            name: t("Match Type"),
            selector: (row) => row.matchType,
            cell: (row) => (
                <span className="inline-block max-w-full break-all whitespace-normal px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                    {row.matchType || "—"}
                </span>
            ),
            width: "150px",
            minWidth: "140px",
        },
        {
            name: t("Keyword Bid"),
            selector: (row) => row.keywordBid,
            cell: (row) => (
                <span className="font-mono font-bold text-xs text-sky-600 dark:text-sky-400">
                    {CurrencyCode(row.keywordBid)}
                </span>
            ),
            right: true,
            width: "120px"
        },
        {
            name: t("Campaign Name"),
            selector: (row) => row.campaignName,
            cell: (row) => (
                <div className="py-1 w-full max-w-[240px]">
                    <span className="text-xs text-slate-700 dark:text-slate-300 block break-all whitespace-normal" title={row.campaignName}>
                        {row.campaignName || "—"}
                    </span>
                </div>
            ),
            wrap: true,
            minWidth: "180px",
            maxWidth: "260px",
        },
        {
            name: t("Eligible"),
            selector: (row) => row.isEligible,
            cell: (row) => {
                const isEligible = row.isEligible !== false;
                return (
                    <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap border ${
                        isEligible ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" :
                        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                    }`}>
                        {isEligible ? t("Yes") : t("No")}
                    </span>
                );
            },
            width: "100px"
        },
        {
            name: t("Campaign Status"),
            selector: (row) => row.campaignStatus,
            cell: (row) => {
                const isEnabled = String(row.campaignStatus || "").toUpperCase() === "ENABLED";
                return row.campaignStatus ? (
                    <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold whitespace-nowrap border ${
                        isEnabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" :
                        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                    }`}>
                        {row.campaignStatus}
                    </span>
                ) : <span className="text-slate-400">—</span>;
            },
            width: "140px"
        },
        {
            name: t("Ad Group Name"),
            selector: (row) => row.adGroupName,
            cell: (row) => (
                <div className="py-1 w-full max-w-[200px]">
                    <span className="text-xs text-slate-700 dark:text-slate-300 block break-all whitespace-normal" title={row.adGroupName}>
                        {row.adGroupName || "—"}
                    </span>
                </div>
            ),
            wrap: true,
            minWidth: "160px",
            maxWidth: "220px",
        },
        {
            name: t("Impressions"),
            selector: (row) => row.impressions ?? 0,
            cell: (row) => <span className="font-mono text-xs">{Number(row.impressions || 0).toLocaleString()}</span>,
            right: true,
            width: "110px"
        },
        {
            name: t("Clicks"),
            selector: (row) => row.clicks ?? 0,
            cell: (row) => <span className="font-mono text-xs">{Number(row.clicks || 0).toLocaleString()}</span>,
            right: true,
            width: "95px"
        },
        {
            name: t("Spend"),
            selector: (row) => row.spend,
            cell: (row) => <span className="font-mono text-xs">{CurrencyCode(row.spend)}</span>,
            right: true,
            width: "110px"
        },
        {
            name: t("Orders"),
            selector: (row) => row.orders ?? 0,
            cell: (row) => <span className="font-mono text-xs font-semibold">{Number(row.orders || 0).toLocaleString()}</span>,
            right: true,
            width: "95px"
        },
        {
            name: t("Sales"),
            selector: (row) => row.sales,
            cell: (row) => <span className="font-mono text-xs">{CurrencyCode(row.sales)}</span>,
            right: true,
            width: "110px"
        },
        {
            name: t("ACOS"),
            selector: (row) => row.acos,
            cell: (row) => {
                const acosNum = Number(row.acos || 0);
                return (
                    <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${acosNum <= 30 ? "text-emerald-500 bg-emerald-500/10" : "text-amber-500 bg-amber-500/10"}`}>
                        {formatDecimal(row.acos)}%
                    </span>
                );
            },
            right: true,
            width: "100px"
        },
        {
            name: t("ROAS"),
            selector: (row) => row.roas,
            cell: (row) => <span className="font-mono text-xs font-bold text-sky-500">{formatDecimal(row.roas)}x</span>,
            right: true,
            width: "95px"
        },
        {
            name: t("Top of Search IS"),
            selector: (row) => row.topOfSearchImpressionShare,
            cell: (row) => <span className="font-mono text-xs">{Number(row?.topOfSearchImpressionShare) !== 0 && row?.topOfSearchImpressionShare !== undefined ? `${CurrencyFormat(row?.topOfSearchImpressionShare)}%` : "—"}</span>,
            right: true,
            width: "140px"
        },
    ];

    const customTableStyles = {
        table: {
            style: {
                backgroundColor: 'transparent',
                color: 'inherit',
            },
        },
        headRow: {
            style: {
                backgroundColor: isDark ? '#111827' : '#f8fafc',
                borderBottomWidth: '1px',
                borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0',
                minHeight: '42px',
            },
        },
        headCells: {
            style: {
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: isDark ? '#94a3b8' : '#475569',
                paddingLeft: '12px',
                paddingRight: '12px',
            },
        },
        rows: {
            style: {
                fontSize: '12px',
                minHeight: '48px',
                backgroundColor: isDark ? 'transparent' : '#ffffff',
                borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                '&:hover': {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                },
            },
            stripedStyle: {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#fafafa',
            }
        },
        cells: {
            style: {
                paddingLeft: '12px',
                paddingRight: '12px',
                minWidth: 0,
                overflow: 'hidden',
            },
        },
        noData: {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#cbd5e1' : '#475569',
                backgroundColor: 'transparent',
                minHeight: '180px',
            },
        },
        progress: {
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: 'inherit',
                minHeight: '180px',
            },
        },
    };

    const cleanTitle = title ? String(title).replace(/:+\s*$/, "").trim() : t("Targeting Rule");

    return (
        <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-[1360px] w-[95vw] p-6 md:p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[92vh] z-[10002]" id="targeting-rule-confirmation-modal">
                {/* Circuit top glow line indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #38bdf8 30%, #34d399 70%, transparent 100%)",
                        opacity: 0.9
                    }}
                />

                {/* ── Header ── */}
                <div className="flex flex-col gap-2.5 w-full pb-4 border-b border-slate-100 dark:border-white/10 pr-8 shrink-0">
                    <div style={{
                        fontSize: "18px", fontWeight: "700",
                        display: "flex", alignItems: "center", gap: "12px",
                        color: isDark ? "#ffffff" : "#1e293b"
                    }}>
                        <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400 p-2.5 rounded-xl flex items-center justify-center shrink-0">
                            <FiPlay size={18} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <DialogTitle className="break-words text-[18px] font-bold m-0">{t("Run Targeting Rule Confirmation")}</DialogTitle>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25 truncate max-w-[450px]" title={cleanTitle}>
                                    <span>🎯</span>
                                    <span className="truncate">{cleanTitle}</span>
                                </span>
                            </div>
                            <DialogDescription className="text-xs font-normal text-slate-500 dark:text-slate-400 m-0 mt-0.5">
                                {t("Review affected targeting records and select items to apply adjustments")}
                            </DialogDescription>
                        </div>
                    </div>

                    {/* All Configured Conditions Summary Bar */}
                    <div 
                        className="flex items-center gap-1.5 flex-wrap pt-1 pl-1 text-xs max-h-[25vh] overflow-y-auto"
                        aria-label={`Rule configuration conditions: ${conditionSummary.ariaSummary}`}
                    >
                        {/* Lookback Date Range */}
                        <span 
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                            title={t("Configured lookback report date window: {{val}}", { val: conditionSummary.dateLabel })}
                        >
                            <FiCalendar size={11} className="text-indigo-500" />
                            <span>{t(conditionSummary.dateLabel)}</span>
                        </span>

                        {/* Each Condition Group / Chip */}
                        {conditionSummary.conditions.map((cond, idx) => (
                            <span key={idx} className="inline-flex items-center max-w-full min-w-0 gap-1.5">
                                {idx > 0 && (
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                                        AND
                                    </span>
                                )}
                                <span 
                                    className="inline-flex items-center max-w-full break-all whitespace-normal gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/25"
                                    title={cond.text}
                                >
                                    <span className="font-bold">{cond.type}</span>
                                    <span className="font-mono text-slate-500 dark:text-slate-400 font-bold">{cond.op}</span>
                                    <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{cond.val}</span>
                                </span>
                            </span>
                        ))}

                        {/* Action Badge */}
                        {conditionSummary.actionLabel && (
                            <span 
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 ml-auto sm:ml-1"
                                title={t("Rule Action: {{act}}", { act: conditionSummary.actionLabel })}
                            >
                                <FiZap size={11} className="text-emerald-500" />
                                <span>{t(conditionSummary.actionLabel)}</span>
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-h-0 pt-3 flex flex-col overflow-hidden">
                    {/* Tabs & Summary Bar */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 shrink-0">
                        {/* Tabs */}
                        <div className="campaign-type-tabs flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/10">
                            {AD_TABS.map(({ key, label }) => {
                                const count = tabCount(key);
                                const isActive = activeTab === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                                            isActive
                                                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20 dark:bg-sky-600"
                                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                        }`}
                                        onClick={() => setActiveTab(key)}
                                    >
                                        <span>{t(label)}</span>
                                        <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                                            isActive
                                                ? "bg-white/25 text-white"
                                                : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Info / Counter badge */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {t("Report period:")} {t(conditionSummary.dateLabel)}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 dark:bg-white/5 dark:text-slate-200 border border-slate-200 dark:border-white/10">
                                {t("Total:")} <b className="text-sky-500">{tableData.length}</b> {t("Records")}
                            </span>
                            {selectedEligibleCount > 0 && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                                    ✓ {selectedEligibleCount} {t("Selected")}
                                </span>
                            )}
                        </div>
                    </div>

                    {fetchError && <div role="alert" className="text-sm text-red-600 mb-2">{t("Unable to load affected targets. Close and reopen to retry.")}</div>}
                    {/* Selection error */}
                    {selectionError && (
                        <div className="flex items-center gap-2 py-2 px-3 mb-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold shrink-0" role="alert">
                            <FiAlertCircle size={15} />
                            <span>{t("Please select at least one target to Run Targeting Rule Manually.")}</span>
                        </div>
                    )}

                    {/* Data Table with Ref for Shift+Wheel */}
                    <div 
                        ref={setTableContainer}
                        className="flex-1 min-h-[280px] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#0c1222]/80 shadow-sm flex flex-col"
                    >
                        <StyleSheetManager shouldForwardProp={forwardTableProp}>
                        <DataTable
                            keyField="_previewKey"
                            className="table_content"
                            customStyles={customTableStyles}
                            columns={columns}
                            theme={isDark ? "dark" : "default"}
                            striped={true}
                            data={tableData.map(row => ({ ...row, _previewKey: rowIdentity(row._type, row) }))}
                            progressPending={loading}
                            progressComponent={
                                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 font-sans text-xs">
                                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-sky-500"></div>
                                    <span>{t("Loading affected targets...")}</span>
                                </div>
                            }
                            highlightOnHover
                            fixedHeader
                            fixedHeaderScrollHeight="calc(92vh - 370px)"
                        />
                        </StyleSheetManager>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-5 mt-2 border-t border-slate-100 dark:border-white/10 shrink-0">
                    <span className="text-xs text-slate-400">
                        {t("Selected items will be submitted to Amazon Ads API immediately upon confirmation.")}
                    </span>
                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            className="h-10 px-6 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-semibold text-xs transition-all cursor-pointer"
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            type="button"
                            disabled={!previewReady}
                            onClick={handleConfirm}
                            className="h-10 px-7 flex items-center justify-center gap-2 cursor-pointer rounded-xl font-bold text-xs bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-500/25 active:scale-95 transition-all duration-200 border-none"
                        >
                            <FiPlay size={13} className="fill-current text-white" />
                            <span>{t("Run Rule")}</span>
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

const formatDecimal = (val) => {
    if (val === undefined || val === null || val === "") return "0";
    const num = Number(val);
    return isNaN(num) ? "0" : num.toFixed(2);
};

export default TargetingRuleConfirmationModel;
