import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { useTranslation } from "react-i18next";

const SyncPermissionModal = ({ show, onConfirm, onCancel }) => {
    const { t } = useTranslation();

    return (
        <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
            <DialogContent 
                className="sm:max-w-[500px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden" 
                onInteractOutside={(e) => e.preventDefault()} 
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader className="modal-header border-b-0 p-4 pb-0 shrink-0">
                    <DialogTitle className="modal-title text-base font-medium">{t("account_connected_title")}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="modal-body overflow-y-auto p-4 flex-1">
                        <p className="mb-2 font-semibold">
                            {t("account_connected_desc")}
                        </p>

                        <div className="alert alert-warning mb-0">
                            <strong>{t("permission_required")}:</strong>
                            <br />
                            {t("sync_permission_message")}{" "}
                            <strong>{t("last_30_days")}</strong>.
                        </div>

                        <p className="text-gray-500 mt-3 mb-0">
                            {t("sync_safe_message")}
                        </p>
                    </div>

                    <div className="cm-footer p-4 flex justify-end gap-2 shrink-0" style={{ borderTop: "1px solid #e2e8f0" }}>
                        <Button 
                            variant="outline" 
                            className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5"
                            onClick={onCancel}
                        >
                            {t("not_now")}
                        </Button>
                        <Button 
                            className="improve add_btn h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-4 font-semibold shadow-sm flex items-center justify-center gap-1.5"
                            onClick={onConfirm}
                        >
                            {t("allow_start_sync")}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SyncPermissionModal;
