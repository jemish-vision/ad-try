import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { ApiDeleteFilter } from '../../../../api-wrapper/customer/ApiCustomer';
import { Toast } from '../../../../helper/links/Link';
import { useTranslation } from 'react-i18next';
import { FiTrash2 } from 'react-icons/fi';

const SearchTermDeleteModal = (props) => {
  const { t } = useTranslation();
    const {
        showDeleteFilterModal,
        setShowDeleteFilterModal,
        filterToDelete,
        setFilterToDelete,
        getFilter
    } = props;

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Handle delete filter confirmation
    const handleDeleteFilterConfirm = async () => {
        if (filterToDelete) {
            try {
                const data = { filterId: filterToDelete._id };

                const response = await ApiDeleteFilter(data);

                if (response.isSuccess) {
                    Toast.success(response.message || "Filter deleted successfully");
                    // Close modal and reset state
                    setShowDeleteFilterModal(false);
                    setFilterToDelete(null);
                    getFilter();
                } else {
                    Toast.error(response.message || "Failed to delete filter");
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
                className="max-w-[440px] w-[95vw] p-6 rounded-[20px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all"
                onInteractOutside={(e) => e.preventDefault()} 
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                {/* Circuit top glow line indicator */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #ef4444 30%, #f43f5e 70%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                <DialogHeader className="p-0 shrink-0 mb-3 text-left">
                    <DialogTitle className="w-full flex items-center gap-3">
                        <span className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 p-2 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FiTrash2 size={16} />
                        </span>
                        <div className="flex flex-col text-left">
                            <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight font-sans">
                                {t("Delete Saved Filter")}
                            </div>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-3 text-left font-sans">
                    <div className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                        {t("Are you sure want to delete this record?")}
                    </div>
                    {filterToDelete?.name && (
                        <div className="px-3 py-2 rounded-lg border border-red-500/10 bg-red-500/5 text-red-600 dark:text-red-400 text-xs font-semibold font-mono truncate">
                            {filterToDelete.name}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-white/10 shrink-0">
                    <button
                        type="button"
                        className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white active:scale-[0.98]"
                        onClick={handleClose}
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteFilterConfirm}
                        className="h-[36px] px-4 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-wider transition-all duration-200 bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-[0_4px_12px_rgba(239,68,68,0.25)] hover:opacity-90 active:scale-[0.98]"
                    >
                        {t("Delete")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default SearchTermDeleteModal;