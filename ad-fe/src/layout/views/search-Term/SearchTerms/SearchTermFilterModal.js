import { t } from 'i18next';
import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import { Label } from "../../../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../../components/ui/dialog";
import { getCurrencySymbol } from '../../../../helper/currencyCode/CurrencyCode';


const CAMPAIGN_STATUS_OPTIONS = [
    { label: "Enabled", value: "ENABLED" },
    { label: "Paused", value: "PAUSED" },
    { label: "Archived", value: "ARCHIVED" }
];

const SearchTermFilterModal = (props) => {
    const {
        showFilterModal,
        handleModalClose: handleClose,

        CONDITION_OPTIONS,

        selectedCampaignStatus,
        setSelectedCampaignStatus,
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

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");


    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);



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
        // If campaign is already selected, do nothing
        if (selectedCampaigns.some(c => c.id === campaign.id)) {
            return;
        }

        // Add campaign to selected campaigns
        setSelectedCampaigns(prev => [...prev, campaign]);

        // Remove any individual ad groups from this campaign (since whole campaign is selected)
        setSelectedAdGroups(prev => prev.filter(ag => ag.campaignId !== campaign.id));
    };

    // Handle campaign removal
    const handleCampaignRemoval = (campaignId) => {
        setSelectedCampaigns(prev => prev.filter(campaign => campaign.id !== campaignId));
    };

    // Handle ad group selection
    const handleAdGroupSelection = (adGroup) => {
        // If ad group is already selected, do nothing
        if (selectedAdGroups.some(ag => ag.id === adGroup.id)) {
            return;
        }

        // Add ad group to selected ad groups
        setSelectedAdGroups(prev => [...prev, adGroup]);

        // Remove the whole campaign if it was selected (since we're now selecting individual ad groups)
        setSelectedCampaigns(prev => prev.filter(campaign => campaign.id !== adGroup.campaignId));
    };

    // Handle apply filter (stores filter locally, doesn't call API)
    const handleApplyFilter = () => {
        let newFilter = null;

        if (selectedFilterOption?.value === "CampaignActiveStatus") {
            // Handle campaign status selection
            if (selectedCampaignStatus) {
                newFilter = {
                    id: String(Date.now()),
                    type: "CampaignActiveStatus",
                    label: "Campaign active status",
                    value: selectedCampaignStatus,
                    displayText: `Campaign Status: ${selectedCampaignStatus}`
                };

            }
        } else if (selectedFilterOption?.value === "CampaignsAndAdGroups") {
            // Handle campaigns and ad groups selection
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
            // Handle regular filter selection
            if (selectedFilterOption && selectedCondition && filterValue) {
                const fieldMap = {
                    Impressions: "Impressions",
                    Clicks: "Clicks",
                    Orders: "Orders",
                    Sales: "Sales",
                    ROAS: "ROAS",
                    ACOS: "ACOS",
                    Spend: "Spend",
                };
                const apiFieldName = fieldMap[selectedFilterOption.value] || selectedFilterOption.value;

                // Get the proper label for the condition
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
                // Check if there's already a filter of the same type
                const existingFilterIndex = prev.findIndex(filter => filter.type === newFilter.type);

                let updatedFilters;
                if (existingFilterIndex !== -1) {
                    // Update existing filter
                    updatedFilters = [...prev];
                    updatedFilters[existingFilterIndex] = newFilter;
                } else {
                    // Add new filter
                    updatedFilters = [...prev, newFilter];
                }

                // Remove any duplicate filters
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
            // Close modal first to prevent state conflicts
            handleModalClose();
        }
    };

    // Check if campaign is selected
    const isCampaignSelected = (campaignId) => {
        return selectedCampaigns.some(campaign => campaign.id === campaignId);
    };

    // Check if ad group is selected
    const isAdGroupSelected = (adGroupId) => {
        // First check if ad group is directly selected
        const isDirectlySelected = selectedAdGroups.some(adGroup => adGroup.id === adGroupId);

        // Also check if the campaign containing this ad group is selected
        const adGroup = campaignsData.flatMap(campaign => campaign.adGroups).find(ag => ag.id === adGroupId);
        const isCampaignSelected = adGroup ? selectedCampaigns.some(campaign => campaign.id === adGroup.campaignId) : false;

        return isDirectlySelected || isCampaignSelected;
    };

    return (
        <Dialog open={showFilterModal} onOpenChange={(open) => { if (!open) handleModalClose(); }}>
            <DialogContent
                className={`${selectedFilterOption?.value === "CampaignsAndAdGroups" ? 'sm:max-w-[1140px]' : 'sm:max-w-[600px]'} p-0 overflow-hidden bg-white dark:bg-[#0f172a] border-0 shadow-xl rounded-xl z-[1000]`}
            >
                <DialogHeader className="px-6 py-5 border-b border-gray-100 dark:border-white/10 m-0">
                    <DialogTitle asChild>
                        <div className="w-full flex justify-between items-center pr-8">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#EFF6FF] text-[#2374F2] border border-[#2374F2]/20 dark:bg-[rgba(60,187,242,0.15)] dark:border-[#2374F2]/30 dark:text-[#2374F2]">
                                    <i className="fa fa-filter text-base"></i>
                                </div>
                                <div>
                                    <span className="font-bold text-base text-slate-900 dark:text-white/90">
                                        {selectedFilterOption ? t(selectedFilterOption.labelKey) : t("Filter")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6">
                    {selectedFilterOption?.value === "CampaignsAndAdGroups" ? (
                        <div className="flex flex-col md:flex-row">
                            {/* Left column */}
                            <div className="w-full md:w-1/2 md:pr-4 md:border-r border-gray-200 dark:border-white/10 mb-4 md:mb-0">
                                {currentView === "adgroups" && (
                                    <div className="mb-4">
                                        <div
                                            role="button"
                                            className="py-2 px-3 rounded border flex items-center gap-2 bg-slate-50 border-gray-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/75 cursor-pointer text-[13px]"
                                            onClick={handleBackToCampaigns}
                                        >
                                            <i className="fa fa-chevron-left"></i>
                                            <strong className="text-inherit dark:text-white">{currentCampaignForAdGroups?.name}</strong>
                                        </div>
                                    </div>
                                )}

                                {currentView === "campaigns" && (
                                    <div className="mb-4 relative">
                                        <Input
                                            type="text"
                                            className="w-full h-[38px] rounded-lg text-[13px] pl-9 bg-white border-slate-300 text-black dark:bg-white/5 dark:border-white/10 dark:text-white shadow-none"
                                            placeholder={t("Search by campaign name")}
                                            value={campaignSearchTerm}
                                            onChange={(e) => setCampaignSearchTerm(e.target.value)}
                                        />
                                        <i className="fa fa-search absolute text-gray-500 dark:text-gray-400 left-3 top-3 text-[13px]"></i>
                                    </div>
                                )}

                                <div className="flex flex-col gap-1 overflow-y-auto max-h-[320px] pr-1 custom-scroll">
                                    {campaignsLoading ? (
                                        <div className="flex flex-col justify-center items-center py-10">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                            <span className="ml-2 mt-2 text-gray-500 text-sm">{t("Loading campaigns...")}</span>
                                        </div>
                                    ) : currentView === "campaigns" ? (
                                        campaignsData.length > 0 ? (
                                            campaignsData.map(campaign => (
                                                <div key={campaign.id} className="py-2 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-lg transition-colors border-b border-slate-100 dark:border-white/10">
                                                    <div className="truncate max-w-[65%]">
                                                        <div className="font-medium truncate text-[13px] text-slate-900 dark:text-white/90" title={campaign.name}>{campaign.name}</div>
                                                        <small className="text-gray-500 text-[11px]">{t("Sponsored Products")}</small>
                                                    </div>
                                                    <div className="ml-2 flex items-center gap-3 text-[12.5px]">
                                                        {isCampaignSelected(campaign.id) ? (
                                                            <span className="text-gray-500 italic">{t("Added")}</span>
                                                        ) : (
                                                            <span className="text-primary font-semibold no-underline cursor-pointer" onClick={(e) => { e.preventDefault(); handleCampaignSelection(campaign); }}>
                                                                {t("Add")}
                                                            </span>
                                                        )}
                                                        {campaign.adGroups && campaign.adGroups.length > 0 && (
                                                            <span className="text-secondary font-semibold no-underline text-slate-600 dark:text-slate-400 cursor-pointer" onClick={(e) => { e.preventDefault(); handleShowAdGroups(campaign); }}>
                                                                {t("Ad groups")} ›
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex justify-center items-center py-10">
                                                <span className="text-gray-500 text-sm">{t("No campaigns found")}</span>
                                            </div>
                                        )
                                    ) : (
                                        adGroupsData.map(adGroup => (
                                            <div key={adGroup.id} className="py-2 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-lg transition-colors border-b border-slate-100 dark:border-white/10">
                                                <div className="truncate max-w-[75%]">
                                                    <div className="font-medium truncate text-[13px] text-slate-900 dark:text-white/90" title={adGroup.name}>{adGroup.name}</div>
                                                </div>
                                                <div className="ml-2 text-[12.5px]">
                                                    {isAdGroupSelected(adGroup.id) ? (
                                                        <span className="text-gray-500 italic">{t("Added")}</span>
                                                    ) : (
                                                        <span className="text-primary font-semibold no-underline cursor-pointer" onClick={(e) => { e.preventDefault(); handleAdGroupSelection(adGroup); }}>
                                                            {t("Add")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right column */}
                            <div className="w-full md:w-1/2 md:pl-4 mt-4 md:mt-0">
                                <p className="font-bold mb-2 text-[14px] text-slate-900 dark:text-white/90">
                                    {selectedCampaigns?.length || "0"} {t("Selected Campaigns")} & {selectedAdGroups?.length || "0"} {t("Ad Groups")}
                                </p>
                                <div className="py-2 overflow-y-auto max-h-[320px] min-h-[320px] pr-1 custom-scroll">
                                    {selectedCampaigns.length === 0 && selectedAdGroups.length === 0 ? (
                                        <div className="flex h-full min-h-[250px] justify-center items-center text-center px-6 border border-dashed rounded-lg py-10 bg-slate-50 border-slate-300 dark:bg-white/5 dark:border-white/10">
                                            <span className="text-gray-500 text-sm">{t("No campaigns or ad groups selected yet")}</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            {selectedCampaigns.map(campaign => (
                                                <div key={`campaign-${campaign.id}`} className="py-2 px-3 flex justify-between items-center hover:bg-slate-100 rounded-lg mb-1 bg-slate-50 border-b border-slate-100 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10">
                                                    <div className="truncate max-w-[85%]">
                                                        <div className="font-semibold truncate text-[13px] text-slate-900 dark:text-white/90" title={campaign.name}>{campaign.name}</div>
                                                        <small className="text-gray-500 text-[11px]">{t("Campaign")}</small>
                                                    </div>
                                                    <ShadcnButton variant="ghost" className="h-auto p-1 text-gray-500 hover:text-red-500 hover:bg-transparent" onClick={() => handleCampaignRemoval(campaign.id)}>
                                                        <i className="fa fa-times text-[13px]"></i>
                                                    </ShadcnButton>
                                                </div>
                                            ))}
                                            {selectedAdGroups.map(adGroup => (
                                                <div key={`adgroup-${adGroup.id}`} className="py-2 px-3 flex justify-between items-center hover:bg-slate-100 rounded-lg mb-1 bg-slate-50 border-b border-slate-100 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10">
                                                    <div className="truncate max-w-[85%]">
                                                        <div className="font-semibold truncate text-[13px] text-slate-900 dark:text-white/90" title={`${adGroup.campaignName} › ${adGroup.name}`}>{adGroup.campaignName} › {adGroup.name}</div>
                                                        <small className="text-gray-500 text-[11px]">{t("Ad Group")}</small>
                                                    </div>
                                                    <ShadcnButton variant="ghost" className="h-auto p-1 text-gray-500 hover:text-red-500 hover:bg-transparent" onClick={() => handleAdGroupRemoval(adGroup.id)}>
                                                        <i className="fa fa-times text-[13px]"></i>
                                                    </ShadcnButton>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : selectedFilterOption?.value === "CampaignActiveStatus" ? (
                        <div className="flex flex-col gap-2">
                            {CAMPAIGN_STATUS_OPTIONS.map(option => {
                                const isChecked = selectedCampaignStatus === option.value;
                                return (
                                    <div
                                        key={option.value}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isChecked ? "bg-[#EFF6FF] border-[#2374F2] dark:bg-[rgba(60,187,242,0.15)]" : "bg-white border-slate-200 dark:bg-white/5 dark:border-white/10"}`}
                                        onClick={() => setSelectedCampaignStatus(option.value)}
                                    >
                                        <StyledCheckbox
                                            id={option.value}
                                            checked={isChecked}
                                            onChange={() => setSelectedCampaignStatus(option.value)}
                                        />
                                        <Label
                                            className="font-medium cursor-pointer text-[14px] text-slate-900 dark:text-white/90"
                                            htmlFor={option.value}
                                        >
                                            {t(option.label)}
                                        </Label>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="w-full md:w-5/12">
                                <Select
                                    value={selectedCondition || undefined}
                                    onValueChange={(val) => setSelectedCondition(val || "")}
                                >
                                    <SelectTrigger className="w-full h-[42px] border-slate-300 dark:border-white/10 shadow-sm outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-slate-300">
                                        <SelectValue placeholder={t("Select")} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[10000]">
                                        {CONDITION_OPTIONS.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {t(option.labelKey)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="w-full md:w-7/12">
                                <div className="flex h-[42px] shadow-sm rounded-lg overflow-hidden border border-slate-300 dark:border-white/10">
                                    {(selectedFilterOption?.value === "Spend" || selectedFilterOption?.value === "Sales" || selectedFilterOption?.value === "Bid") && (
                                        <span className="flex items-center justify-center px-3 bg-slate-50 border-r border-slate-300 text-slate-500 text-[13px] font-medium dark:bg-white/10 dark:border-white/10 dark:text-white/60">{getCurrencySymbol()}</span>
                                    )}
                                    <Input
                                        type="number"
                                        className="flex-1 h-full border-0 rounded-none bg-white text-black dark:bg-white/5 dark:text-white text-[13px] px-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                        value={filterValue}
                                        onChange={(e) => {
                                            let val = e.target.value;
                                            val = val.replace(/^0+(?=\d)/, '');
                                            setFilterValue(val);
                                        }}
                                        placeholder={t("Enter value")}
                                    />
                                    {selectedFilterOption?.value === "ACOS" && (
                                        <span className="flex items-center justify-center px-3 bg-slate-50 border-l border-slate-300 text-slate-500 text-[13px] font-medium dark:bg-white/10 dark:border-white/10 dark:text-white/60">%</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="px-6 py-4 border-t border-slate-100 dark:border-white/10 m-0 w-full flex items-center justify-between sm:justify-between bg-white dark:bg-[#0f172a]">
                    <div className="flex-1 flex items-center justify-start">
                        <ShadcnButton
                            variant="ghost"
                            onClick={() => {
                                setFilterValue("");
                                if (selectedFilterOption?.value === "CampaignActiveStatus") {
                                    setSelectedCampaignStatus("ENABLED");
                                } else {
                                    setSelectedCondition(CONDITION_OPTIONS?.[0]?.value || "$eq");
                                    setSelectedCampaigns([]);
                                    setSelectedAdGroups([]);
                                }
                            }}
                            className="h-[36px] px-3 rounded-lg text-[13px] font-bold text-[#203a5c] hover:text-[#2374F2] dark:text-slate-300 dark:hover:text-white"
                        >
                            {t("Clear Inputs")}
                        </ShadcnButton>
                    </div>
                    <div className="flex items-center gap-2">
                        <ShadcnButton
                            variant="outline"
                            onClick={handleModalClose}
                            className="h-[36px] px-4 rounded-lg text-[13px] font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                        >
                            {t("Cancel")}
                        </ShadcnButton>
                        <ShadcnButton
                            onClick={handleApplyFilter}
                            className="bg-[#2374F2] hover:bg-[#2374F2]/90 border-0 rounded-lg px-6 h-[36px] font-semibold text-[13px] text-white shadow-none"
                        >
                            {t("Apply")}
                        </ShadcnButton>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default SearchTermFilterModal