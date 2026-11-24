import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, ChevronDown } from "lucide-react";
import { FiSearch, FiInfo, FiTag, FiLayers } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetTitle } from "../../../components/ui/sheet";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { ApiGetTargetSearchTerms, ApiNegateTargetSearchTerms } from "../../../api-wrapper/search-term/ApiSearchTerm";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { StyledCheckbox } from "../../../common/grid/StyledCheckbox";
import AgTable from "../../../common/grid/AgTable";
import RecommendationBulkSelection from "./RecommendationBulkSelection";
import "./TargetSearchTermsDrawer.css";

const EXACT = "NEGATIVE_EXACT";
const PHRASE = "NEGATIVE_PHRASE";
const ASIN = "ASIN_SAME_AS";
const keywordMatchTypes = [EXACT, PHRASE];
const pageSizes = [25, 50, 100];
const matchLabels = { [EXACT]: "Negative Exact", [PHRASE]: "Negative Phrase", [ASIN]: "ASIN Same As" };

const TermsHeaderCheckbox = React.memo(({ headerCheckboxEvents, selectableRef, selectedRef, pendingRef, onToggleAll, t }) => {
    const computeChecked = useCallback(() => {
        const selectable = selectableRef?.current || [];
        if (!selectable.length || !selectedRef?.current?.size) return false;
        return selectable.every((r) => selectedRef.current.has(r.searchTerm));
    }, [selectableRef, selectedRef]);

    const [checked, setChecked] = useState(computeChecked);

    useEffect(() => {
        const onUpdate = () => {
            setChecked(computeChecked());
        };
        headerCheckboxEvents?.addEventListener("change", onUpdate);
        onUpdate();
        return () => headerCheckboxEvents?.removeEventListener("change", onUpdate);
    }, [headerCheckboxEvents, computeChecked]);

    const disabled = pendingRef?.current || !selectableRef?.current?.length;

    return (
        <div
            className="flex items-center justify-center w-full h-full cursor-pointer py-1"
            onClick={disabled ? undefined : onToggleAll}
            title={checked ? t("Deselect this page") : t("Select all on this page")}
        >
            <StyledCheckbox
                checked={checked}
                disabled={disabled}
                onChange={disabled ? () => {} : onToggleAll}
            />
        </div>
    );
});

