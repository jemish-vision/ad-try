import { useTranslation } from "react-i18next";
import { Button as ShadcnButton } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { handleLoader, Toast } from '../../../../helper/links/Link';
import { addPlacementQuery } from '../../../../utility/createQuery';
import { ApiSaveFilter } from '../../../../api-wrapper/customer/ApiCustomer';
import { useDispatch } from 'react-redux';
import { t } from 'i18next';
import { FiSave, FiInfo } from 'react-icons/fi';

const PlacementSaveFilter = (props) => {
  const { t } = useTranslation();
    const {
        showSaveFilterModal,
        setShowSaveFilterModal,
        filterName,
        setFilterName,
        appliedFilters,
        getFilter,
    } = props;

    const dispatch = useDispatch();

    // Handle save filter with name
    const handleSaveFilterWithName = async () => {
        if (!filterName.trim()) {
            Toast.error(t("Please enter a filter name"));
            return;
        }

        const campaignsAndAdGroupsFilter = appliedFilters.find(filter => filter.type === "CampaignsAndAdGroups");
        const campaignIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => item.adGroups).map(campaign => campaign.id) : [];
        const adGroupIds = campaignsAndAdGroupsFilter ? campaignsAndAdGroupsFilter.value.filter(item => !item.adGroups).map(adGroup => adGroup.id) : [];

        const data = {
            appliedFilters,
            campaignId: campaignIds,
            adGroupId: adGroupIds,
        };

        const sendData = {
            pageName: "Placement",
            query: addPlacementQuery(data),
            filterName: filterName.trim()
        };

        try {
            await ApiSaveFilter(sendData)
                .then((res) => {
                    if (res.isSuccess) {
                        Toast.success(res?.message);
                        setShowSaveFilterModal(false);
                        setFilterName("");
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
        setShowSaveFilterModal(false)
    }

    return (
        <Dialog open={showSaveFilterModal} onOpenChange={(open) => !open && handleClose()}>
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
                        <span className="p-2 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400">
                            <FiSave size={16} />
                        </span>
                        <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                            {t("saveFilter")}
                        </DialogTitle>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="placementFilterNameInput" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {t("Filter Name")}
                        </label>
                        <input
                            id="placementFilterNameInput"
                            type="text"
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveFilterWithName()}
                            placeholder={t("e.g. Top Placements")}
                            autoFocus
                            className="w-full h-[40px] px-3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white"
                        />
                        <div className="flex items-start gap-2 text-slate-400 dark:text-slate-500 text-[11px] mt-1">
                            <FiInfo size={14} className="mt-0.5 flex-shrink-0" />
                            <span className="leading-normal">This filter set will be saved and can be reused anytime.</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
                    <ShadcnButton
                        variant="outline"
                        className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                        onClick={handleClose}
                    >
                        {t("Cancel")}
                    </ShadcnButton>
                    <ShadcnButton
                        className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 transition-opacity flex items-center gap-1.5"
                        onClick={handleSaveFilterWithName}
                    >
                        <FiSave size={13} />
                        {t("saveFilter")}
                    </ShadcnButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PlacementSaveFilter;