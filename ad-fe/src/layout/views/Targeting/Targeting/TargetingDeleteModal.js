import React from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../../../../components/ui/dialog"
import { Button } from "../../../../components/ui/button"
import { ApiDeleteFilter } from '../../../../api-wrapper/customer/ApiCustomer';
import { Toast } from '../../../../helper/links/Link';
import { useTranslation } from 'react-i18next';

const TargetingDeleteModal = (props) => {
  const { t } = useTranslation();
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
            <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-0 rounded-2xl shadow-xl bg-white dark:bg-[#1e293b]">
                <DialogHeader className="border-b border-slate-100 dark:border-slate-800 p-5 px-6">
                    <DialogTitle className="text-[16px] font-bold text-slate-800 dark:text-slate-100">
                        {t("Delete Saved Filter")}
                    </DialogTitle>
                </DialogHeader>
                <div className="p-6 bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-300">
                    <p>{t("Are you sure want to delete this record?")} ("{filterToDelete?.name}")</p>
                </div>
                <DialogFooter className="bg-white dark:bg-[#1e293b] border-t border-slate-100 dark:border-slate-800 p-4 px-6 sm:justify-end sm:space-x-2">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        className="text-slate-500 hover:text-slate-700 hover:bg-transparent"
                    >
                        {t("Cancel")}
                    </Button>
                    <Button variant="destructive" onClick={handleDeleteFilterConfirm} className="bg-red-600 hover:bg-red-700 text-white">
                        {t("submit")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default TargetingDeleteModal