import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AgTable from "../../../common/grid/AgTable";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import { CampaignNameCell } from "../../../utility/campaignNavigation";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { Button as ShadcnButton } from "../../../components/ui/button";

const P = {
    primary: "#1A9FD4",
    primary50: "#E0F4FD",
    neutral100: "#F1F5F9",
    neutral200: "#E2E8F0",
    neutral400: "#94A3B8",
    neutral600: "#475569",
    neutral800: "#1E293B",
    danger: "#E74C3C",
    warning: "#F59E0B",
    success: "#16A34A",
};

// ─── Custom sortable header ───────────────────────────────────────────────────
const CustomHeader = (props) => {
    const { displayName, tooltipText, enableSorting, progressSort } = props;
    const [currentSort, setCurrentSort] = React.useState(props.column.getSort());

    React.useEffect(() => {
        const onSortChanged = () => setCurrentSort(props.column.getSort());
        props.column.addEventListener("sortChanged", onSortChanged);
        return () => props.column.removeEventListener("sortChanged", onSortChanged);
    }, [props.column]);

    return (
        <div
            className="flex items-center gap-1"
            style={{ cursor: enableSorting ? "pointer" : "default" }}
            onClick={(e) => enableSorting && progressSort(e.shiftKey)}
        >
            <span className="ag-header-cell-text">{displayName}</span>
            {currentSort === "asc" && <i className="fa-solid fa-arrow-up ml-1" style={{ fontSize: 11, color: "inherit" }} />}
            {currentSort === "desc" && <i className="fa-solid fa-arrow-down ml-1" style={{ fontSize: 11, color: "inherit" }} />}
            {tooltipText && (
                <AppTooltip
                    text={<div style={{ fontSize: 12, padding: "4px" }}>{tooltipText}</div>}
                    placement="top"
                    arrow
                >
                    <i
                        className="fa-solid fa-circle-info ml-1"
                        style={{ fontSize: 13, color: "inherit", cursor: "help", opacity: 0.7 }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </AppTooltip>
            )}
        </div>
    );
};

// ─── Match Type Badge ─────────────────────────────────────────────────────────
const MatchTypeBadge = ({ value }) => {
    const { t } = useTranslation();
    if (!value) return null;
    return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            {t(value)}
        </span>
    );
};

// ─── Campaign Status Badge ────────────────────────────────────────────────────
const CampaignStatusBadge = ({ value }) => {
    const { t } = useTranslation();
    const isEnabled = String(value).toUpperCase() === "ENABLED";
    const isPaused = String(value).toUpperCase() === "PAUSED";

    if (isEnabled) {
        return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-900/30">
                {t(value)}
            </span>
        );
    }
    if (isPaused) {
        return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/40 dark:border-amber-900/30">
                {t(value)}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-800">
            {value ? t(value) : t("UNKNOWN")}
        </span>
    );
};

// ─── Metric cell ──────────────────────────────────────────────────────────────
const MetricCell = ({ value, isCurrency = false, isPercent = false, decimals = 2, colorize = false }) => {
    const num = Number(value);
    const isInvalid = isNaN(num) || value === undefined || value === null || value === "";

    let displayText = <span style={{ color: P.neutral400 }}>—</span>;
    if (!isInvalid) {
        if (isCurrency) {
            displayText = CurrencyCode(num);
        } else if (isPercent) {
            displayText = `${num.toFixed(decimals)}%`;
        } else {
            displayText = CurrencyFormat(num);
        }
    }

    let color = "var(--text-primary, #1E293B)";
    if (colorize && num > 0) color = P.success;
    if (colorize && num < 0) color = P.danger;

    return (
        <div className="flex items-center h-full">
            <span style={{ fontSize: 13, fontWeight: 600, color }}>
                {displayText}
            </span>
        </div>
    );
};

