import { useContext, useEffect, useState } from "react";
import { t } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { ApiRuleBlockCampaign } from "../../api-wrapper/placement/ApiPlacement";
import { ProfileContext } from "../usecontext/useContext";
import { CampaignNameCell } from "../../utility/campaignNavigation";

function BlockedCampaignModal({ show, onHide, ruleId, ruleDate }) {
    const { profileId, selectedAdType } = useContext(ProfileContext);

    const [loading, setLoading] = useState(false);
    const [campaigns, setCampaigns] = useState([]);

    // 🔥 Determine reason (translated)
    const getReason = (c) => {
        if (c.totalProduct === 0) return t("noProducts");
        if (c.inStockProduct === 0) return t("allProductsOutOfStock");
        if (c.inStockProduct < c.totalProduct) return t("lowStock");
        return t("eligible");
    };

    const fetchCampaigns = async () => {
        if (!ruleId || !ruleDate) return;

        try {
            setLoading(true);
            const res = await ApiRuleBlockCampaign({
                profileId: profileId?.value,
                ruleId,
                ruleDate
            });

            if (res?.isSuccess) setCampaigns(res?.data || []);
        } catch (error) {
            console.error("Failed to fetch blocked campaigns:", error);
        } finally {
            setLoading(false);
        }
    };

    // 🔥 Fetch when modal opens
    useEffect(() => {
        if (show && profileId?.value && selectedAdType) fetchCampaigns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, profileId?.value, selectedAdType, ruleId, ruleDate]);

    const blockedCampaigns = campaigns.filter((c) => c.inStockProduct < c.totalProduct);
    const hasData = blockedCampaigns.length > 0;

    return (
        <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col blocked-campaign-modal">
                <DialogHeader>
                    <DialogTitle>{t("blockedCampaigns")}</DialogTitle>
                </DialogHeader>

                <div className="overflow-y-auto py-4 flex-1">
                    {/* ================= LOADING ================= */}
                    {loading && (
                        <div className="flex justify-center items-center py-12">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-500" role="status">
                                <span className="sr-only">Loading...</span>
                            </div>
                        </div>
                    )}

                    {/* ================= TABLE ================= */}
                    {!loading && hasData && (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="w-full border-collapse text-left text-sm">
                                <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("campaignName")}</th>
                                        <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("totalProducts")}</th>
                                        <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("inStock")}</th>
                                        <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("availabilityPercent")}</th>
                                        <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">{t("reason")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                                    {blockedCampaigns.map((c) => (
                                        <tr key={c.campaignId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                                                <CampaignNameCell row={c} name={c.campaignName} campaignId={c.campaignId} />
                                            </td>
                                            <td className="p-3 text-slate-600 dark:text-slate-400">{c.totalProduct}</td>
                                            <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                                                {c.inStockProduct}
                                            </td>
                                            <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                                                {c.availabilityRatio}%
                                            </td>
                                            <td className="p-3 font-bold text-red-600 dark:text-red-400">
                                                {getReason(c)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ================= EMPTY ================= */}
                    {!loading && !hasData && (
                        <div className="text-center py-8">
                            <h5 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-200">
                                {t("noBlockedCampaignsTitle")}
                            </h5>
                            <p className="text-slate-500 dark:text-slate-400 mb-0 text-sm">
                                {t("noBlockedCampaignsDesc")}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-2">
                    <Button onClick={onHide}>
                        {t("close")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default BlockedCampaignModal;
