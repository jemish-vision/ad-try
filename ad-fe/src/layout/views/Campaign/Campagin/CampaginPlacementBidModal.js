
import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as ShadcnButton } from '../../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { ApiUpdatePlacementBid } from '../../../../api-wrapper/placement/ApiPlacement';
import { ProfileContext } from '../../../../helper/usecontext/useContext';
import { Toast } from '../../../../helper/links/Link';
import { FiTrendingUp, FiAlertCircle } from 'react-icons/fi';

const CampaginPlacementBidModal = (props) => {
    const { t } = useTranslation();
    const { profileId } = useContext(ProfileContext);

    const { showBidModal, setShowBidModal, selectedRows = [], handleSubmit } = props

    const [topOfSearchBid, setTopOfSearchBid] = useState(null);
    const [restOfSearchBid, setRestOfSearchBid] = useState(null);
    const [productPageBid, setProductPageBid] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!topOfSearchBid && !restOfSearchBid && !productPageBid) {
            setError("All bid fields are required");
            return;
        }

        const payload = {
            profileId: profileId?.value,
            campaignIds: selectedRows,
            ...(Boolean(topOfSearchBid) && { topOfSearchBid }),
            ...(Boolean(restOfSearchBid) && { restOfSearchBid }),
            ...(Boolean(productPageBid) && { productPageBid }),
        };

        setLoading(true);
        try {
            const e = await ApiUpdatePlacementBid(payload);
            if (e?.isSuccess) {
                Toast.success(e?.message);
                setTopOfSearchBid(null);
                setRestOfSearchBid(null);
                setProductPageBid(null);
                setError("");

                handleSubmit()
                setShowBidModal(false);
            } else {
                Toast.error(e?.message);
            }
        } catch (e) {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setShowBidModal(false);
    }

    return (
        <Dialog open={showBidModal} onOpenChange={(open) => !open && handleClose()}>
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
                <div className="flex justify-start items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/10 shrink-0">
                    <span className="p-2 rounded-xl flex items-center justify-center bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400">
                        <FiTrendingUp size={16} />
                    </span>
                    <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                        {t("placement")} {t("bid")}
                    </DialogTitle>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        {t("Selected")}: {selectedRows.length}
                    </span>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                        {[
                            { label: t("Top of Search (First Page)"), value: topOfSearchBid, setter: setTopOfSearchBid },
                            { label: t("Rest of Search"), value: restOfSearchBid, setter: setRestOfSearchBid },
                            { label: t("Product Pages"), value: productPageBid, setter: setProductPageBid }
                        ].map((field, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-4">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    {field.label}
                                </label>
                                <div className="relative w-[150px]">
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-500">%</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={field.value || ""}
                                        onChange={(e) => field.setter(parseFloat(e.target.value) || null)}
                                        placeholder={t("enterBid")}
                                        className="w-full h-9 pl-7 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white font-medium"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-lg mt-2">
                            <FiAlertCircle size={14} className="flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 shrink-0">
                    <ShadcnButton
                        variant="outline"
                        disabled={loading}
                        className="h-[36px] px-4 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                        onClick={handleClose}
                    >
                        {t("canceled")}
                    </ShadcnButton>
                    <ShadcnButton
                        disabled={loading}
                        className="h-[36px] px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 transition-opacity flex items-center gap-1.5"
                        onClick={handleSave}
                    >
                        {loading && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                        {loading ? t("Saving...") : t("save")}
                    </ShadcnButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default CampaginPlacementBidModal;