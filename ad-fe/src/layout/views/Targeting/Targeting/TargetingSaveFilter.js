import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { handleLoader, Toast } from '../../../../helper/links/Link';
import { addTargetingQuery } from '../../../../utility/createQuery';
import { ApiSaveFilter } from '../../../../api-wrapper/customer/ApiCustomer';
import { useDispatch } from 'react-redux';
import { t } from 'i18next';
import { FiSave, FiInfo } from 'react-icons/fi';
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";

const TargetingSaveFilter = (props) => {
    const {
        showSaveFilterModal,
        setShowSaveFilterModal,
        filterName,
        setFilterName,
        appliedFilters,
        getFilter,
        targetingTabFilter,
        pageName = "Targeting"
    } = props;

    const dispatch = useDispatch();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Handle save filter with name
    const handleSaveFilterWithName = async () => {
        if (!filterName.trim()) {
            Toast.error(t("Please enter a filter name"));
            return;
        }

        // Get campaign status from applied filters
        const campaignStatusFilter = appliedFilters.find(filter => filter.type === "CampaignActiveStatus");
        const campaignStatus = campaignStatusFilter ? campaignStatusFilter.value : "";

        // Get targeting status from applied filters
        const targetingStatusFilter = appliedFilters.find(filter => filter.type === "TargetActiveStatus");
        const targetingStatus = targetingStatusFilter ? targetingStatusFilter.value : "";

        // Get targeting type from applied filters
        const targetingTypeFilter = appliedFilters.find(filter => filter.type === "TargetingType");
        const targetingType = targetingTypeFilter ? targetingTypeFilter.value : [];

        // Get selected campaign and ad group IDs from applied filters
        const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
        const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
        const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

        const data = {
            appliedFilters,
            campaignStatus: campaignStatus,
            targetingStatus: targetingStatus,
            targetingType: targetingType,
            campaignId: campaignIds,
            adGroupId: adGroupIds,
            targetingTabFilter,
        };

        const sendData = {
            pageName,
            query: addTargetingQuery(data),
            filterName: filterName.trim()
        };

        try {
            await ApiSaveFilter(sendData)
                .then((res) => {
                    if (res.isSuccess) {
                        Toast.success(res?.message);
                        setShowSaveFilterModal(false);
                        setFilterName("");
                        // Refresh the filters list to show the newly saved filter
                        getFilter();
                        dispatch(handleLoader(false));
                    } else {
                        Toast.error(res.message);
                    }
                })
                .catch((err) => {
                    Toast.error(t("Something went wrong"));
                });
        } catch (error) {
            Toast.error(t("Failed to save filter"));
        }
    };

    const handleClose = () => {
        setFilterName("");
        setShowSaveFilterModal(false);
    };

    return (
        <Dialog open={showSaveFilterModal} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent
                className="max-w-[460px] w-[95vw] p-6 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Circuit top glow line indicator */}
                <div
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                <DialogHeader className="p-0 shrink-0 mb-3 text-left">
                    <DialogTitle className="w-full flex items-center gap-3">
                        <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400 p-2 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FiSave size={16} />
                        </span>
                        <div className="flex flex-col text-left">
                            <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight font-sans">
                                {t("saveFilter")}
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 text-left font-sans">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="targetingFilterNameInput" className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {t("Filter Name")}
                        </label>
                        <Input
                            id="targetingFilterNameInput"
                            type="text"
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveFilterWithName()}
                            placeholder={t("e.g. Active Keyword Targets")}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400"
                            autoFocus
                        />
                    </div>

                    <div className="flex items-start gap-2 text-slate-400 dark:text-slate-500 text-xs">
                        <FiInfo size={14} className="mt-0.5 flex-shrink-0" />
                        <span className="leading-normal">
                            {t("This filter set will be saved and can be reused anytime.")}
                        </span>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
                    <button
                        type="button"
                        className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                        onClick={handleClose}
                    >
                        {t("Cancel")}
                    </button>
                    <ShadcnButton
                        onClick={handleSaveFilterWithName}
                        className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_4px_12px_rgba(26,159,212,0.25)] hover:opacity-90 active:scale-[0.98]"
                    >
                        {t("saveFilter")}
                    </ShadcnButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default TargetingSaveFilter;