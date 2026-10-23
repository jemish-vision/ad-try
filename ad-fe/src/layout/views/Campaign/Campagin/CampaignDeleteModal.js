import React from 'react';
import { Button as ShadcnButton } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { ApiDeleteFilter } from '../../../../api-wrapper/customer/ApiCustomer';
import { Toast } from '../../../../helper/links/Link';
import { t } from 'i18next';
import { FiTrash2 } from 'react-icons/fi';

const CampaignDeleteModal = (props) => {
    const {
        showDeleteFilterModal,
        setShowDeleteFilterModal,
        filterToDelete,
        setFilterToDelete,
        getFilter
    } = props;

    // Handle delete filter confirmation
    const handleDeleteFilterConfirm = async () => {
        if (filterToDelete) {
            try {
                const data = { filterId: filterToDelete._id };
                const response = await ApiDeleteFilter(data);

                if (response.isSuccess) {
                    Toast.success(response.message || t("Filter deleted successfully"));
                    // Close modal and reset state
                    setShowDeleteFilterModal(false);
                    setFilterToDelete(null);
                    getFilter();
                } else {
                    Toast.error(response.message || t("Failed to delete filter"));
                }
            } catch (error) {
                console.error("Error deleting filter:", error);
                Toast.error(t("Something went wrong while deleting the filter"));
            }
        }
    };

    const handleClose = () => {
        setFilterToDelete(null);
        setShowDeleteFilterModal(false)
    }

    return (
        <Dialog open={showDeleteFilterModal} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent
                className="max-w-[440px] w-[95vw] p-0 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/95 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col font-sans"
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
                        <span className="p-2 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-500">
                            <FiTrash2 size={16} />
                        </span>
                        <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                            {t("Delete Saved Filter")}
                        </DialogTitle>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-normal">
                        {t("Are you sure want to delete this record?")}
                    </p>
                    {filterToDelete?.name && (
                        <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl p-3 text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                            {filterToDelete.name}
                        </div>
                    )}
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
                        className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 shadow-[0_4px_12px_rgba(239,68,68,0.25)] transition-opacity"
                        onClick={handleDeleteFilterConfirm}
                    >
                        {t("Delete")}
                    </ShadcnButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CampaignDeleteModal;