export default function TargetSearchTermsDrawer({ target, scope, onClose, currencyCode }) {
    const { t, i18n } = useTranslation();
    const { configId, profileId, fromDate, toDate } = scope;
    const adType = scope.adType || target.adType;
    const campaignId = target.campaignId ?? target._id?.campaignId;
    const campaignName = target.campaignName || target.campaignDetails?.name || (campaignId ? `Campaign #${campaignId}` : "");
    const adGroupId = target.adGroupId ?? target._id?.adGroupId;
    const adGroupName = target.adGroupName || target.adGroupDetails?.name || (adGroupId ? `Ad Group #${adGroupId}` : "");
    const targetId = target.targetId || target.keywordId || target.targetingId || target._id?.targetId || target._id?.keywordId;
    const targetLabel = target.targeting || target.keywordText || target.targetingText || targetId;
    const matchType = target.matchType || target.keywordType;
    const rawBid = target.targetingBid != null ? target.targetingBid : (target.keywordBid != null ? target.keywordBid : target.bid);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [revision, setRevision] = useState(0);
    const [report, setReport] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [negated, setNegated] = useState(new Map());
    const [pending, setPending] = useState(false);
    const [failedCount, setFailedCount] = useState(0);
    const [selectAllLoading, setSelectAllLoading] = useState(false);

    const requestInProgress = useRef(false);
    const liveRequest = useRef(null);
    const opener = useRef(document.activeElement);

    const headerCheckboxEvents = useMemo(() => new EventTarget(), []);
    const gridRef = useRef(null);
    const gridApiRef = useRef(null);
    const cachedTermsRef = useRef(new Map());
    const allSelectableCountRef = useRef(null);

    const selectedRef = useRef(selected);
    selectedRef.current = selected;

    const negatedRef = useRef(negated);
    negatedRef.current = negated;

    const pendingRef = useRef(pending);
    pendingRef.current = pending;

    const request = useMemo(() => ({
        configId, profileId, adType, campaignId, adGroupId, targetId,
        page, pageSize,
        ...(fromDate && toDate ? { fromDate, toDate } : {}),
    }), [configId, profileId, adType, campaignId, adGroupId, targetId, page, pageSize, fromDate, toDate]);

    // Fetch search terms from backend with backend pagination
    useEffect(() => {
        const controller = new AbortController();
        liveRequest.current = controller;
        setIsLoading(true);
        setLoadFailed(false);
        setFailedCount(0);
        requestInProgress.current = false;

        ApiGetTargetSearchTerms(request, controller.signal).then((response) => {
            if (!response?.isSuccess) throw new Error("Search terms request failed");
            if (!controller.signal.aborted) {
                setReport(response);
                setIsLoading(false);
            }
        }).catch(() => {
            if (!controller.signal.aborted) {
                setLoadFailed(true);
                setIsLoading(false);
            }
        });

        return () => controller.abort();
    }, [request, revision]);

    // Reset page and selection when target/scope changes
    useEffect(() => {
        setPage(1);
        setSelected(new Set());
        setNegated(new Map());
        cachedTermsRef.current = new Map();
        allSelectableCountRef.current = null;
    }, [configId, profileId, adType, campaignId, adGroupId, targetId, fromDate, toDate]);

    const rows = report?.searchTerms ?? [];
    const totalRecords = report?.totalRecords ?? report?.totalCount ?? rows.length;
    const totalPages = Math.max(1, report?.totalPages ?? Math.ceil(totalRecords / pageSize));

    // Cache rows so search terms across pages retain metadata (like isAsin)
    useEffect(() => {
        if (rows?.length) {
            for (const row of rows) {
                cachedTermsRef.current.set(row.searchTerm, row);
            }
        }
    }, [rows]);

    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    const reportRef = useRef(report);
    reportRef.current = report;

    const isAsin = (row) => row.isAsin === true;
    const activeNegative = (row) => negatedRef.current.get(row.searchTerm) ?? row.negatedMatchType;
    const canAct = (row) => reportRef.current?.canNegate && row.canNegate !== false && !activeNegative(row);
    const selectableOnPage = rows.filter(canAct);
    const selectableRef = useRef(selectableOnPage);
    selectableRef.current = selectableOnPage;

    // Check if all available records across all pages are selected
    const isAllTotalSelected = useMemo(() => {
        if (!totalRecords || totalRecords === 0 || selected.size === 0) return false;
        const targetCount = allSelectableCountRef.current != null ? allSelectableCountRef.current : totalRecords;
        return selected.size >= targetCount && targetCount > 0;
    }, [selected.size, totalRecords]);

    // Items selected for negation (can be from current page or across pages)
    const chosen = useMemo(() => {
        if (!selected.size) return [];
        const chosenMap = new Map();
        // Include any currently rendered rows matching selection
        for (const row of rows) {
            if (selected.has(row.searchTerm) && canAct(row)) {
                chosenMap.set(row.searchTerm, row);
            }
        }
        // Also keep any previously selected search terms even if navigated across pages
        for (const term of selected) {
            if (!chosenMap.has(term)) {
                const cached = cachedTermsRef.current.get(term);
                const activeNeg = negated.get(term) ?? cached?.negatedMatchType;
                if (!activeNeg) {
                    chosenMap.set(term, cached || { searchTerm: term, isAsin: false });
                }
            }
        }
        return Array.from(chosenMap.values());
    }, [selected, rows, negated]);

    const hasAsin = chosen.some(isAsin);
    const onlyAsins = chosen.length > 0 && chosen.every(isAsin);

    const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage), [i18n.resolvedLanguage]);
    const acosFormatter = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "percent",
        maximumFractionDigits: 2,
    }), [i18n.resolvedLanguage]);

    const number = useCallback((value) => numberFormatter.format(Number(value || 0)), [numberFormatter]);
    const format = useCallback((metric, value) => {
        if (metric === "spend" || metric === "sales") return CurrencyCode(value, currencyCode);
        if (metric === "acos") return value == null ? "—" : acosFormatter.format(Number(value) / 100);
        return numberFormatter.format(Number(value || 0));
    }, [currencyCode, acosFormatter, numberFormatter]);

    // Fast column autofit to distribute extra drawer space without horizontal scrollbar
    const fitColumns = useCallback(() => {
        if (gridApiRef.current && typeof gridApiRef.current.sizeColumnsToFit === "function") {
            gridApiRef.current.sizeColumnsToFit();
        }
    }, []);

    useEffect(() => {
        window.addEventListener("resize", fitColumns);
        return () => window.removeEventListener("resize", fitColumns);
    }, [fitColumns]);

    useEffect(() => {
        const el = document.getElementById("target-search-terms-grid-wrapper");
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            fitColumns();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [fitColumns]);

    const toggle = useCallback((term) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(term)) next.delete(term);
            else next.add(term);
            selectedRef.current = next;
            return next;
        });
        headerCheckboxEvents.dispatchEvent(new Event("change"));
        setTimeout(() => {
            gridRef.current?.api?.refreshCells({ columns: ["checkbox"], force: true });
        }, 0);
    }, [headerCheckboxEvents]);

    const togglePage = useCallback(() => {
        setSelected((previous) => {
            const next = new Set(previous);
            const selectable = selectableRef.current || [];
            const isAllSelected = selectable.length > 0 && selectable.every((r) => next.has(r.searchTerm));
            if (isAllSelected) {
                for (const { searchTerm } of selectable) next.delete(searchTerm);
            } else {
                for (const { searchTerm } of selectable) next.add(searchTerm);
            }
            selectedRef.current = next;
            return next;
        });
        headerCheckboxEvents.dispatchEvent(new Event("change"));
        setTimeout(() => {
            gridRef.current?.api?.refreshCells({ columns: ["checkbox"], force: true });
        }, 0);
    }, [headerCheckboxEvents]);

    // Select all records across all pages (or deselect all)
    const handleSelectAllPagesToggle = useCallback(async () => {
        if (!totalRecords || totalRecords === 0) return;

        if (isAllTotalSelected) {
            setSelected(new Set());
            selectedRef.current = new Set();
            headerCheckboxEvents.dispatchEvent(new Event("change"));
            setTimeout(() => {
                gridRef.current?.api?.refreshCells({ columns: ["checkbox"], force: true });
            }, 0);
            return;
        }

        // If current page contains all rows (single page)
        if (rows.length >= totalRecords) {
            const next = new Set();
            let selectableCount = 0;
            for (const row of rows) {
                cachedTermsRef.current.set(row.searchTerm, row);
                const activeNeg = negatedRef.current.get(row.searchTerm) ?? row.negatedMatchType;
                if (row.canNegate !== false && !activeNeg) {
                    next.add(row.searchTerm);
                    selectableCount++;
                }
            }
            allSelectableCountRef.current = selectableCount;
            setSelected(next);
            selectedRef.current = next;
            headerCheckboxEvents.dispatchEvent(new Event("change"));
            setTimeout(() => {
                gridRef.current?.api?.refreshCells({ columns: ["checkbox"], force: true });
            }, 0);
            return;
        }

        // Multi-page scenario: fetch all search terms from backend
        setSelectAllLoading(true);
        try {
            const res = await ApiGetTargetSearchTerms({
                ...request,
                page: 1,
                pageSize: totalRecords,
                fetchAll: true,
            });
            if (res?.isSuccess && Array.isArray(res.searchTerms)) {
                const next = new Set(selectedRef.current);
                let selectableCount = 0;
                for (const row of res.searchTerms) {
                    cachedTermsRef.current.set(row.searchTerm, row);
                    const activeNeg = negatedRef.current.get(row.searchTerm) ?? row.negatedMatchType;
                    if (row.canNegate !== false && !activeNeg) {
                        next.add(row.searchTerm);
                        selectableCount++;
                    }
                }
                allSelectableCountRef.current = selectableCount;
                setSelected(next);
                selectedRef.current = next;
                headerCheckboxEvents.dispatchEvent(new Event("change"));
                setTimeout(() => {
                    gridRef.current?.api?.refreshCells({ columns: ["checkbox"], force: true });
                }, 0);
            }
        } catch (err) {
            console.error("Failed to select all search terms:", err);
        } finally {
            setSelectAllLoading(false);
        }
    }, [totalRecords, isAllTotalSelected, rows, request, headerCheckboxEvents]);

    // Auto refresh cells and fit columns whenever row data updates
    useEffect(() => {
        headerCheckboxEvents.dispatchEvent(new Event("change"));
        setTimeout(() => {
            gridRef.current?.api?.refreshCells({ columns: ["actions", "checkbox"], force: true });
            fitColumns();
        }, 50);
    }, [rows, headerCheckboxEvents, fitColumns]);

    const negate = async (items, keywordMatchType) => {
        if (requestInProgress.current || !items.length) return;
        requestInProgress.current = true;
        const controller = liveRequest.current;
        setPending(true);
        setFailedCount(0);
        const terms = items.map((row) => ({
            searchTerm: row.searchTerm,
            matchType: isAsin(row) ? ASIN : keywordMatchType,
        }));
        let failed = 0;
        try {
            for (let start = 0; start < terms.length && !controller.signal.aborted; start += 100) {
                const batch = terms.slice(start, start + 100);
                let results;
                try {
                    results = (await ApiNegateTargetSearchTerms({ ...request, terms: batch }))?.results;
                } catch {
                    failed += batch.length;
                    continue;
                }
                if (controller.signal.aborted) return;
                const confirmed = new Map((Array.isArray(results) ? results : [])
                    .filter((result) => result.success === true)
                    .map((result) => [result.searchTerm, result.matchType]));
                const succeeded = batch.filter(({ searchTerm, matchType }) => confirmed.get(searchTerm) === matchType);
                setNegated((previous) => {
                    const next = new Map([...previous, ...succeeded.map(({ searchTerm, matchType }) => [searchTerm, matchType])]);
                    negatedRef.current = next;
                    return next;
                });
                setSelected((previous) => {
                    const next = new Set(previous);
                    succeeded.forEach(({ searchTerm }) => next.delete(searchTerm));
                    selectedRef.current = next;
                    return next;
                });
                headerCheckboxEvents.dispatchEvent(new Event("change"));
                setTimeout(() => {
                    gridRef.current?.api?.refreshCells({ columns: ["actions", "checkbox"], force: true });
                }, 0);
                failed += batch.length - succeeded.length;
            }
        } finally {
            if (!controller.signal.aborted) {
                requestInProgress.current = false;
                setFailedCount(failed);
                setPending(false);
            }
        }
    };

    const columnDefs = useMemo(() => {
        if (!report) return [];
        return [
            ...(report.canNegate ? [{
                field: "checkbox",
                headerName: "",
                width: 44,
                maxWidth: 44,
                minWidth: 44,
                suppressSizeToFit: true,
                suppressMovable: true,
                sortable: false,
                resizable: false,
                suppressMenu: true,
                filter: false,
                headerComponent: () => (
                    <TermsHeaderCheckbox
                        headerCheckboxEvents={headerCheckboxEvents}
                        selectableRef={selectableRef}
                        selectedRef={selectedRef}
                        pendingRef={pendingRef}
                        onToggleAll={togglePage}
                        t={t}
                    />
                ),
                cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
                cellRenderer: (params) => {
                    const row = params.data;
                    if (!row) return null;
                    const isRowSelected = selectedRef.current.has(row.searchTerm);
                    const activeNeg = negatedRef.current.get(row.searchTerm) ?? row.negatedMatchType;
                    const canNegateRow = reportRef.current?.canNegate && row.canNegate !== false && !activeNeg;
                    return (
                        <div
                            className="flex items-center justify-center w-full h-full cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!pendingRef.current && canNegateRow) toggle(row.searchTerm);
                            }}
                        >
                            <StyledCheckbox
                                checked={isRowSelected}
                                disabled={pendingRef.current || !canNegateRow}
                                onChange={() => {
                                    if (!pendingRef.current && canNegateRow) toggle(row.searchTerm);
                                }}
                            />
                        </div>
                    );
                },
            }] : []),
            {
                field: "searchTerm",
                headerName: t("Customer Search Term"),
                minWidth: 180,
                flex: 2,
                sortable: true,
                resizable: true,
                suppressMenu: true,
                cellRenderer: (params) => {
                    const row = params.data;
                    if (!row) return null;
                    return (
                        <div className="flex items-center gap-1.5 min-w-0 h-full">
                            <span className="truncate font-semibold text-slate-800 dark:text-slate-200" title={row.searchTerm}>
                                {row.searchTerm}
                            </span>
                            {isAsin(row) && (
                                <span className="font-mono text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1 py-0.2 rounded shrink-0">
                                    ASIN
                                </span>
                            )}
                        </div>
                    );
                },
            },
            {
                field: "spend",
                headerName: t("Spend"),
                minWidth: 85,
                flex: 0.9,
                sortable: true,
                resizable: true,
                suppressMenu: true,
                cellClass: "text-right font-medium tabular-nums text-slate-700 dark:text-slate-300",
                headerClass: "ag-right-aligned-header",
                valueFormatter: (params) => CurrencyCode(params.value, currencyCode),
            },
            {
                field: "sales",
                headerName: t("Sales"),
                minWidth: 85,
                flex: 0.9,
                sortable: true,
                resizable: true,
                suppressMenu: true,
                cellClass: "text-right font-medium tabular-nums text-slate-700 dark:text-slate-300",
                headerClass: "ag-right-aligned-header",
                valueFormatter: (params) => CurrencyCode(params.value, currencyCode),
            },
            {
                field: "clicks",
                headerName: t("Clicks"),
                minWidth: 70,
                flex: 0.8,
                sortable: true,
                resizable: true,
                suppressMenu: true,
                cellClass: "text-right font-medium tabular-nums text-slate-700 dark:text-slate-300",
                headerClass: "ag-right-aligned-header",
                valueFormatter: (params) => number(params.value),
            },
            {
                field: "orders",
                headerName: t("Purchases"),
                minWidth: 80,
                flex: 0.8,
                sortable: true,
                resizable: true,
                suppressMenu: true,
                cellClass: "text-right font-medium tabular-nums text-slate-700 dark:text-slate-300",
                headerClass: "ag-right-aligned-header",
                valueFormatter: (params) => number(params.value),
            },
            {
                field: "acos",
                headerName: t("ACoS"),
                minWidth: 75,
                flex: 0.8,
                sortable: true,
                resizable: true,
                suppressMenu: true,
                cellClass: "text-right font-medium tabular-nums",
                headerClass: "ag-right-aligned-header",
                cellRenderer: (params) => {
                    const val = params.value;
                    const isHighAcos = Number(val) > 50;
                    return (
                        <span className={isHighAcos ? "text-rose-600 dark:text-rose-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                            {val == null ? "—" : acosFormatter.format(Number(val) / 100)}
                        </span>
                    );
                },
            },
            ...(report.canNegate ? [{
                field: "actions",
                headerName: t("Actions"),
                width: 125,
                minWidth: 125,
                maxWidth: 130,
                suppressSizeToFit: true,
                sortable: false,
                resizable: false,
                suppressMenu: true,
                cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
                cellRenderer: (params) => {
                    const row = params.data;
                    if (!row) return null;
                    const negative = negatedRef.current.get(row.searchTerm) ?? row.negatedMatchType;
                    const asin = isAsin(row);
                    if (negative) {
                        return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm" title={t(matchLabels[negative] || "Negated")}>
                                <Check size={12} strokeWidth={2.5} />
                                {t("Negated")}
                            </span>
                        );
                    }
                    if (row.canNegate === false) {
                        return <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>;
                    }
                    if (asin) {
                        return (
                            <button
                                type="button"
                                disabled={pendingRef.current}
                                onClick={(e) => { e.stopPropagation(); negate([row], ASIN); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 shadow-sm transition-all cursor-pointer"
                            >
                                <Ban size={12} />
                                {t(matchLabels[ASIN])}
                            </button>
                        );
                    }
                    return (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        disabled={pendingRef.current}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all cursor-pointer"
                                        aria-label={`${t("Negate")}: ${row.searchTerm}`}
                                    >
                                        <Ban size={12} className="text-rose-500" />
                                        {t("Negate")}
                                        <ChevronDown size={12} className="opacity-60" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    className="w-40 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-[100060]"
                                    align="end"
                                    onCloseAutoFocus={(e) => e.preventDefault()}
                                >
                                    {keywordMatchTypes.map((match) => (
                                        <DropdownMenuItem
                                            key={match}
                                            onSelect={() => negate([row], match)}
                                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-[#38bdf8] transition-colors"
                                        >
                                            {t(matchLabels[match])}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                },
            }] : []),
        ];
    }, [report?.canNegate, currencyCode, acosFormatter, number, toggle, togglePage, negate, t, headerCheckboxEvents]);

    const dateLabel = fromDate && toDate ? `${fromDate} – ${toDate}` : t("All dates");

    return (
        <Sheet open onOpenChange={(open) => { if (!open && !requestInProgress.current) onClose(); }}>
            <SheetContent
                hideCloseButton={true}
                onPointerDownOutside={(e) => {
                    const target = e.target;
                    if (target && (target.closest?.('[role="menu"]') || target.closest?.('[data-radix-menu-content]') || target.closest?.('[data-radix-popper-content-wrapper]'))) {
                        e.preventDefault();
                    }
                }}
                className="target-terms-drawer sm:max-w-none p-0 border-l border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0c1222] shadow-2xl text-slate-900 dark:text-white flex flex-col h-full overflow-hidden data-[state=open]:!duration-300 data-[state=closed]:!duration-200 ease-out"
                style={{ width: "min(100vw, 920px)", zIndex: 100001 }}
                overlayStyle={{ zIndex: 100000 }}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (opener.current?.isConnected) opener.current.focus();
                }}
            >
                {/* Circuit top glow line indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                        opacity: 0.9,
                        zIndex: 10,
                    }}
                />

                {/* ── Modal / Drawer Header ── */}
                <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 flex-shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        {/* Left: Icon + Title + Meta badges */}
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-[#38bdf8] flex items-center justify-center flex-shrink-0 shadow-sm border border-sky-500/20 mt-0.5">
                                <FiSearch size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <SheetTitle className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white m-0">
                                        {t("Search Terms")}
                                    </SheetTitle>
                                    <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                        {dateLabel}
                                    </span>
                                </div>

                                {/* Target Details Badges */}
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {targetLabel && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-[#38bdf8] bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 rounded-full" title={targetLabel}>
                                            <FiTag size={11} className="shrink-0" />
                                            <span className="truncate max-w-[260px]">{targetLabel}</span>
                                        </span>
                                    )}
                                    {matchType && (
                                        <span className="inline-flex items-center text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                                            {matchType}
                                        </span>
                                    )}
                                    {rawBid != null && (
                                        <span className="inline-flex items-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2.5 py-0.5 rounded-full">
                                            {t("Bid")}: {CurrencyCode(rawBid, currencyCode)}
                                        </span>
                                    )}
                                    {campaignName && (
                                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px]" title={campaignName}>
                                            <FiLayers size={11} className="shrink-0 opacity-60" />
                                            <span className="truncate">{campaignName}</span>
                                        </span>
                                    )}
                                    {adGroupName && (
                                        <span className="inline-flex items-center text-xs text-slate-400 dark:text-slate-500 font-medium truncate max-w-[160px]" title={adGroupName}>
                                            • {adGroupName}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Close Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer opacity-80 hover:opacity-100 shadow-sm shrink-0"
                            title={t("Close")}
                        >
                            <MdOutlineClose size={18} />
                        </button>
                    </div>
                </header>

                {/* ── Status Messages ── */}
                {loadFailed && (
                    <div className="p-6 text-center" role="alert">
                        <div className="inline-flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium">
                            <FiInfo size={16} />
                            <span>{t("Could not load search terms.")}</span>
                            <button
                                type="button"
                                className="ml-2 font-bold underline hover:text-rose-900 dark:hover:text-rose-100 cursor-pointer"
                                onClick={() => setRevision((value) => value + 1)}
                            >
                                {t("Retry")}
                            </button>
                        </div>
                    </div>
                )}

                {isLoading && !report && !loadFailed && (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none">
                        <div className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
                            <span className="w-6 h-6 border-2 border-slate-300 border-t-[#1A82F4] rounded-full animate-spin" />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("Loading search terms…")}</span>
                        </div>
                    </div>
                )}

                {report && (
                    <>
                        {!rows.length && !isLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 dark:text-slate-400">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                                    <FiSearch size={22} />
                                </div>
                                <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">{t("No search terms found")}</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{t("There are no customer search terms recorded for this target in this date range.")}</p>
                            </div>
                        ) : (
                            <>
                                {/* ── Action Toolbar ── */}
                                <section className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 flex items-center justify-between gap-3 flex-shrink-0">
                                    <div className="flex items-center gap-3">
                                        {report.canNegate && totalRecords > 0 && (
                                            <RecommendationBulkSelection
                                                id="target-search-terms-select-all-btn"
                                                allSelected={isAllTotalSelected}
                                                selectedCount={selected.size}
                                                totalCount={totalRecords}
                                                loading={selectAllLoading}
                                                disabled={pending}
                                                onToggle={handleSelectAllPagesToggle}
                                            />
                                        )}
                                    </div>

                                    {report.canNegate && (
                                        <div className="flex items-center gap-2" id="target-search-terms-bulk-actions">
                                            {onlyAsins ? (
                                                <button
                                                    type="button"
                                                    disabled={pending || !chosen.length}
                                                    onClick={() => negate(chosen, ASIN)}
                                                    className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    <Ban size={13} strokeWidth={2.5} />
                                                    {pending ? t("Negating…") : t("Negate as ASIN Same As ({{count}})", { count: chosen.length })}
                                                </button>
                                            ) : (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            type="button"
                                                            disabled={pending || !chosen.length}
                                                            className="bg-[#1A82F4] hover:bg-[#0052FF] active:scale-95 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                                        >
                                                            <Ban size={13} strokeWidth={2.5} />
                                                            <span>
                                                                {pending
                                                                    ? t("Negating…")
                                                                    : chosen.length > 0
                                                                        ? t("Bulk Actions ({{count}})", { count: chosen.length })
                                                                        : t("Bulk Actions")}
                                                            </span>
                                                            <ChevronDown size={13} className="opacity-80 ml-0.5" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        className="w-44 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-[100060]"
                                                        onCloseAutoFocus={(e) => e.preventDefault()}
                                                    >
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2.5 py-1">
                                                            {t("Negate as")}
                                                        </div>
                                                        {keywordMatchTypes.map((match) => (
                                                            <DropdownMenuItem
                                                                key={match}
                                                                onSelect={() => negate(chosen, match)}
                                                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-[#38bdf8] transition-colors"
                                                            >
                                                                <Ban size={13} className="text-rose-500 shrink-0" />
                                                                <span>{t(matchLabels[match])}</span>
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    )}
                                </section>

                                {/* ── Guidance Note Banner ── */}
                                {report.canNegate && (
                                    <div className="px-6 py-2 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                        <FiInfo size={13} className="shrink-0 text-sky-500 dark:text-[#38bdf8]" />
                                        <span>
                                            {t("Note: Negatives apply to the entire ad group. ASIN search terms are automatically negated as ASIN Same As.")}
                                        </span>
                                    </div>
                                )}

                                {failedCount > 0 && (
                                    <div className="px-6 py-2 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2" role="alert">
                                        <FiInfo size={14} className="shrink-0" />
                                        <span>{t(failedCount === 1 ? "{{count}} search term could not be negated." : "{{count}} terms could not be negated.", { count: failedCount })}</span>
                                    </div>
                                )}

                                {/* ── AG-Grid Data Table (Native AdvertiseIQ Theme) ── */}
                                <div className="flex-1 min-h-0 px-5 pt-2 pb-3 w-full max-w-full flex flex-col overflow-hidden">
                                    <div
                                        className="data_table flex flex-col min-h-0 flex-1 [&_.glass-grid-container]:!rounded-xl [&_.iq-ag-table]:!rounded-t-xl [&_.ag-root-wrapper]:!rounded-t-xl [&_.iq-pagination]:!rounded-b-xl [&_.iq-pagination]:!flex-shrink-0"
                                        id="target-search-terms-grid-wrapper"
                                    >
                                        <AgTable
                                            ref={gridRef}
                                            tableId="target-search-terms-grid"
                                            height="100%"
                                            minHeight="260px"
                                            rowHeight={44}
                                            rowData={rows}
                                            columnDefs={columnDefs}
                                            totalRecords={totalRecords}
                                            perPage={pageSize}
                                            currentPage={page}
                                            onPageChange={(p) => setPage(p)}
                                            onPerPageChange={(size) => {
                                                setPageSize(size);
                                                setPage(1);
                                            }}
                                            paginationOptions={pageSizes}
                                            isCustomSaveColumns={false}
                                            enableCustomizeColumns={false}
                                            loading={isLoading}
                                            onRefresh={() => setRevision((v) => v + 1)}
                                            defaultColDef={{ resizable: true, sortable: true, suppressMenu: true }}
                                            getRowId={(params) => params.data?.searchTerm}
                                            suppressRowClickSelection={true}
                                            animateRows={false}
                                            suppressScrollOnNewData={true}
                                            debounceVerticalScrollbarUpdate={true}
                                            onGridReady={(params) => {
                                                gridApiRef.current = params?.api;
                                                setTimeout(() => params?.api?.sizeColumnsToFit?.(), 50);
                                                setTimeout(() => params?.api?.sizeColumnsToFit?.(), 300);
                                            }}
                                            onFirstDataRendered={(params) => params?.api?.sizeColumnsToFit?.()}
                                            onRowDataUpdated={(params) => params?.api?.sizeColumnsToFit?.()}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
