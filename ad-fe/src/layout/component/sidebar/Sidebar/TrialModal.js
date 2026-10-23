import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { useNavigate } from "react-router-dom";

function TrialStatusModal({ show, remainingDays, onHide }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isExpired = remainingDays === 0;

    return (
        <Dialog open={show} onOpenChange={(open) => { if (!open && !isExpired) onHide(); }}>
            <DialogContent className="max-w-md p-6" hideCloseButton={isExpired}>
                <DialogHeader className="sr-only">
                    <DialogTitle>{!isExpired ? t("Trial Ending Soon") : t("Trial Expired")}</DialogTitle>
                </DialogHeader>

                <div className="text-center pb-2">
                    {!isExpired ? (
                        <>
                            <div className="text-4xl mb-2">⏰</div>
                            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("Trial Ending Soon")}</h4>

                            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                                {t("Your free trial will expire in")}
                                <b className="text-slate-900 dark:text-slate-100"> {remainingDays} {remainingDays > 1 ? t("days") : t("day")}</b>.
                            </p>

                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                                {t("Upgrade now to continue uninterrupted access to all features.")}
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="text-4xl mb-2">🔒</div>
                            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("Trial Expired")}</h4>

                            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                                {t("Your free trial has ended.")}
                            </p>

                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                                {t("All automations, dayparting and live ads scheduling are temporarily inactive. Renew your plan now to restore full access and reactivate your service.")}
                            </p>
                        </>
                    )}

                    {/* ACTION BUTTONS */}
                    <div className="flex justify-center gap-3 mt-6">
                        {!isExpired && (
                            <Button
                                variant="outline"
                                onClick={onHide}
                            >
                                {t("Maybe Later")}
                            </Button>
                        )}

                        <Button
                            onClick={() => { onHide(); navigate("/purchase-plans") }}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {t("Upgrade Now")}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default TrialStatusModal;
