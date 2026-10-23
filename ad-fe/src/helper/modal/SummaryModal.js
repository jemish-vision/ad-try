import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

function SummaryModal({ show, onClose, summary }) {
    const { t } = useTranslation();
    const sections = [
        {
            key: "negativeKeywords",
            title: t("Negative Keywords"),
        },
        {
            key: "negativeProducts",
            title: t("Negative Products"),
        },
        {
            key: "targetingKeywords",
            title: t("Targeting Keywords"),
        },
        {
            key: "targetingProducts",
            title: t("Targeting Products"),
        },
        {
            key: "campaignTargetingKeywords",
            title: t("Create Campaign: Targeting Keywords"),
        },
        {
            key: "campaignTargetingProducts",
            title: t("Create Campaign: Targeting Products"),
        },
    ];

    const hasAnyData = sections.some(
        (s) =>
            summary?.[s.key] &&
            (summary[s.key].added ||
                summary[s.key].duplicate ||
                summary[s.key].failed)
    );

    return (
        <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t("Operation Summary")}</DialogTitle>
                </DialogHeader>

                <div className="overflow-y-auto py-4 flex-1">
                    {/* ================= SECTIONS ================= */}
                    {sections.map(({ key, title }) => {
                        const data = summary?.[key];

                        const hasData =
                            data && (data.added || data.duplicate || data.failed);

                        if (!hasData) return null;

                        return (
                            <div key={key} className="mb-5">
                                <h5 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h5>

                                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                    <table className="w-full border-collapse text-left text-sm">
                                        <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                            <tr>
                                                <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("Added")}</th>
                                                <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("Duplicate")}</th>
                                                <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("Failed")}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                                            <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                                                    {data.added || 0}
                                                </td>
                                                <td className="p-3 font-bold text-blue-600 dark:text-blue-400">
                                                    {data.duplicate || 0}
                                                </td>
                                                <td className="p-3 font-bold text-red-600 dark:text-red-400">
                                                    {data.failed || 0}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}

                    {/* ================= EMPTY STATE ================= */}
                    {!hasAnyData && (
                        <div className="text-center py-8">
                            <h5 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-200">{t("Nothing Processed")}</h5>
                            <p className="text-slate-500 dark:text-slate-400 mb-0 text-sm">
                                {t("No keywords or products were added.")}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-2">
                    <Button onClick={onClose}>
                        {t("Close")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default SummaryModal;