// ─── Campaign Selector Dropdown ───────────────────────────────────────────────
const CampaignSelector = ({ campaigns = [], selected, onChange }) => {
    const { t } = useTranslation();
    return (
        <div className="relative inline-flex items-center w-full">
            <select
                value={selected}
                onChange={(e) => onChange?.(e.target.value)}
                className="w-full h-8 pl-2.5 pr-8 rounded-lg text-[11px] font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-750 focus:outline-none focus:ring-2 focus:ring-[#2374F2]/30 shadow-sm transition-all duration-200 cursor-pointer appearance-none"
            >
                <option value="ALL">{t("All Campaigns")} ({campaigns.length})</option>
                {campaigns.map((c) => (
                    <option key={c.campaignId} value={c.campaignId}>
                        {c.campaignName}
                    </option>
                ))}
            </select>
            <div className="absolute right-2.5 pointer-events-none text-slate-400 dark:text-slate-500 flex items-center justify-center">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
};

// ─── Campaign Column Cell ─────────────────────────────────────────────────────
const CampaignCell = ({ campaigns = [], selectedCampaignId, onSelect, onStatusClick, targeting }) => {
    const { t } = useTranslation();
    const selected = selectedCampaignId === "ALL"
        ? null
        : campaigns.find(c => String(c.campaignId) === String(selectedCampaignId));

    return (
        <div className="flex flex-col justify-center h-full w-full" style={{ padding: "6px 0", gap: 6 }}>
            <CampaignSelector
                campaigns={campaigns}
                selected={selectedCampaignId}
                onChange={onSelect}
            />

            {selected ? (
                <div className="flex flex-col" style={{ gap: 2 }}>
                    <CampaignNameCell
                        row={selected}
                        name={selected.campaignName}
                        campaignId={selected.campaignId}
                    />
                    <div className="flex flex-wrap items-center justify-between" style={{ gap: 4 }}>
                        <div className="flex items-center" style={{ gap: 4 }}>
                            <CampaignStatusBadge value={selected.campaignStatus} />
                            <MatchTypeBadge value={selected.keywordType} />
                        </div>
                    </div>
                </div>
            ) : (
                <span style={{ fontSize: 10, color: P.neutral400, fontStyle: "italic" }}>
                    {t("Select a campaign to view details")}
                </span>
            )}
        </div>
    );
};

// ─── Helper: get metric value based on selected campaign ─────────────────────
const getMetric = (row, field, selectedCampaignId) => {
    if (selectedCampaignId === "ALL" || !selectedCampaignId) {
        return row[field] ?? 0;
    }
    const campaign = (row.campaigns || []).find(
        c => String(c.campaignId) === String(selectedCampaignId)
    );
    return campaign?.[field] ?? 0;
};

const CheckboxHeader = (headerParams) => {
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        const onGridSelectionChanged = () => {
            const api = headerParams.api;
            const selectedCount = api.getSelectedNodes().length;
            const totalCount = api.getDisplayedRowCount();
            setChecked(selectedCount === totalCount && totalCount > 0);
        };
        headerParams.api.addEventListener("selectionChanged", onGridSelectionChanged);
        return () => headerParams.api.removeEventListener("selectionChanged", onGridSelectionChanged);
    }, [headerParams.api]);

    return (
        <div className="flex items-center justify-center" style={{ width: "100%" }}>
            <StyledCheckbox
                checked={checked}
                onChange={(e) => {
                    if (e.target.checked) {
                        headerParams.api.selectAll();
                    } else {
                        headerParams.api.deselectAll();
                    }
                }}
            />
        </div>
    );
};

const CheckboxCellRenderer = (cellParams) => {
    const node = cellParams.node;
    const [checked, setChecked] = useState(node.isSelected());

    useEffect(() => {
        const onRowSelected = () => {
            setChecked(node.isSelected());
        };
        node.addEventListener("rowSelected", onRowSelected);
        return () => node.removeEventListener("rowSelected", onRowSelected);
    }, [node]);

    return (
        <div className="flex items-center justify-center" style={{ width: "100%", height: "100%" }}>
            <StyledCheckbox
                checked={checked}
                onChange={(e) => {
                    node.setSelected(e.target.checked);
                }}
            />
        </div>
    );
};

