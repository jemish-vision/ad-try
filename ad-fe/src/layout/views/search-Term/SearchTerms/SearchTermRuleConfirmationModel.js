import { useEffect, useState, useContext } from "react";
import { createPortal } from "react-dom";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { useTranslation } from "react-i18next";
import DataTable from "react-data-table-component";
import { ApiRuleEffectedSearchTerms } from "../../../../api-wrapper/search-term/ApiSearchTerm";
import CurrencyCode, { getCurrencySymbol } from "../../../../helper/currencyCode/CurrencyCode";
import { tableStyles } from "../../../../helper/table/TableStyle";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { getSuggestedCampaignNames } from "../../../../utility/campaignNameSuggestion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { FiAlertCircle, FiSettings, FiCheckCircle } from 'react-icons/fi';
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiGetRuleSettings } from "../../../../api-wrapper/ApiAdsConfig";

const AD_TABS = [
    { key: "All", label: "All" },
    { key: "SP", label: "Products" },
    { key: "SB", label: "Brands" },
    { key: "SD", label: "Display" },
];

const BID_MIN = 1.5;
const BID_MAX = 500;

function SearchTermRuleConfirmationModel({
    showModal,
    level,
    setLevel,
    setShowModal,
    ruleId,
    type,
    actionValue,
    title,
    onConfirm
}) {
    const { profileId, currencyCode } = useContext(ProfileContext);

    const [rawData, setRawData] = useState({ SP: [], SB: [], SD: [] });
    const [activeTab, setActiveTab] = useState("All");
    const [loading, setLoading] = useState(false);
    const [bidErrors, setBidErrors] = useState({});
    const [selectionError, setSelectionError] = useState(false);
    const [customEditRow, setCustomEditRow] = useState(null);
    const [customCampaignName, setCustomCampaignName] = useState("");
    const [campaignNameErrors, setCampaignNameErrors] = useState({});
    const { t } = useTranslation();
    const [campaignPrefix, setCampaignPrefix] = useState("");

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        if (showModal && profileId?.value) {
            ApiGetRuleSettings({ profileId: profileId.value })
                .then((res) => {
                    if (res?.isSuccess && res?.data?.searchTermRuleSetting?.campaignPrefix) {
                        setCampaignPrefix(res.data.searchTermRuleSetting.campaignPrefix);
                    } else {
                        setCampaignPrefix("");
                    }
                })
                .catch(() => setCampaignPrefix(""));
        }
    }, [showModal, profileId?.value]);

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const handleClose = () => {
        setRawData({ SP: [], SB: [], SD: [] });
        setSelectionError(false);
        setCustomEditRow(null);
        setCustomCampaignName("");
        setCampaignNameErrors({});
        setShowModal(false);
    };

    useEffect(() => {
        if (showModal && ruleId) fetchData();
    }, [showModal, ruleId]);

    useEffect(() => {
        if (showModal) setActiveTab("All");
    }, [showModal]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await ApiRuleEffectedSearchTerms(ruleId);
            if (res?.isSuccess) {
                setRawData({
                    SP: (res.data?.SP || []).map(r => ({ ...r, newlyAppliedCampaignName: "" })),
                    SB: (res.data?.SB || []).map(r => ({ ...r, bid: r.bid ?? BID_MIN, newlyAppliedCampaignName: "" })),
                    SD: (res.data?.SD || []).map(r => ({ ...r, newlyAppliedCampaignName: "" })),
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getTabData = (tab) => {
        if (tab === "All") return [
            ...rawData.SP.map(r => ({ ...r, _type: "SP" })),
            ...rawData.SB.map(r => ({ ...r, _type: "SB" })),
            ...rawData.SD.map(r => ({ ...r, _type: "SD" })),
        ];
        return rawData[tab] ?? [];
    };

    const tableData = getTabData(activeTab);

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
                color: 'inherit',
                backgroundColor: 'transparent',
                minHeight: '200px',
            },
        },
    };

    const updateRow = (type, row, checked) => {
        setSelectionError(false);
        setRawData(prev => ({
            ...prev,
            [type]: prev[type].map(item =>
                (item.searchTerm === row.searchTerm &&
                    item.campaignId === row.campaignId &&
                    item.adGroupId === row.adGroupId &&
                    item.keywordType === row.keywordType)
                    ? { ...item, addToNegative: checked }
                    : item
            ),
        }));
    };

    const statusHandler = (event, row) => {
        const type = activeTab === "All" ? row._type : activeTab;
        updateRow(type, row, event.target.checked);
    };

    // Rows with keywordType TARGETING_EXPRESSION_PREDEFINED (Auto) cannot be manually selected
    const isRowDisabled = (row) => row.keywordType === "TARGETING_EXPRESSION_PREDEFINED";

    const eligibleTableData = tableData.filter(r => !isRowDisabled(r));
    const allChecked = eligibleTableData.length > 0 && eligibleTableData.every(r => r.addToNegative);

    const handleSelectAll = (e) => {
        const checked = e.target.checked;
        setSelectionError(false);
        if (activeTab === "All") {
            setRawData(prev => ({
                SP: prev.SP.map(r => isRowDisabled(r) ? r : { ...r, addToNegative: checked }),
                SB: prev.SB.map(r => isRowDisabled(r) ? r : { ...r, addToNegative: checked }),
                SD: prev.SD.map(r => isRowDisabled(r) ? r : { ...r, addToNegative: checked }),
            }));
        } else {
            setRawData(prev => ({
                ...prev,
                [activeTab]: prev[activeTab].map(r => isRowDisabled(r) ? r : { ...r, addToNegative: checked }),
            }));
        }
    };

    // Generate a unique key for each SB row for bid error tracking
    const getSBRowKey = (row) => `${row.searchTerm}__${row.campaignId}__${row.adGroupId}__${row?.keywordType}`;
    const getRowKey = (row) => `${row.searchTerm}__${row.campaignId}__${row.adGroupId}__${row?.keywordType}`;

    const handleBidChange = (row, value) => {
        const rowKey = getSBRowKey(row);
        const numVal = value === "" ? "" : Number(value);

        // Validate
        let error = "";
        if (value === "") {
            error = t("Bid is required");
        } else if (isNaN(numVal)) {
            error = t("Must be a number");
        } else if (numVal < BID_MIN) {
            error = t(`Min bid is ${BID_MIN}`);
        } else if (numVal > BID_MAX) {
            error = t(`Max bid is ${BID_MAX}`);
        }

        setBidErrors(prev => ({ ...prev, [rowKey]: error }));

        setRawData(prev => ({
            ...prev,
            SB: prev.SB.map(item => (item.searchTerm === row.searchTerm && item.campaignId === row.campaignId && item.adGroupId === row.adGroupId && item.keywordType === row.keywordType) ? { ...item, bid: value } : item
            ),
        }));
    };

    const handleCampaignNameSelectChange = (row, value) => {
        const rowKey = getRowKey(row);
        setCampaignNameErrors(prev => {
            const next = { ...prev };
            delete next[rowKey];
            return next;
        });

        if (value === "custom") {
            setCustomCampaignName(row.newlyAppliedCampaignName || "");
            setCustomEditRow(row);
        } else {
            const targetTab = activeTab === "All" ? row._type : activeTab;
            setRawData(prev => ({
                ...prev,
                [targetTab]: prev[targetTab].map(item =>
                    (item.searchTerm === row.searchTerm &&
                        item.campaignId === row.campaignId &&
                        item.adGroupId === row.adGroupId &&
                        item.keywordType === row.keywordType)
                        ? { ...item, newlyAppliedCampaignName: value }
                        : item
                )
            }));
        }
    };

    const handleSaveCustomCampaignName = () => {
        if (!customCampaignName.trim() || !customEditRow) return;
        const row = customEditRow;
        const rowKey = getRowKey(row);
        setCampaignNameErrors(prev => {
            const next = { ...prev };
            delete next[rowKey];
            return next;
        });

        const targetTab = activeTab === "All" ? row._type : activeTab;

        setRawData(prev => ({
            ...prev,
            [targetTab]: prev[targetTab].map(item =>
                (item.searchTerm === row.searchTerm &&
                    item.campaignId === row.campaignId &&
                    item.adGroupId === row.adGroupId &&
                    item.keywordType === row.keywordType)
                    ? { ...item, newlyAppliedCampaignName: customCampaignName.trim() }
                    : item
            )
        }));

        setCustomEditRow(null);
    };

    const handleConfirm = () => {
        let hasError = false;
        const newErrors = {};

        if (type === "TARGETING") {
            rawData.SB.forEach(row => {
                if (row.addToNegative) {
                    const rowKey = getSBRowKey(row);
                    const bid = row.bid;
                    if (bid === undefined || bid === "" || bid === null) {
                        newErrors[rowKey] = t("Bid is required");
                        hasError = true;
                    } else {
                        const numVal = Number(bid);
                        if (isNaN(numVal) || numVal < BID_MIN || numVal > BID_MAX) {
                            newErrors[rowKey] = t(`Bid must be between ${BID_MIN} and ${BID_MAX}`);
                            hasError = true;
                        }
                    }
                }
            });
        }

        if (hasError) {
            setBidErrors(prev => ({ ...prev, ...newErrors }));
            return;
        }

        let hasCampaignError = false;
        const newCampErrors = {};
        if (type === "CREATE_CAMPAIGN") {
            const allTabs = ["SP", "SB", "SD"];
            allTabs.forEach(tab => {
                rawData[tab].forEach(row => {
                    if (row.addToNegative) {
                        const name = row.newlyAppliedCampaignName;
                        if (!name || !name.trim()) {
                            const rowKey = getRowKey(row);
                            newCampErrors[rowKey] = t("Campaign name is required");
                            hasCampaignError = true;
                        }
                    }
                });
            });
        }

        if (hasCampaignError) {
            setCampaignNameErrors(newCampErrors);
            return;
        }

        const filtered = {
            SP: rawData.SP.filter(r => r.addToNegative === true),
            SB: rawData.SB.filter(r => r.addToNegative === true).map(r => ({ ...r, ...(type === "TARGETING" ? { bid: Number(r.bid) } : {}) })),
            SD: rawData.SD.filter(r => r.addToNegative === true),
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
                    title={"Select all (Auto targeting rows are excluded)"}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
            ),
            width: "50px",
            selector: (row) => row.addToNegative,
            cell: (row) => {
                const disabled = isRowDisabled(row);
                return (
                    <input
                        type="checkbox"
                        name="addToNegative"
                        onChange={(event) => !disabled && statusHandler(event, row)}
                        checked={!!row.addToNegative}
                        value={row.addToNegative}
                        disabled={disabled}
                        title={disabled ? "Auto targeting rows cannot be selected" : undefined}
                        style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}
                        className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                );
            },
        },
        {
            name: t("Type"),
            selector: (row) => row._type,
            cell: (row) => {
                const typeMap = { SP: "Products", SB: "Brands", SD: "Display" };
                const colorMap = { SP: "#0d6efd", SB: "#198754", SD: "#fd7e14" };
                const type = row._type ?? activeTab;
                return type ? (
                    <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: `${colorMap[type]}1a`,
                        color: colorMap[type],
                        border: `1px solid ${colorMap[type]}40`,
                        whiteSpace: "nowrap"
                    }}>
                        {t(typeMap[type] ?? type)}
                    </span>
                ) : null;
            },
            width: "100px",
            omit: activeTab !== "All",
        },
        {
            name: t("Search Term"),
            selector: (row) => row.searchTerm,
            wrap: true,
            minWidth: "180px"
        },
        {
            name: t("New Campaign Name"),
            omit: type !== "CREATE_CAMPAIGN",
            width: "260px",
            cell: (row) => {
                const suggestions = getSuggestedCampaignNames(row, actionValue, campaignPrefix) || [];
                const selectedValue = row.newlyAppliedCampaignName || undefined;
                const isCustom = selectedValue && !suggestions.find(s => s.name === selectedValue);

                const selectOptions = [
                    ...suggestions.map(s => ({
                        value: s.name,
                        label: s.name,
                        source: s.source,
                        sourceLabel: s.label,
                    })),
                    ...(isCustom ? [{ value: selectedValue, label: selectedValue, source: "custom", sourceLabel: "Custom" }] : []),
                    { value: "custom", label: t("+ Create Custom Name..."), isCustomAction: true }
                ];

                const SOURCE_TAG_STYLE = {
                    existing: { background: "#EAF3DE", color: "#3B6D11", border: "0.5px solid #97C459" },
                    ai: { background: "#E6F1FB", color: "#185FA5", border: "0.5px solid #85B7EB" },
                    custom: { background: "#FAEEDA", color: "#854F0B", border: "0.5px solid #EF9F27" },
                };

                const rowKey = getRowKey(row);
                const error = campaignNameErrors[rowKey];
                const isRequired = !!row.addToNegative;

                return (
                    <div style={{ width: "100%" }}>
                        <Select
                            value={selectedValue || undefined}
                            onValueChange={(value) => handleCampaignNameSelectChange(row, value)}
                        >
                            <SelectTrigger className={`w-full text-[13px] ${error && isRequired ? "border-red-500" : ""}`}>
                                <SelectValue placeholder={t("Select Campaign Name")}>
                                    {(() => {
                                        const selectedOpt = selectOptions.find(opt => opt.value === selectedValue);
                                        return selectedOpt ? (
                                            <span className="truncate block max-w-[200px]" title={typeof selectedOpt.label === "string" ? selectedOpt.label : undefined}>
                                                {selectedOpt.label}
                                            </span>
                                        ) : undefined;
                                    })()}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px] z-[10000]">
                                {selectOptions.map((option) => {
                                    if (option.isCustomAction) {
                                        return (
                                            <SelectItem key={option.value} value={option.value} className="font-semibold text-blue-600 py-1">
                                                {option.label}
                                            </SelectItem>
                                        );
                                    }
                                    const tagStyle = SOURCE_TAG_STYLE[option.source] || SOURCE_TAG_STYLE.ai;
                                    return (
                                        <SelectItem key={option.value} value={option.value}>
                                            <div className="flex flex-col gap-[3px] py-1">
                                                <div className="whitespace-normal break-words leading-[1.4] text-[13px]">
                                                    {option.label}
                                                </div>
                                                {option.source === "existing" && (
                                                    <span style={{
                                                        display: "inline-block",
                                                        alignSelf: "flex-start",
                                                        fontSize: 10,
                                                        fontWeight: 500,
                                                        padding: "1px 7px",
                                                        borderRadius: 99,
                                                        lineHeight: "16px",
                                                        ...(SOURCE_TAG_STYLE[option.source] || SOURCE_TAG_STYLE.ai),
                                                    }}>
                                                        {option.sourceLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                        {error && isRequired && (
                            <div style={{ color: "#dc3545", fontSize: "10px", marginTop: "2px", lineHeight: 1.2 }}>
                                {error}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            name: t("Bid"),
            omit: type !== "TARGETING" || (activeTab !== "All" && activeTab !== "SB"),
            width: "140px",
            cell: (row) => {
                const rowType = row._type ?? activeTab;
                if (rowType !== "SB") return null;

                const rowKey = getSBRowKey(row);
                const error = bidErrors[rowKey];
                const isRequired = !!row.addToNegative;

                return (
                    <div style={{ width: "100%" }}>
                        <div style={{ position: "relative" }}>
                            <span style={{
                                position: "absolute",
                                left: "8px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#6c757d",
                                fontSize: "12px",
                                lineHeight: 1,
                                pointerEvents: "none",
                            }}>{getCurrencySymbol(currencyCode)}</span>
                            <input
                                type="number"
                                min={BID_MIN}
                                max={BID_MAX}
                                step="0.01"
                                value={row.bid ?? BID_MIN}
                                onChange={(e) => handleBidChange(row, e.target.value)}
                                placeholder={`${BID_MIN}–${BID_MAX}`}
                                className="w-full pl-5 pr-1 py-1 text-xs border rounded bg-white dark:bg-white/5 dark:text-white dark:border-white/10 focus:ring-1 focus:ring-sky-500"
                                style={{
                                    border: `1px solid ${error && isRequired ? "#dc3545" : "#ced4da"}`
                                }}
                            />
                        </div>
                        {error && isRequired && (
                            <div style={{
                                color: "#dc3545",
                                fontSize: "10px",
                                marginTop: "2px",
                                lineHeight: 1.2,
                            }}>
                                {error}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            name: t("Campaign Name"),
            selector: (row) => row.campaignName,
            wrap: true,
            minWidth: "200px"
        },
        {
            name: t("Ad Group Name"),
            selector: (row) => row.adGroupname,
            wrap: true,
            minWidth: "200px"
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
            name: t("Spend"),
            selector: (row) => row.spend,
            cell: (row) => CurrencyCode(row.spend),
            right: true,
            width: "120px"
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
            width: "120px"
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

    return (
        <>
            <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent
                    className="max-w-[90vw] w-[1200px] p-6 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] dark:text-white flex flex-col max-h-[92vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5"
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    {/* Top Glow Indicator */}
                    <div
                        className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                        style={{
                            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                            opacity: 0.8
                        }}
                    />

                    <DialogHeader className="p-0 shrink-0 mb-3 text-left">
                        <DialogTitle className="flex items-center gap-3">
                            <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400 p-2 rounded-xl flex items-center justify-center flex-shrink-0">
                                <FiSettings size={16} />
                            </span>
                            <div className="text-base font-bold text-slate-900 dark:text-white leading-tight font-sans">
                                {title}
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    {/* Tabs area */}
                    <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-100 dark:border-white/10 pb-4">
                        {AD_TABS.map(({ key, label }) => {
                            const active = activeTab === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setActiveTab(key)}
                                    className={`h-[34px] px-4 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200 border ${active
                                        ? "bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] border-transparent text-white shadow-[0_4px_12px_rgba(26,159,212,0.25)]"
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                                        }`}
                                >
                                    {t(label)}
                                    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                                        }`}>
                                        {tabCount(key)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2 font-sans font-medium">
                        <span>{t("Below data will be affected. Please confirm.")}</span>
                        <span>{t("Total: ")}<strong className="text-slate-800 dark:text-slate-200">{tableData.length}</strong> {t("Records")}</span>
                    </div>

                    {type === "TARGETING" && (activeTab === "All" || activeTab === "SB") && (
                        <div className="flex items-start gap-2 p-3 bg-[#1A9FD4]/5 border border-[#1A9FD4]/10 text-[#1A9FD4] dark:text-[#1A9FD4] rounded-xl text-xs mb-3">
                            <FiAlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                            <div>
                                <strong className="font-semibold">{t("Brands (SB):")}</strong>{" "}
                                {t(`A bid is required for each selected SB row (min ${getCurrencySymbol(currencyCode)}${BID_MIN} – max ${getCurrencySymbol(currencyCode)}${BID_MAX}).`)}
                            </div>
                        </div>
                    )}

                    {selectionError && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl text-xs mb-3">
                            <FiAlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                            <div>{t("Please select at least one target to Run Search Term Rule Manually.")}</div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto min-h-[300px] border border-slate-100 dark:border-white/5 rounded-xl bg-slate-50/50 dark:bg-white/[0.01]" id="searchTerm-main-table">
                        <DataTable
                            className="table_content !bg-transparent dark:!text-white"
                            customStyles={customTableStyles}
                            columns={columns}
                            striped={true}
                            data={tableData}
                            progressPending={loading}
                            highlightOnHover
                            fixedHeader
                            fixedHeaderScrollHeight="48vh"
                            noDataComponent={
                                <div className="flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500 font-sans min-h-[200px]">
                                    <FiAlertCircle size={24} className="mb-2 opacity-50" />
                                    <span className="text-sm font-medium">{t("There are no records to display")}</span>
                                </div>
                            }
                        />
                    </div>

                    {["TARGETING", "NEGATIVE_TARGETING"]?.includes(type) && (
                        <div className="flex items-center gap-6 mt-4 p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-xs font-sans border border-slate-100 dark:border-transparent">
                            <div className="font-bold text-slate-700 dark:text-slate-300">{t("Add Negative to:")}</div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="modal-level"
                                        checked={level === "Campaign"}
                                        onChange={() => setLevel("Campaign")}
                                        className="w-4 h-4 accent-[#1A9FD4] cursor-pointer"
                                    />
                                    <span className="font-medium text-slate-600 dark:text-slate-300">{t("Campaign Level")}</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="modal-level"
                                        checked={level === "Ad Group"}
                                        onChange={() => setLevel("Ad Group")}
                                        className="w-4 h-4 accent-[#1A9FD4] cursor-pointer"
                                    />
                                    <span className="font-medium text-slate-600 dark:text-slate-300">{t("Ad Group Level")}</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
                        <button
                            type="button"
                            className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                            onClick={handleClose}
                        >
                            {t("No")}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white shadow-[0_4px_12px_rgba(26,159,212,0.25)] hover:opacity-90 active:scale-[0.98]"
                        >
                            {t("Yes")}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {createPortal(
                <Dialog open={!!customEditRow} onOpenChange={(open) => !open && setCustomEditRow(null)}>
                    <DialogContent
                        className="max-w-[460px] w-[95vw] p-6 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] z-[10001]"
                        onInteractOutside={(e) => e.preventDefault()}
                        onEscapeKeyDown={(e) => e.preventDefault()}
                    >
                        <DialogHeader className="p-0 shrink-0 mb-3 text-left">
                            <DialogTitle className="flex items-center gap-3">
                                <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400 p-2 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <FiCheckCircle size={16} />
                                </span>
                                <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight font-sans">
                                    {t("Custom Campaign Name")}
                                </div>
                            </DialogTitle>
                        </DialogHeader>

                        <div className="flex flex-col gap-4 text-left font-sans">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t("Enter Custom Campaign Name")}
                                </label>
                                <Input
                                    type="text"
                                    value={customCampaignName}
                                    onChange={(e) => setCustomCampaignName(e.target.value)}
                                    placeholder={t("e.g. SP - Ph - Spirulina | Theme")}
                                    autoFocus
                                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400"
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCustomEditRow(null);
                                        }
                                        if (e.key === "Enter" && customCampaignName.trim()) {
                                            handleSaveCustomCampaignName();
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
                            <button
                                type="button"
                                className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                                onClick={() => setCustomEditRow(null)}
                            >
                                {t("Cancel")}
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveCustomCampaignName}
                                disabled={!customCampaignName.trim()}
                                className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_4px_12px_rgba(26,159,212,0.25)] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t("Save")}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>,
                document.body
            )}
        </>
    );
}

export default SearchTermRuleConfirmationModel;
