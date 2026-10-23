import { t } from 'i18next';
import { useEffect, useState } from 'react';
import { Button as ShadcnButton } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { RadioGroup, RadioGroupItem } from "../../../../components/ui/radio-group";
import { FiFilter, FiTrash2 } from 'react-icons/fi';

// Campaign status options for radio selection
const CAMPAIGN_STATUS_OPTIONS = [
    { label: "All", value: "" },
    { label: "Enabled", value: "ENABLED" },
    { label: "Paused", value: "PAUSED" },
    { label: "Out of Budget", value: "OUT_OF_BUDGET" },
    { label: "Ended", value: "ENDED" },
    { label: "Archived", value: "ARCHIVED" },
];

// Target status options for radio selection
const TYPE_OPTIONS = [
    { label: "All", value: "" },
    { label: "Sponsored Products", value: "Sponsored Products" },
    { label: "Sponsored Brands", value: "Sponsored Brands" },
    { label: "Sponsored Display", value: "Sponsored Display" },
];

const CampaignFilterModal = (props) => {
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        window.addEventListener("themeChanged", handle);
        return () => window.removeEventListener("themeChanged", handle);
    }, []);

    const {
        showFilterModal,
        handleModalClose: handleClose,
        CONDITION_OPTIONS,
        status,
        selectedFilterOption,
        type,
        setType,
        selectedCondition,
        setSelectedCondition,
        setStatus,
        setAppliedFilters,
        setFilterValue,
        filterValue,
    } = props;

    const handleModalClose = () => {
        handleClose()
    }

    // Handle remove filter
    const handleRemoveFilter = () => {
        if (selectedFilterOption) {
            setAppliedFilters(prev => prev.filter(filter => filter.type !== selectedFilterOption.value));
        }
        handleModalClose();
    };

    // Handle apply filter
    const handleApplyFilter = () => {
        let newFilter = null;

        if (selectedFilterOption?.value === "Status") {
            if (status) {
                newFilter = {
                    id: String(Date.now()),
                    type: "Status",
                    label: "Status",
                    value: status,
                    displayText: `Campaign Status: ${status}`
                };
            }
        } else if (selectedFilterOption?.value === "Type") {
            if (type) {
                newFilter = {
                    id: String(Date.now()),
                    type: "Type",
                    label: "Type",
                    value: type,
                    displayText: `Type: ${type}`
                };
            }
        } else {
            if (selectedFilterOption && selectedCondition && filterValue) {
                const fieldMap = {
                    "Time in Budget": "TimeInBudget",
                    Budget: "Budget",
                    Clicks: "Clicks",
                    Orders: "Orders",
                    Sales: "Sales",
                    ROAS: "ROAS",
                    ACOS: "ACOS",
                    Spend: "Spend",
                    Bid: "keywordBid"
                };
                const apiFieldName = fieldMap[selectedFilterOption.value] || selectedFilterOption.value;
                const conditionOption = CONDITION_OPTIONS.find(opt => opt.value === selectedCondition);
                const conditionLabel = conditionOption ? t(conditionOption.labelKey) : selectedCondition;

                newFilter = {
                    id: String(Date.now()),
                    type: selectedFilterOption.value,
                    label: selectedFilterOption.labelKey,
                    condition: selectedCondition,
                    value: filterValue,
                    apiFieldName: apiFieldName,
                    displayText: `${t(selectedFilterOption.labelKey)}: ${conditionLabel} ${filterValue}`
                };
            }
        }

        if (newFilter) {
            setAppliedFilters(prev => {
                const existingFilterIndex = prev.findIndex(filter => filter.type === newFilter.type);
                let updatedFilters;
                if (existingFilterIndex !== -1) {
                    updatedFilters = [...prev];
                    updatedFilters[existingFilterIndex] = newFilter;
                } else {
                    updatedFilters = [...prev, newFilter];
                }
                const uniqueFilters = updatedFilters.filter((filter, index, self) =>
                    index === self.findIndex(f =>
                        f.type === filter.type &&
                        f.condition === filter.condition &&
                        f.value === filter.value &&
                        f.apiFieldName === filter.apiFieldName
                    )
                );
                return uniqueFilters;
            });
            handleModalClose();
        }
    };

    return (
        <Dialog open={showFilterModal} onOpenChange={(open) => !open && handleModalClose()}>
            <DialogContent
                className="max-w-[480px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
                onInteractOutside={(e) => e.preventDefault()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {/* Glow Line Indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#EFF6FF] text-[#2374F2] border border-[#2374F2]/20 dark:bg-[rgba(60,187,242,0.15)] dark:border-[#2374F2]/30 dark:text-[#2374F2]">
                            <i className="fa fa-filter text-base"></i>
                        </div>
                        <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                            {selectedFilterOption ? t(selectedFilterOption.labelKey) : t("Filter")}
                        </DialogTitle>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-4">
                    {selectedFilterOption?.value === "Status" ? (
                        <RadioGroup value={status} onValueChange={setStatus} className="flex flex-col gap-2">
                            {CAMPAIGN_STATUS_OPTIONS.map(option => {
                                const isChecked = status === option.value;
                                return (
                                    <div
                                        key={option.value}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isChecked
                                            ? "bg-[#EFF6FF] border-[#2374F2] dark:bg-[rgba(60,187,242,0.15)]"
                                            : "bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5 border-slate-200 dark:border-white/10"
                                            }`}
                                        onClick={() => setStatus(option.value)}
                                    >
                                        <RadioGroupItem
                                            value={option.value}
                                            id={`status-${option.value}`}
                                        />
                                        <label
                                            htmlFor={`status-${option.value}`}
                                            className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex-grow"
                                        >
                                            {t(option.label)}
                                        </label>
                                    </div>
                                );
                            })}
                        </RadioGroup>
                    ) : selectedFilterOption?.value === "Type" ? (
                        <RadioGroup value={type} onValueChange={setType} className="flex flex-col gap-2">
                            {TYPE_OPTIONS.map(option => {
                                const isChecked = type === option.value;
                                return (
                                    <div
                                        key={option.value}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isChecked
                                            ? "bg-[#EFF6FF] border-[#2374F2] dark:bg-[rgba(60,187,242,0.15)]"
                                            : "bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5 border-slate-200 dark:border-white/10"
                                            }`}
                                        onClick={() => setType(option.value)}
                                    >
                                        <RadioGroupItem
                                            value={option.value}
                                            id={`type-${option.value}`}
                                        />
                                        <label
                                            htmlFor={`type-${option.value}`}
                                            className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex-grow"
                                        >
                                            {t(option.label)}
                                        </label>
                                    </div>
                                );
                            })}
                        </RadioGroup>
                    ) : (
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="flex-1 min-w-[120px]">
                                <Select
                                    value={selectedCondition || undefined}
                                    onValueChange={(val) => setSelectedCondition(val || "")}
                                >
                                    <SelectTrigger className="w-full h-[40px] text-xs font-semibold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10">
                                        <SelectValue placeholder={t('select')} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[9999]">
                                        {CONDITION_OPTIONS.map(option => (
                                            <SelectItem key={option.value} value={option.value} className="text-xs font-medium">
                                                {t(option.labelKey)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex-[1.5] relative">
                                {(selectedFilterOption?.value === "Spend" || selectedFilterOption?.value === "Sales" || selectedFilterOption?.value === "Bid" || selectedFilterOption?.value === "Budget") && (
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-500">₹</span>
                                )}
                                <input
                                    type="number"
                                    value={filterValue}
                                    onChange={(e) => {
                                        let val = e.target.value;
                                        val = val.replace(/^0+(?=\d)/, '');
                                        setFilterValue(val);
                                    }}
                                    placeholder={t("Enter value")}
                                    className={`w-full h-[40px] pr-8 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white ${(selectedFilterOption?.value === "Spend" || selectedFilterOption?.value === "Sales" || selectedFilterOption?.value === "Bid" || selectedFilterOption?.value === "Budget") ? "pl-7" : "pl-3"
                                        }`}
                                />
                                {(selectedFilterOption?.value === "ACOS" || selectedFilterOption?.value === "Time in Budget") && (
                                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-500">%</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 shrink-0 bg-white dark:bg-[#0c1222]/95">
                    <div className="flex items-center gap-2">
                        <ShadcnButton
                            variant="ghost"
                            onClick={() => {
                                setFilterValue("");
                                setStatus("");
                                setType("");
                            }}
                            className="h-[36px] px-3 rounded-lg text-[12px] font-bold text-[#203a5c] hover:text-[#2374F2] dark:text-slate-300 dark:hover:text-white"
                        >
                            {t("Clear Inputs")}
                        </ShadcnButton>
                        {/* Remove filter button removed as requested */}
                    </div>
                    <div className="flex gap-2">
                        <ShadcnButton
                            variant="outline"
                            className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                            onClick={handleModalClose}
                        >
                            {t("cancel")}
                        </ShadcnButton>
                        <ShadcnButton
                            className="bg-[#2374F2] hover:bg-[#2374F2]/90 border-0 rounded-lg px-6 h-[36px] font-semibold text-[13px] text-white shadow-none"
                            onClick={handleApplyFilter}
                        >
                            {t("Apply")}
                        </ShadcnButton>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CampaignFilterModal;