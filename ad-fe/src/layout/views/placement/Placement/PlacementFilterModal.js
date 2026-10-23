import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Button as ShadcnButton } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { FiFilter, FiSearch, FiChevronLeft, FiX, FiTrash2 } from 'react-icons/fi';
import { getCurrencySymbol } from '../../../../helper/currencyCode/CurrencyCode';


const PlacementFilterModal = (props) => {
    const { t } = useTranslation();
    const {
        showFilterModal,
        handleModalClose: handleClose,

        CONDITION_OPTIONS,

        selectedFilterOption,
        campaignsLoading,
        campaignsData,
        selectedCampaigns,
        selectedAdGroups,
        selectedCondition,
        setSelectedCondition,
        setAppliedFilters,
        setFilterValue,
        filterValue,
        setSelectedAdGroups,
        setSelectedCampaigns,

        getCampaignsData
    } = props;
    const [currentView, setCurrentView] = useState("campaigns");
    const [adGroupsData, setAdGroupsData] = useState([]);
    const [currentCampaignForAdGroups, setCurrentCampaignForAdGroups] = useState(null);
    const [campaignSearchTerm, setCampaignSearchTerm] = useState("");

    // Debounced search for campaigns
    useEffect(() => {
        if (!showFilterModal) return;
        const debounceTimer = setTimeout(() => {
            if (campaignSearchTerm) getCampaignsData(campaignSearchTerm);
        }, 500); // 500ms debounce
        return () => clearTimeout(debounceTimer);
    }, [campaignSearchTerm, showFilterModal]);

    const handleModalClose = () => {
        setCurrentView("campaigns");
        setAdGroupsData([]);
        setCurrentCampaignForAdGroups(null);
        setCampaignSearchTerm("");
        handleClose()
    }

    // Handle remove filter
    const handleRemoveFilter = () => {
        if (selectedFilterOption) {
            setAppliedFilters(prev => prev.filter(filter => filter.type !== selectedFilterOption.value));
        }
        handleModalClose();
    };

    // Handle showing ad groups for a campaign
    const handleShowAdGroups = (campaign) => {
        setCurrentView("adgroups");
        setCurrentCampaignForAdGroups(campaign);
        setAdGroupsData(campaign.adGroups);
    };

    // Handle going back to campaigns view
    const handleBackToCampaigns = () => {
        setCurrentView("campaigns");
        setCurrentCampaignForAdGroups(null);
        setAdGroupsData([]);
    };

    // Handle ad group removal
    const handleAdGroupRemoval = (adGroupId) => {
        setSelectedAdGroups(prev => prev.filter(adGroup => adGroup.id !== adGroupId));
    };

    // Handle campaign selection
    const handleCampaignSelection = (campaign) => {
        if (selectedCampaigns.some(c => c.id === campaign.id)) {
            return;
        }
        setSelectedCampaigns(prev => [...prev, campaign]);
        setSelectedAdGroups(prev => prev.filter(ag => ag.campaignId !== campaign.id));
    };

    // Handle campaign removal
    const handleCampaignRemoval = (campaignId) => {
        setSelectedCampaigns(prev => prev.filter(campaign => campaign.id !== campaignId));
    };

    // Handle ad group selection
    const handleAdGroupSelection = (adGroup) => {
        if (selectedAdGroups.some(ag => ag.id === adGroup.id)) {
            return;
        }
        setSelectedAdGroups(prev => [...prev, adGroup]);
        setSelectedCampaigns(prev => prev.filter(campaign => campaign.id !== adGroup.campaignId));
    };

    // Handle apply filter
    const handleApplyFilter = () => {
        let newFilter = null;

        if (selectedFilterOption?.value === "CampaignsAndAdGroups") {
            const totalSelections = selectedCampaigns.length + selectedAdGroups.length;
            if (totalSelections > 0) {
                newFilter = {
                    id: String(Date.now()),
                    type: "CampaignsAndAdGroups",
                    label: "Campaigns and ad groups",
                    value: [...selectedCampaigns, ...selectedAdGroups],
                    displayText: `Campaigns & Ad Groups: ${totalSelections} selected`
                };
            }
        } else {
            if (selectedFilterOption && selectedCondition && filterValue) {
                const fieldMap = {
                    Impressions: "Impressions",
                    Clicks: "Clicks",
                    Orders: "Orders",
                    Sales: "Sales",
                    ROAS: "ROAS",
                    ACOS: "ACOS",
                    Spend: "Spend",
                    BidAdjustment: "placementModifier"
                };
                const apiFieldName = fieldMap[selectedFilterOption.value] || selectedFilterOption.value;
                const conditionOption = CONDITION_OPTIONS.find(opt => opt.value === selectedCondition);
                const conditionLabel = conditionOption ? t(conditionOption.labelKey) : selectedCondition;

                newFilter = {
                    id: String(Date.now()),
                    type: selectedFilterOption.value,
                    label: selectedFilterOption.labelKey || selectedFilterOption.value,
                    condition: selectedCondition,
                    value: filterValue,
                    apiFieldName: apiFieldName,
                    displayText: `${t(selectedFilterOption.labelKey || selectedFilterOption.value)}: ${conditionLabel} ${filterValue}`
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
                return updatedFilters.filter((filter, index, self) =>
                    index === self.findIndex(f =>
                        f.type === filter.type &&
                        f.condition === filter.condition &&
                        f.value === filter.value &&
                        f.apiFieldName === filter.apiFieldName
                    )
                );
            });
            handleModalClose();
        }
    };

    const isCampaignSelected = (campaignId) => {
        return selectedCampaigns.some(campaign => campaign.id === campaignId);
    };

    const isAdGroupSelected = (adGroupId) => {
        const isDirectlySelected = selectedAdGroups.some(adGroup => adGroup.id === adGroupId);
        const adGroup = campaignsData.flatMap(campaign => campaign.adGroups).find(ag => ag.id === adGroupId);
        const isCampaignSelected = adGroup ? selectedCampaigns.some(campaign => campaign.id === adGroup.campaignId) : false;
        return isDirectlySelected || isCampaignSelected;
    };

    const hasActiveFilter = selectedFilterOption && props.appliedFilters?.some(f => f.type === selectedFilterOption.value);

    return (
        <Dialog open={showFilterModal} onOpenChange={(open) => !open && handleModalClose()}>
            <DialogContent
                className={`${selectedFilterOption?.value === "CampaignsAndAdGroups" ? "max-w-[1140px]" : "max-w-[600px]"} w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans max-h-[85vh]`}
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
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30 dark:bg-white/5">
                    {selectedFilterOption?.value === "CampaignsAndAdGroups" ? (
                        <div className="flex flex-col md:flex-row h-full">
                            {/* Left Side (Campaign List) */}
                            <div className="w-full md:w-1/2 pr-0 md:pr-4 border-r-0 md:border-r border-slate-200 dark:border-white/10">
                                {/* Back button for ad groups view */}
                                {currentView === "adgroups" && (
                                    <div className="mb-3">
                                        <button
                                            type="button"
                                            onClick={handleBackToCampaigns}
                                            className="py-2 px-3 w-full justify-start rounded-lg border border-slate-200 dark:border-white/10 flex items-center gap-2 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors font-medium bg-transparent text-slate-900 dark:text-slate-200"
                                        >
                                            <FiChevronLeft size={14} className="opacity-70" />
                                            <span className="truncate"><strong>{currentCampaignForAdGroups?.name}</strong></span>
                                        </button>
                                    </div>
                                )}

                                {/* Search box - only show for campaigns view */}
                                {currentView === "campaigns" && (
                                    <div className="mb-3">
                                        <div className="relative">
                                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]" size={14} />
                                            <input
                                                type="text"
                                                placeholder={t("Search by campaign name")}
                                                value={campaignSearchTerm}
                                                onChange={(e) => setCampaignSearchTerm(e.target.value)}
                                                className="w-full h-10 pl-9 pr-3 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-white/20 text-slate-900 dark:text-white shadow-sm"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Main List */}
                                <div className="py-2 overflow-y-auto max-h-[320px] min-h-[320px] pr-1 custom-scroll">
                                    {campaignsLoading ? (
                                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                            <span className="text-sm text-slate-500">{t("Loading campaigns...")}</span>
                                        </div>
                                    ) : currentView === "campaigns" ? (
                                        campaignsData.length > 0 ? (
                                            campaignsData.map(campaign => (
                                                <div key={campaign.id} className="py-2 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-lg transition-colors border-b border-slate-100 dark:border-white/10">
                                                    <div className="truncate max-w-[65%]">
                                                        <div className="font-medium truncate text-[13px] text-slate-900 dark:text-white/90" title={campaign.name}>
                                                            {campaign.name}
                                                        </div>
                                                        <small className="text-[11px] text-slate-500">{t("Sponsored Products")}</small>
                                                    </div>
                                                    <div className="ml-2 flex items-center gap-3 text-[12.5px]">
                                                        {isCampaignSelected(campaign.id) ? (
                                                            <span className="text-slate-500 italic">{t("Added")}</span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCampaignSelection(campaign)}
                                                                className="font-semibold text-primary hover:opacity-80 cursor-pointer"
                                                            >
                                                                {t("Add")}
                                                            </button>
                                                        )}
                                                        {campaign.adGroups && campaign.adGroups.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleShowAdGroups(campaign)}
                                                                className="font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                                                            >
                                                                {t("Ad groups ›")}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex justify-center items-center py-10 text-sm text-slate-500">
                                                {t("No campaigns found")}
                                            </div>
                                        )
                                    ) : (
                                        adGroupsData?.map(adGroup => (
                                            <div key={adGroup.id} className="py-2 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-lg transition-colors border-b border-slate-100 dark:border-white/10">
                                                <div className="truncate max-w-[75%]">
                                                    <div className="font-medium truncate text-[13px] text-slate-900 dark:text-white/90" title={adGroup.name}>
                                                        {adGroup.name}
                                                    </div>
                                                </div>
                                                <div className="ml-2 text-[12.5px]">
                                                    {isAdGroupSelected(adGroup.id) ? (
                                                        <span className="text-slate-500 italic">{t("Added")}</span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAdGroupSelection(adGroup)}
                                                            className="font-semibold text-primary hover:opacity-80 cursor-pointer"
                                                        >
                                                            {t("Add")}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right Side (Selected Items) */}
                            <div className="w-full md:w-1/2 md:pl-4 mt-4 md:mt-0">
                                <p className="font-bold mb-2 text-[14px] text-slate-900 dark:text-white/90">
                                    {selectedCampaigns?.length || 0} {t("Selected Campaigns")} & {selectedAdGroups?.length || 0} {t("Ad Groups")}
                                </p>
                                <div className="py-2 overflow-y-auto max-h-[320px] min-h-[320px] pr-1 custom-scroll">
                                    {selectedCampaigns.length === 0 && selectedAdGroups.length === 0 ? (
                                        <div className="flex h-full min-h-[250px] flex-col items-center justify-center py-10 border border-dashed border-slate-300 dark:border-white/10 rounded-lg bg-slate-50 dark:bg-white/5 text-sm text-slate-500">
                                            {t("No campaigns or ad groups selected yet")}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            {selectedCampaigns.map(campaign => (
                                                <div key={`c-${campaign.id}`} className="py-2 px-3 flex justify-between items-center hover:bg-slate-100 rounded-lg mb-1 bg-slate-50 border-b border-slate-100 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10">
                                                    <div className="truncate max-w-[85%]">
                                                        <div className="font-semibold text-[13px] text-slate-900 dark:text-white/90 truncate" title={campaign.name}>{campaign.name}</div>
                                                        <span className="text-[11px] text-slate-500">{t("Campaign")}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCampaignRemoval(campaign.id)}
                                                        className="text-slate-500 hover:text-red-500 transition-colors p-1"
                                                    >
                                                        <FiX size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            {selectedAdGroups.map(adGroup => (
                                                <div key={`ag-${adGroup.id}`} className="py-2 px-3 flex justify-between items-center hover:bg-slate-100 rounded-lg mb-1 bg-slate-50 border-b border-slate-100 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10">
                                                    <div className="truncate max-w-[85%]">
                                                        <div className="font-semibold text-[13px] text-slate-900 dark:text-white/90 truncate" title={`${adGroup.campaignName} › ${adGroup.name}`}>{adGroup.campaignName} › {adGroup.name}</div>
                                                        <span className="text-[11px] text-slate-500">{t("Ad Group")}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAdGroupRemoval(adGroup.id)}
                                                        className="text-slate-500 hover:text-red-500 transition-colors p-1"
                                                    >
                                                        <FiX size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
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
                                {(selectedFilterOption?.value === "Spend" || selectedFilterOption?.value === "Sales" || selectedFilterOption?.value === "Bid" || selectedFilterOption?.value === "BidAdjustment") && (
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-500">{getCurrencySymbol()}</span>
                                )}
                                <input
                                    type="number"
                                    value={filterValue || ""}
                                    onChange={(e) => {
                                        let val = e.target.value;
                                        val = val.replace(/^0+(?=\d)/, '');
                                        setFilterValue(val);
                                    }}
                                    placeholder={t("Enter value")}
                                    className={`w-full h-[40px] pr-8 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white ${(selectedFilterOption?.value === "Spend" || selectedFilterOption?.value === "Sales" || selectedFilterOption?.value === "Bid" || selectedFilterOption?.value === "BidAdjustment") ? "pl-7" : "pl-3"
                                        }`}
                                    onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
                                />
                                {selectedFilterOption?.value === "ACOS" && (
                                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-500">%</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-white/10 shrink-0 bg-white dark:bg-[#0c1222]/95">
                    <div>
                        {hasActiveFilter && (
                            <ShadcnButton
                                variant="ghost"
                                onClick={handleRemoveFilter}
                                className="h-[36px] px-3 gap-1.5 text-xs font-bold text-red-500 hover:text-red-650 hover:bg-red-500/10"
                            >
                                <FiTrash2 size={13} />
                                {t("Remove Filter")}
                            </ShadcnButton>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
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

export default PlacementFilterModal;