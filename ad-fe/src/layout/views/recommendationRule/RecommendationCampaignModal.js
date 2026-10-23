import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { ApigetCampaign } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import { groupCampaignIdsByType } from "../../../utility/common";
import { CampaignNameCell } from "../../../utility/campaignNavigation";
import {
    FiSearch,
    FiLayers,
    FiPlusCircle,
    FiMinusCircle,
    FiAlertCircle,
    FiInfo,
    FiPlus,
    FiCheck,
    FiTrash2,
    FiX,
    FiTag
} from "react-icons/fi";

const AD_TYPE_FILTERS = [
    { key: "All", label: "All Types" },
    { key: "Sponsored Products", label: "Products (SP)" },
    { key: "Sponsored Brands", label: "Brands (SB)" },
    { key: "Sponsored Display", label: "Display (SD)" },
];

const STATUS_FILTERS = [
    { key: "All", label: "All Statuses" },
    { key: "ENABLED", label: "Enabled" },
    { key: "PAUSED", label: "Paused" },
];

const TARGETING_TYPE_FILTERS = [
    { key: "All", label: "All Targeting" },
    { key: "MANUAL", label: "Manual" },
    { key: "AUTO", label: "Auto" },
];

function RecommendationCampaignModal({
    isOpen,
    onClose,
    onConfirm,
    initialSelectionType = "ALL",
    initialCampaignIds = { SP: [], SB: [], SD: [] },
    profileId,
    gridName,
    actions = [],
    ruleName = "",
}) {
    const { t } = useTranslation();
    const [selectionType, setSelectionType] = useState(initialSelectionType || "ALL");
    const [campaignList, setCampaignList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);

    // Tag-based Search States
    const [searchTags, setSearchTags] = useState([]);
    const [searchInputValue, setSearchInputValue] = useState("");

    const [selectedAdType, setSelectedAdType] = useState("All");
    const [selectedStatus, setSelectedStatus] = useState("All");
    const [selectedTargetingType, setSelectedTargetingType] = useState("All");
    const [validationError, setValidationError] = useState("");

    // Selected items filter and pagination
    const [selectedSearchQuery, setSelectedSearchQuery] = useState("");
    const [selectedCurrentPage, setSelectedCurrentPage] = useState(1);
    const [selectedPageSize, setSelectedPageSize] = useState(10);

    // Search results pagination
    const [searchCurrentPage, setSearchCurrentPage] = useState(1);
    const [searchPageSize, setSearchPageSize] = useState(10);

    // Dark mode
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Reset / Flatten initial campaign IDs on open
    useEffect(() => {
        if (isOpen) {
            setSelectionType(initialSelectionType || "ALL");
            setValidationError("");
            setSearchTags([]);
            setSearchInputValue("");
            setSelectedSearchQuery("");
            setSelectedCurrentPage(1);
            setSearchCurrentPage(1);

            let flatIds = [];
            if (Array.isArray(initialCampaignIds)) {
                flatIds = initialCampaignIds.map(Number);
            } else if (initialCampaignIds && typeof initialCampaignIds === "object") {
                flatIds = [
                    ...(initialCampaignIds.SP || []),
                    ...(initialCampaignIds.SB || []),
                    ...(initialCampaignIds.SD || []),
                ].map(Number);
            }
            setSelectedIds(flatIds);

            if (profileId) {
                fetchCampaigns(profileId);
            }
        }
    }, [isOpen, initialSelectionType, initialCampaignIds, profileId]);

    const fetchCampaigns = async (pId) => {
        setLoading(true);
        try {
            const res = await ApigetCampaign({ profileId: pId });
            if (res?.isSuccess && Array.isArray(res?.data)) {
                setCampaignList(res.data);
            } else {
                setCampaignList([]);
            }
        } catch (err) {
            console.error("Error fetching campaigns for recommendation:", err);
            setCampaignList([]);
        } finally {
            setLoading(false);
        }
    };

    // Check if Search Term rule has AddAsTargeting
    const isSearchTermGrid = gridName === "Search Term" || gridName === "searchTerm";
    const hasAddAsTargeting = isSearchTermGrid && actions.some((a) => a.actionName === "AddAsTargeting");

    // Tag Input Handlers (like ASIN search)
    const parseSearchString = (text) => {
        if (!text) return [];
        return text
            .split(/[\n,;\t]+/)
            .map((t) => t.trim())
            .filter(Boolean);
    };

    const addSearchTagsFromText = (text) => {
        const newTags = parseSearchString(text);
        if (newTags.length === 0) return;

        setSearchTags((prev) => {
            const next = [...prev];
            newTags.forEach((tag) => {
                if (!next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
                    next.push(tag);
                }
            });
            return next;
        });
        setSearchInputValue("");
        setSearchCurrentPage(1);
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (searchInputValue.trim()) {
                addSearchTagsFromText(searchInputValue);
            }
        } else if (e.key === "Backspace" && !searchInputValue && searchTags.length > 0) {
            setSearchTags(searchTags.slice(0, -1));
            setSearchCurrentPage(1);
        }
    };

    const handleSearchPaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData?.getData("text") || "";
        addSearchTagsFromText(pastedData);
    };

    const removeSearchTag = (tagToRemove) => {
        setSearchTags(searchTags.filter((tag) => tag !== tagToRemove));
        setSearchCurrentPage(1);
    };

    const clearAllSearchTags = () => {
        setSearchTags([]);
        setSearchInputValue("");
        setSearchCurrentPage(1);
    };

    // Active tokens for searching (all tags + current typed input)
    const activeSearchTokens = useMemo(() => {
        const tokens = [...searchTags];
        if (searchInputValue.trim()) {
            tokens.push(searchInputValue.trim());
        }
        return tokens;
    }, [searchTags, searchInputValue]);

    // Search Results: Tag-based match across name or campaignId
    const searchResults = useMemo(() => {
        const hasTokens = activeSearchTokens.length > 0;
        if (!hasTokens && selectedAdType === "All" && selectedStatus === "All" && selectedTargetingType === "All") {
            return [];
        }

        return campaignList.filter((campaign) => {
            const tType = campaign.targetingType?.toUpperCase() || (campaign.type === "Sponsored Products" ? "MANUAL" : "");

            // Amazon Ads only allows adding manual keyword targets to Manual campaigns.
            if (hasAddAsTargeting && tType === "AUTO") {
                return false;
            }

            // Tag search matching
            if (hasTokens) {
                const cName = campaign.name?.toLowerCase() || "";
                const cIdStr = String(campaign.campaignId);

                const matches = activeSearchTokens.some((token) => {
                    const lowerToken = token.toLowerCase();
                    return cName.includes(lowerToken) || cIdStr.includes(lowerToken);
                });

                if (!matches) return false;
            }

            // Ad Type filter
            if (selectedAdType !== "All" && campaign.type !== selectedAdType) {
                return false;
            }

            // Status filter
            if (selectedStatus !== "All" && campaign.status !== selectedStatus) {
                return false;
            }

            // Targeting Type filter
            if (selectedTargetingType !== "All") {
                if (selectedTargetingType === "AUTO" && tType !== "AUTO") return false;
                if (selectedTargetingType === "MANUAL" && tType === "AUTO") return false;
            }

            return true;
        });
    }, [campaignList, activeSearchTokens, selectedAdType, selectedStatus, selectedTargetingType, hasAddAsTargeting]);

    // Paginated search results
    const searchTotalPages = Math.ceil(searchResults.length / searchPageSize) || 1;
    const paginatedSearchResults = useMemo(() => {
        const start = (searchCurrentPage - 1) * searchPageSize;
        return searchResults.slice(start, start + searchPageSize);
    }, [searchResults, searchCurrentPage, searchPageSize]);

    // Full objects for selected campaigns
    const selectedCampaigns = useMemo(() => {
        return selectedIds.map((id) => {
            const found = campaignList.find((c) => Number(c.campaignId) === Number(id));
            return (
                found || {
                    campaignId: id,
                    name: `Campaign ID: ${id}`,
                    type: "Sponsored Products",
                    status: "ENABLED",
                    targetingType: "MANUAL",
                }
            );
        });
    }, [selectedIds, campaignList]);

    // Filtered selected campaigns (if user searches inside selected list)
    const filteredSelectedCampaigns = useMemo(() => {
        if (!selectedSearchQuery.trim()) return selectedCampaigns;
        const q = selectedSearchQuery.toLowerCase().trim();
        return selectedCampaigns.filter(
            (c) => c.name?.toLowerCase().includes(q) || String(c.campaignId).includes(q)
        );
    }, [selectedCampaigns, selectedSearchQuery]);

    // Paginated selected campaigns
    const selectedTotalPages = Math.ceil(filteredSelectedCampaigns.length / selectedPageSize) || 1;
    const paginatedSelectedCampaigns = useMemo(() => {
        const start = (selectedCurrentPage - 1) * selectedPageSize;
        return filteredSelectedCampaigns.slice(start, start + selectedPageSize);
    }, [filteredSelectedCampaigns, selectedCurrentPage, selectedPageSize]);

    // Actions
    const handleAddCampaign = (campaignId) => {
        setValidationError("");
        const numId = Number(campaignId);
        if (!selectedIds.includes(numId)) {
            setSelectedIds((prev) => [...prev, numId]);
        }
    };

    const handleRemoveCampaign = (campaignId) => {
        setValidationError("");
        const numId = Number(campaignId);
        setSelectedIds((prev) => prev.filter((id) => id !== numId));
    };

    const handleAddAllSearchResults = () => {
        setValidationError("");
        const resultIds = searchResults.map((c) => Number(c.campaignId));
        setSelectedIds((prev) => Array.from(new Set([...prev, ...resultIds])));
    };

    const handleClearAllSelected = () => {
        setValidationError("");
        setSelectedIds([]);
        setSelectedCurrentPage(1);
    };

    // Handle Confirm
    const handleConfirm = () => {
        if (selectionType === "INCLUDE" && selectedIds.length === 0) {
            setValidationError(t("Please search and select at least one campaign to include."));
            return;
        }

        if (selectionType === "EXCLUDE" && selectedIds.length === 0) {
            setValidationError(t("Please search and select at least one campaign to exclude."));
            return;
        }

        const groupedIds =
            selectionType === "ALL"
                ? { SP: [], SB: [], SD: [] }
                : groupCampaignIdsByType(selectedIds, campaignList);

        onConfirm({
            campaignSelectionType: selectionType,
            campaignIds: groupedIds,
        });

        onClose();
    };

    const isSearchActive =
        activeSearchTokens.length > 0 ||
        selectedAdType !== "All" ||
        selectedStatus !== "All" ||
        selectedTargetingType !== "All";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="max-w-[1000px] w-[95vw] p-0 rounded-[16px] bg-white text-slate-900 border border-slate-200 dark:bg-[#0c1222] dark:border-white/10 dark:text-white flex flex-col font-sans max-h-[90vh] overflow-hidden gap-0 shadow-2xl"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131b2e] flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <FiLayers className="text-[#1A9FD4]" />
                            {t("Campaign Scope & Selection")}
                        </DialogTitle>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-0">
                            {ruleName ? (
                                <span>
                                    {t("Configuring scope for:")}{" "}
                                    <b className="text-slate-700 dark:text-slate-200">{ruleName}</b>
                                </span>
                            ) : (
                                t("Choose which campaigns will be evaluated by this recommendation rule.")
                            )}
                        </p>
                    </div>
                </DialogHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 max-h-[calc(90vh-140px)]">
                    {/* Scope Selector Cards */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2.5">
                            {t("Apply Recommendation Rule To:")}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* All Campaigns */}
                            <div
                                onClick={() => {
                                    setSelectionType("ALL");
                                    setValidationError("");
                                }}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                                    selectionType === "ALL"
                                        ? "border-[#1A9FD4] bg-sky-500/10 text-sky-900 dark:text-sky-200 shadow-sm"
                                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-sm flex items-center gap-2">
                                        <FiLayers className="text-[#1A9FD4]" />
                                        {t("All Campaigns")}
                                    </span>
                                    <input
                                        type="radio"
                                        name="selectionType"
                                        checked={selectionType === "ALL"}
                                        onChange={() => {
                                            setSelectionType("ALL");
                                            setValidationError("");
                                        }}
                                        className="h-4 w-4 text-[#1A9FD4] focus:ring-[#1A9FD4]"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0">
                                    {t("Automatically evaluate all active campaigns across the profile.")}
                                </p>
                            </div>

                            {/* Include Campaigns */}
                            <div
                                onClick={() => {
                                    setSelectionType("INCLUDE");
                                    setValidationError("");
                                }}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                                    selectionType === "INCLUDE"
                                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 shadow-sm"
                                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-sm flex items-center gap-2">
                                        <FiPlusCircle className="text-emerald-500" />
                                        {t("Include Campaigns")}
                                    </span>
                                    <input
                                        type="radio"
                                        name="selectionType"
                                        checked={selectionType === "INCLUDE"}
                                        onChange={() => {
                                            setSelectionType("INCLUDE");
                                            setValidationError("");
                                        }}
                                        className="h-4 w-4 text-emerald-500 focus:ring-emerald-500"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0">
                                    {t("Generate recommendations exclusively for selected campaigns.")}
                                </p>
                            </div>

                            {/* Exclude Campaigns */}
                            <div
                                onClick={() => {
                                    setSelectionType("EXCLUDE");
                                    setValidationError("");
                                }}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                                    selectionType === "EXCLUDE"
                                        ? "border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-200 shadow-sm"
                                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-sm flex items-center gap-2">
                                        <FiMinusCircle className="text-rose-500" />
                                        {t("Exclude Campaigns")}
                                    </span>
                                    <input
                                        type="radio"
                                        name="selectionType"
                                        checked={selectionType === "EXCLUDE"}
                                        onChange={() => {
                                            setSelectionType("EXCLUDE");
                                            setValidationError("");
                                        }}
                                        className="h-4 w-4 text-rose-500 focus:ring-rose-500"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0">
                                    {t("Evaluate all campaigns except the ones explicitly selected.")}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Auto campaign constraint note */}
                    {hasAddAsTargeting && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs">
                            <FiInfo className="mt-0.5 flex-shrink-0 text-amber-500 text-sm" />
                            <div>
                                <b>{t("Auto Campaigns Excluded:")}</b>{" "}
                                {t(
                                    "Amazon Ads only allows adding keyword targets to Manual campaigns. Auto campaigns are automatically excluded from search."
                                )}
                            </div>
                        </div>
                    )}

                    {/* Validation Error Banner */}
                    {validationError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                            <FiAlertCircle className="text-sm flex-shrink-0" />
                            <span>{validationError}</span>
                        </div>
                    )}

                    {/* Search & Selection Section (Visible for INCLUDE and EXCLUDE) */}
                    {selectionType !== "ALL" && (
                        <div className="flex flex-col gap-4">
                            {/* Step 1: Search Tag Input & Filters */}
                            <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-white/[0.02]">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                        <FiTag className="text-[#1A9FD4]" />
                                        <span>{t("Search & Add Campaigns")}</span>
                                        {searchTags.length > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1A9FD4]/10 text-[#1A9FD4] border border-[#1A9FD4]/30">
                                                {searchTags.length} {t("tags")}
                                            </span>
                                        )}
                                    </label>
                                    <span className="text-[11px] text-slate-400">
                                        {t("Type & press Enter or paste multiple terms/IDs (comma or newline separated)")}
                                    </span>
                                </div>

                                {/* Tag-based Search Input Bar + Filters */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Tag Container */}
                                    <div
                                        className="flex-1 min-w-[280px] min-h-[38px] p-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] flex flex-wrap items-center gap-1.5 focus-within:ring-1 focus-within:ring-[#1A9FD4] focus-within:border-[#1A9FD4] transition-all cursor-text"
                                        onClick={() => document.getElementById("campaign-tag-search-input")?.focus()}
                                    >
                                        <FiSearch className="text-slate-400 text-sm flex-shrink-0 mr-0.5" />

                                        {/* Rendered Search Tags */}
                                        {searchTags.map((tag, idx) => (
                                            <span
                                                key={idx}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 max-w-[220px]"
                                            >
                                                <span className="truncate">{tag}</span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeSearchTag(tag);
                                                    }}
                                                    className="hover:text-rose-500 transition-colors flex-shrink-0 ml-0.5"
                                                >
                                                    <FiX className="text-xs" />
                                                </button>
                                            </span>
                                        ))}

                                        {/* Input */}
                                        <input
                                            id="campaign-tag-search-input"
                                            type="text"
                                            value={searchInputValue}
                                            onChange={(e) => {
                                                setSearchInputValue(e.target.value);
                                                setSearchCurrentPage(1);
                                            }}
                                            onKeyDown={handleSearchKeyDown}
                                            onPaste={handleSearchPaste}
                                            placeholder={
                                                searchTags.length === 0
                                                    ? t("Type name/ID or paste list (comma/newline separated)...")
                                                    : t("Add more...")
                                            }
                                            style={{
                                                border: "none",
                                                outline: "none",
                                                boxShadow: "none",
                                                background: "transparent",
                                            }}
                                            className="campaign-tag-inner-input flex-1 min-w-[140px] !bg-transparent !border-0 !border-none !outline-none !shadow-none !ring-0 focus:!ring-0 focus:!outline-none focus:!border-none focus:!shadow-none text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 p-0 h-6"
                                        />

                                        {/* Clear All Tags */}
                                        {(searchTags.length > 0 || searchInputValue) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    clearAllSearchTags();
                                                }}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 flex-shrink-0"
                                                title={t("Clear search")}
                                            >
                                                <FiX className="text-sm" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Ad Type Filter */}
                                    <Select
                                        value={selectedAdType}
                                        onValueChange={(val) => {
                                            setSelectedAdType(val);
                                            setSearchCurrentPage(1);
                                        }}
                                    >
                                        <SelectTrigger className="w-[135px] h-9 text-xs bg-white dark:bg-[#0f172a]">
                                            <SelectValue placeholder={t("Ad Type")} />
                                        </SelectTrigger>
                                        <SelectContent className="z-[10000]">
                                            {AD_TYPE_FILTERS.map((f) => (
                                                <SelectItem key={f.key} value={f.key} className="text-xs">
                                                    {t(f.label)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Status Filter */}
                                    <Select
                                        value={selectedStatus}
                                        onValueChange={(val) => {
                                            setSelectedStatus(val);
                                            setSearchCurrentPage(1);
                                        }}
                                    >
                                        <SelectTrigger className="w-[120px] h-9 text-xs bg-white dark:bg-[#0f172a]">
                                            <SelectValue placeholder={t("Status")} />
                                        </SelectTrigger>
                                        <SelectContent className="z-[10000]">
                                            {STATUS_FILTERS.map((f) => (
                                                <SelectItem key={f.key} value={f.key} className="text-xs">
                                                    {t(f.label)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Targeting Type Filter */}
                                    {isSearchTermGrid && !hasAddAsTargeting && (
                                        <Select
                                            value={selectedTargetingType}
                                            onValueChange={(val) => {
                                                setSelectedTargetingType(val);
                                                setSearchCurrentPage(1);
                                            }}
                                        >
                                            <SelectTrigger className="w-[120px] h-9 text-xs bg-white dark:bg-[#0f172a]">
                                                <SelectValue placeholder={t("Targeting")} />
                                            </SelectTrigger>
                                            <SelectContent className="z-[10000]">
                                                {TARGETING_TYPE_FILTERS.map((f) => (
                                                    <SelectItem key={f.key} value={f.key} className="text-xs">
                                                        {t(f.label)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    {isSearchTermGrid && hasAddAsTargeting && (
                                        <div className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium">
                                            <span>{t("Manual Only")}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Step 2: Search Results Box (Rendered ONLY when search is active) */}
                                {isSearchActive && (
                                    <div className="mt-2 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#0f172a] shadow-sm">
                                        <div className="px-3 py-2 bg-slate-100 dark:bg-[#1a2333] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                    {t("Search Results")} ({searchResults.length})
                                                </span>
                                                {activeSearchTokens.length > 1 && (
                                                    <span className="text-[10px] text-slate-400">
                                                        ({t("matching")} {activeSearchTokens.length} {t("tags")})
                                                    </span>
                                                )}
                                            </div>
                                            {searchResults.length > 0 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleAddAllSearchResults}
                                                    className="h-6 px-2 text-xs font-semibold text-[#1A9FD4] hover:bg-sky-50 dark:hover:bg-sky-500/10"
                                                >
                                                    <FiPlus className="mr-1" />
                                                    {t("Add All Results")} ({searchResults.length})
                                                </Button>
                                            )}
                                        </div>

                                        {loading ? (
                                            <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
                                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#1A9FD4]"></div>
                                                <span>{t("Searching campaigns...")}</span>
                                            </div>
                                        ) : searchResults.length === 0 ? (
                                            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                                                {t("No campaigns found matching your search tags.")}
                                            </div>
                                        ) : (
                                            <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                                                {paginatedSearchResults.map((campaign) => {
                                                    const isAlreadyAdded = selectedIds.includes(Number(campaign.campaignId));
                                                    const isSP = campaign.type === "Sponsored Products";
                                                    const isSB = campaign.type === "Sponsored Brands";
                                                    const isSD = campaign.type === "Sponsored Display";
                                                    const isAuto = campaign.targetingType?.toUpperCase() === "AUTO";

                                                    return (
                                                        <div
                                                            key={campaign.campaignId}
                                                            className={`p-2.5 px-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${
                                                                isAlreadyAdded ? "bg-slate-50/80 dark:bg-white/[0.01]" : ""
                                                            }`}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-xs text-slate-800 dark:text-slate-100 truncate">
                                                                    {campaign.name}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                                        ID: {campaign.campaignId}
                                                                    </span>
                                                                    <span
                                                                        className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                                                                            isSP
                                                                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                                                : isSB
                                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                                                : isSD
                                                                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                                                                                : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                                                                        }`}
                                                                    >
                                                                        {isSP ? "SP" : isSB ? "SB" : isSD ? "SD" : campaign.type}
                                                                    </span>
                                                                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/30">
                                                                        {isAuto ? "AUTO" : "MANUAL"}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center">
                                                                {isAlreadyAdded ? (
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleRemoveCampaign(campaign.campaignId)}
                                                                        className="h-7 w-7 p-0 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 border border-emerald-500/30 hover:border-rose-500/30 transition-all flex items-center justify-center"
                                                                        title={t("Added (Click to remove)")}
                                                                    >
                                                                        <FiCheck className="text-sm" />
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        onClick={() => handleAddCampaign(campaign.campaignId)}
                                                                        className={`h-7 w-7 p-0 rounded-md text-white flex items-center justify-center transition-all ${
                                                                            selectionType === "INCLUDE"
                                                                                ? "bg-emerald-600 hover:bg-emerald-700"
                                                                                : "bg-rose-600 hover:bg-rose-700"
                                                                        }`}
                                                                        title={t("Add campaign")}
                                                                    >
                                                                        <FiPlus className="text-sm" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Search pagination if > 10 */}
                                        {searchResults.length > searchPageSize && (
                                            <div className="px-3 py-1.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131b2e] flex items-center justify-between text-[11px] text-slate-500">
                                                <span>
                                                    {searchCurrentPage} / {searchTotalPages}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSearchCurrentPage((p) => Math.max(1, p - 1))}
                                                        disabled={searchCurrentPage === 1}
                                                        className="h-6 px-2 text-[11px]"
                                                    >
                                                        {t("Prev")}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            setSearchCurrentPage((p) => Math.min(searchTotalPages, p + 1))
                                                        }
                                                        disabled={searchCurrentPage >= searchTotalPages}
                                                        className="h-6 px-2 text-[11px]"
                                                    >
                                                        {t("Next")}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Step 3: Selected Campaigns Section */}
                            <div className="flex flex-col gap-3 border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-white/[0.02]">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                            {selectionType === "INCLUDE" ? t("Included Campaigns") : t("Excluded Campaigns")}
                                        </label>
                                        <span
                                            className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                                                selectionType === "INCLUDE"
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                            }`}
                                        >
                                            {selectedIds.length} {t("Selected")}
                                        </span>
                                    </div>

                                    {selectedIds.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            {selectedIds.length > 5 && (
                                                <div className="relative">
                                                    <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                                                    <Input
                                                        type="text"
                                                        value={selectedSearchQuery}
                                                        onChange={(e) => {
                                                            setSelectedSearchQuery(e.target.value);
                                                            setSelectedCurrentPage(1);
                                                        }}
                                                        placeholder={t("Filter selected...")}
                                                        className="pl-7 h-7 text-xs w-[160px] bg-white dark:bg-[#0f172a]"
                                                    />
                                                </div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleClearAllSelected}
                                                className="h-7 px-2.5 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                            >
                                                <FiTrash2 className="mr-1" />
                                                {t("Clear All")}
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {/* Selected Campaigns Table */}
                                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#0f172a]">
                                    {selectedIds.length === 0 ? (
                                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 text-xs text-center px-4">
                                            <FiPlusCircle className="text-3xl text-slate-300 dark:text-slate-600" />
                                            <span className="font-medium text-slate-600 dark:text-slate-300">
                                                {t("No campaigns selected yet.")}
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                                {t("Use the search bar above to find campaigns and click '+' to include/exclude them.")}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead className="bg-slate-100 dark:bg-[#1a2333] border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
                                                    <tr>
                                                        <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1a2333]">
                                                            {t("Campaign Name")}
                                                        </th>
                                                        <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 w-24 bg-slate-100 dark:bg-[#1a2333]">
                                                            {t("Ad Type")}
                                                        </th>
                                                        <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 w-24 bg-slate-100 dark:bg-[#1a2333]">
                                                            {t("Targeting")}
                                                        </th>
                                                        <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 w-24 bg-slate-100 dark:bg-[#1a2333]">
                                                            {t("Status")}
                                                        </th>
                                                        <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 w-20 text-center bg-slate-100 dark:bg-[#1a2333]">
                                                            {t("Action")}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                    {paginatedSelectedCampaigns.map((campaign) => {
                                                        const isSP = campaign.type === "Sponsored Products";
                                                        const isSB = campaign.type === "Sponsored Brands";
                                                        const isSD = campaign.type === "Sponsored Display";
                                                        const isAuto = campaign.targetingType?.toUpperCase() === "AUTO";

                                                        return (
                                                            <tr
                                                                key={campaign.campaignId}
                                                                className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                                                            >
                                                                <td className="p-2.5">
                                                                    <div className="font-medium text-slate-800 dark:text-slate-100 block break-words">
                                                                        <CampaignNameCell row={campaign} name={campaign.name} campaignId={campaign.campaignId} />
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                                        ID: {campaign.campaignId}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5">
                                                                    <span
                                                                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                                                            isSP
                                                                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                                                : isSB
                                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                                                : isSD
                                                                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                                                                                : "bg-slate-500/10 text-slate-600 border-slate-500/30"
                                                                        }`}
                                                                    >
                                                                        {isSP ? "SP" : isSB ? "SB" : isSD ? "SD" : campaign.type}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5">
                                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/30">
                                                                        {isAuto ? "AUTO" : "MANUAL"}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5">
                                                                    <span
                                                                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                                                            campaign.status === "ENABLED"
                                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                                                : "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/30"
                                                                        }`}
                                                                    >
                                                                        {t(campaign.status || "UNKNOWN")}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleRemoveCampaign(campaign.campaignId)}
                                                                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md"
                                                                        title={t("Remove")}
                                                                    >
                                                                        <FiTrash2 className="text-sm" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Pagination for Selected Campaigns */}
                                    {filteredSelectedCampaigns.length > 0 && (
                                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131b2e] text-xs text-slate-500 dark:text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    {t("Showing")}{" "}
                                                    {Math.min(
                                                        (selectedCurrentPage - 1) * selectedPageSize + 1,
                                                        filteredSelectedCampaigns.length
                                                    )}{" "}
                                                    -{" "}
                                                    {Math.min(
                                                        selectedCurrentPage * selectedPageSize,
                                                        filteredSelectedCampaigns.length
                                                    )}{" "}
                                                    {t("of")} {filteredSelectedCampaigns.length}
                                                </span>
                                                <Select
                                                    value={String(selectedPageSize)}
                                                    onValueChange={(val) => {
                                                        setSelectedPageSize(Number(val));
                                                        setSelectedCurrentPage(1);
                                                    }}
                                                >
                                                    <SelectTrigger className="min-w-[105px] w-auto h-7 px-2 text-xs bg-white dark:bg-[#0f172a]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="z-[10000]">
                                                        {[5, 10, 25, 50].map((size) => (
                                                            <SelectItem key={size} value={String(size)} className="text-xs">
                                                                {size} / page
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setSelectedCurrentPage((p) => Math.max(1, p - 1))}
                                                    disabled={selectedCurrentPage === 1}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    {t("Previous")}
                                                </Button>
                                                <span className="px-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                    {selectedCurrentPage} / {selectedTotalPages}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        setSelectedCurrentPage((p) =>
                                                            Math.min(selectedTotalPages, p + 1)
                                                        )
                                                    }
                                                    disabled={selectedCurrentPage >= selectedTotalPages}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    {t("Next")}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131b2e]">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        className="h-9 px-4 text-xs font-medium"
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleConfirm}
                        className="h-9 px-5 text-xs font-semibold customize-button"
                    >
                        {selectionType === "ALL"
                            ? t("Apply & Save Scope")
                            : `${t("Apply & Save Scope")} (${selectedIds.length})`}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default RecommendationCampaignModal;