// ─── Keyword Analysis Grid ────────────────────────────────────────────────────
export const KeywordAnalysisGrid = ({
    rowData,
    totalRecords,
    loading,
    currentPage,
    rowsPerPage,
    onPageChange,
    onPerPageChange,
    onSortChanged,
    onSelectionChanged,
    onStatusClick,
    onRefresh,
    visibleColumns = [],
    defaultColumns = ["Search Term"],
    handleSaveColumns,
    onOpenCustomizeModal,
}) => {
    const { t } = useTranslation();
    const gridRef = useRef(null);

    // Per-row selected campaign state: { [targeting]: campaignId | "ALL" }
    const [selectedCampaigns, setSelectedCampaigns] = useState({});

    // Notify parent whenever campaign selections change (appends updated selectedCampaignId)
    useEffect(() => {
        if (onSelectionChanged && gridRef.current?.api) {
            const selectedNodes = gridRef.current.api.getSelectedNodes();
            const selectedData = selectedNodes.map(node => {
                const row = node.data;
                return {
                    ...row,
                    selectedCampaignId: getSelected(row)
                };
            });
            onSelectionChanged(selectedData);
        }
    }, [selectedCampaigns]);

    const handleSelectionChanged = React.useCallback((params) => {
        if (onSelectionChanged) {
            const selectedNodes = params.api.getSelectedNodes();
            const selectedData = selectedNodes.map(node => {
                const row = node.data;
                return {
                    ...row,
                    selectedCampaignId: getSelected(row)
                };
            });
            onSelectionChanged(selectedData);
        }
    }, [onSelectionChanged, selectedCampaigns]);

    const handleCampaignSelect = (targeting, campaignId) => {
        setSelectedCampaigns(prev => ({ ...prev, [targeting]: campaignId }));
    };

    // Default: first campaign of each row
    const getSelected = (row) => {
        const key = row.targeting;
        if (selectedCampaigns[key] !== undefined) return selectedCampaigns[key];
        // default: first campaign
        return row.campaigns?.[0]
            ? String(row.campaigns[0].campaignId)
            : "ALL";
    };

    const checkOrderColumns = useCallback((title) => ({
        width: visibleColumns?.find(col => col?.title === title)?.width ?? 200,
        hide: Boolean(visibleColumns?.length && !visibleColumns?.find(col => col?.title === title)),
        order: visibleColumns?.find(col => col?.title === title)?.order,
    }), [visibleColumns]);

    const columns = useMemo(() => [
        // 0. Checkbox Column for Bulk Actions (using StyledCheckbox connected to AgGrid selection)
        {
            headerName: "",
            field: "checkboxSelection",
            width: 50,
            pinned: "left",
            lockPinned: true,
            suppressMovable: true,
            sortable: false,
            resizable: false,
            headerComponent: CheckboxHeader,
            cellRenderer: CheckboxCellRenderer,
        },

        // 1. Targeting Keyword
        {
            headerName: t("Search Term"),
            field: "targeting",
            title: "Search Term",
            minWidth: 200,
            flex: 1,
            pinned: "left",
            lockPinned: true,
            ...(checkOrderColumns("Search Term")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("The keyword or search term being targeted.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const exactCount = row.EXACT ?? 0;
                const phraseCount = row.PHRASE ?? 0;
                const broadCount = row.BROAD ?? 0;
                return (
                    <div className="flex flex-col justify-center h-full" style={{ gap: 4, padding: "6px 0" }}>
                        <span style={{
                            fontSize: 12, fontWeight: 700, color: "var(--text-primary, #1E293B)",
                            whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4,
                        }}>
                            {row.targeting}
                        </span>
                        <div className="flex flex-wrap" style={{ gap: 4 }}>
                            {exactCount > 0 && <MatchTypeBadge value="EXACT" />}
                            {phraseCount > 0 && <MatchTypeBadge value="PHRASE" />}
                            {broadCount > 0 && <MatchTypeBadge value="BROAD" />}
                        </div>
                        <span style={{ fontSize: 10, color: P.neutral400 }}>
                            {(row.campaigns || []).length} {(row.campaigns || []).length === 1 ? t("campaign") : t("campaigns")}
                        </span>
                    </div>
                );
            },
        },

        // 2. Campaign (dropdown selector)
        {
            headerName: t("Campaign"),
            field: "campaigns",
            title: "Campaign",
            minWidth: 280,
            ...(checkOrderColumns("Campaign")),
            sortable: false,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <CampaignCell
                        campaigns={row.campaigns || []}
                        selectedCampaignId={getSelected(row)}
                        onSelect={(val) => handleCampaignSelect(row.targeting, val)}
                        onStatusClick={onStatusClick}
                        targeting={row.targeting}
                    />
                );
            },
        },

        // 3. Impressions
        {
            headerName: t("Impressions"),
            field: "impressions",
            title: "Impressions",
            width: 130,
            ...(checkOrderColumns("Impressions")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Total impressions for this keyword.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "impressions", getSelected(row));
                return <MetricCell value={val} decimals={0} />;
            },
        },

        // 4. Clicks
        {
            headerName: t("Clicks"),
            field: "clicks",
            title: "Clicks",
            width: 100,
            ...(checkOrderColumns("Clicks")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Total clicks for this keyword.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "clicks", getSelected(row));
                return <MetricCell value={val} decimals={0} />;
            },
        },

        // 5. Spend
        {
            headerName: t("Spend"),
            field: "spend",
            title: "Spend",
            width: 120,
            ...(checkOrderColumns("Spend")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Total ad spend for this keyword.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "spend", getSelected(row));
                return <MetricCell value={val} isCurrency={true} />;
            },
        },

        // 6. Sales
        {
            headerName: t("Sales"),
            field: "sales",
            title: "Sales",
            width: 120,
            ...(checkOrderColumns("Sales")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Total attributed sales for this keyword.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "sales", getSelected(row));
                return <MetricCell value={val} isCurrency={true} colorize={true} />;
            },
        },

        // 7. Orders
        {
            headerName: t("Orders"),
            field: "orders",
            title: "Orders",
            width: 100,
            ...(checkOrderColumns("Orders")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Total orders attributed to this keyword.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "orders", getSelected(row));
                return <MetricCell value={val} decimals={0} />;
            },
        },

        // 8. CPC
        {
            headerName: t("CPC"),
            field: "cpc",
            title: "CPC",
            width: 100,
            ...(checkOrderColumns("CPC")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Cost Per Click.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "cpc", getSelected(row));
                return <MetricCell value={val} isCurrency={true} />;
            },
        },

        // 9. CTR
        {
            headerName: t("CTR"),
            field: "ctr",
            title: "CTR",
            width: 100,
            ...(checkOrderColumns("CTR")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Click Through Rate.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "ctr", getSelected(row));
                return <MetricCell value={val} isPercent={true} decimals={2} />;
            },
        },

        // 10. CVR
        {
            headerName: t("CVR"),
            field: "cvr",
            title: "CVR",
            width: 100,
            ...(checkOrderColumns("CVR")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Conversion Rate.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "cvr", getSelected(row));
                return <MetricCell value={val} isPercent={true} decimals={2} />;
            },
        },

        // 11. ACoS
        {
            headerName: t("ACoS"),
            field: "acos",
            title: "ACoS",
            width: 110,
            ...(checkOrderColumns("ACoS")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Advertising Cost of Sales.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "acos", getSelected(row));
                return (
                    <div className="flex items-center h-full">
                        <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: val === 0 ? P.neutral400
                                : val > 100 ? P.danger
                                    : val > 50 ? P.warning
                                        : P.success,
                        }}>
                            {val === 0 ? "—" : `${val.toFixed(2)}%`}
                        </span>
                    </div>
                );
            },
        },

        // 12. RoAS
        {
            headerName: t("RoAS"),
            field: "roas",
            title: "RoAS",
            width: 100,
            ...(checkOrderColumns("RoAS")),
            headerComponent: CustomHeader,
            headerComponentParams: { tooltipText: t("Return on Ad Spend.") },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const val = getMetric(row, "roas", getSelected(row));
                return <MetricCell value={val} decimals={2} />;
            },
        },

    ], [t, selectedCampaigns, onStatusClick, checkOrderColumns]);

    return (
        <div className="glass-grid-container overflow-hidden">

            {/* Grid Header */}
            <div className="flex items-center justify-between px-4 py-3 border-bottom flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <h5 className="m-0 font-bold uppercase whitespace-nowrap">
                        {t("Keyword Analysis")}
                    </h5>
                    <span className="whitespace-nowrap" style={{
                        fontSize: 11, fontWeight: 600,
                        background: P.primary50, color: P.primary,
                        padding: "2px 8px", borderRadius: 20,
                    }}>
                        {totalRecords} {t("keywords")}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {onOpenCustomizeModal && (
                        <AppTooltip text={t("Customize Columns")} id="keyword-analysis-customize-columns-grid">
                            <ShadcnButton
                                variant="outline"
                                onClick={onOpenCustomizeModal}
                                className="customize-button m-0 gap-0 custom-secondary-btn"
                                style={{ height: "32px", whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                                {t("Columns")}
                                <span style={{ fontSize: 9, marginLeft: 6, display: "inline-block", verticalAlign: "middle" }}>▼</span>
                            </ShadcnButton>
                        </AppTooltip>
                    )}
                    {/* <span style={{ fontSize: 11, color: P.neutral400 }}>
                        <i className="fa-solid fa-circle-info mr-1" />
                        {t("Select a campaign per row to filter metrics")}
                    </span> */}
                </div>
            </div>

            <div id="keyword-analysis-main-table" className="data_table position-relative" style={{ padding: "0 14px 14px 14px" }}>
                <AgTable
                    onRefresh={() => {
                        if (onRefresh) onRefresh();
                        else onPageChange?.(currentPage);
                    }} ref={gridRef}
                    tableId="keyword-analysis-grid"
                    height="65vh"
                    rowHeight={90}
                    rowData={rowData}
                    columnDefs={columns?.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))}
                    totalRecords={totalRecords}
                    perPage={rowsPerPage}
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                    onPerPageChange={onPerPageChange}
                    onSortChanged={onSortChanged}
                    loading={loading}
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    onSelectionChanged={handleSelectionChanged}
                    handleSaveColumns={handleSaveColumns}
                />
            </div>
        </div>
    );
};

export default KeywordAnalysisGrid;