import { t } from 'i18next'
import React, { useContext, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../../../../components/ui/dialog"
import { Button } from "../../../../components/ui/button"
import { Input } from "../../../../components/ui/input"
import { Label } from "../../../../components/ui/label"
import { ApiSaveCampaignNotifySetting } from '../../../../api-wrapper/campaign/ApiCampaign'
import { ProfileContext } from '../../../../helper/usecontext/useContext'
import { handleLoader, Toast } from '../../../../helper/links/Link'
import { useDispatch } from 'react-redux'
import { useTranslation } from "react-i18next";

const CampaignNotificationSettingModal = (props) => {
    const { t } = useTranslation();
    const { profileId } = useContext(ProfileContext);
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(false);

    const {
        showCampaignSetting,
        setShowCampaignSetting,
        lowACOS,
        setLowACOS,
        highACOS,
        setHighACOS,
    } = props

    const handleSaveSetting = async () => {
        setLoading(true);
        try {
            const e = await ApiSaveCampaignNotifySetting({ profileId: profileId?.value, lowACOS, highACOS });
            if (e?.isSuccess) {
                Toast.success(e?.message);
                setShowCampaignSetting(false);
                dispatch(handleLoader(false));
            } else {
                Toast.error(e?.message);
            }
        } catch (e) {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style>{`
                .campaign-notification-modal .modal-content {
                    background: rgba(255, 255, 255, 0.85) !important;
                    backdrop-filter: blur(16px) saturate(180%) !important;
                    -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
                    border: 1px solid rgba(255, 255, 255, 0.4) !important;
                    border-radius: 20px !important;
                    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12) !important;
                    overflow: hidden !important;
                }
                .campaign-notification-modal .modal-header {
                    background: rgba(255, 255, 255, 0.5) !important;
                    border-bottom: 1px solid rgba(2, 70, 139, 0.08) !important;
                    backdrop-filter: blur(8px) !important;
                    -webkit-backdrop-filter: blur(8px) !important;
                    padding: 18px 24px !important;
                }
                .campaign-notification-modal .modal-body {
                    background: rgba(248, 250, 252, 0.5) !important;
                    padding: 24px 24px !important;
                }
                .campaign-notification-modal .modal-footer {
                    background: rgba(248, 250, 252, 0.6) !important;
                    border-top: 1px solid rgba(2, 70, 139, 0.08) !important;
                    padding: 14px 24px !important;
                }
                .campaign-notification-modal .form-control {
                    border-radius: 8px !important;
                    border: 1px solid rgba(2, 70, 139, 0.15) !important;
                    background: rgba(255, 255, 255, 0.7) !important;
                    transition: all 0.2s ease !important;
                    font-weight: 500 !important;
                    height: 38px !important;
                }
                .campaign-notification-modal .form-control:focus {
                    border-color: #1A9FD4 !important;
                    box-shadow: 0 0 0 3px rgba(2, 70, 139, 0.15) !important;
                    background: #ffffff !important;
                }
            `}</style>
            <Dialog open={showCampaignSetting} onOpenChange={setShowCampaignSetting}>
                <DialogContent className="w-[92vw] sm:max-w-md p-0 gap-0 overflow-hidden border-0 rounded-2xl shadow-xl bg-white dark:bg-[#1e293b]">
                    <DialogHeader className="border-b border-slate-100 dark:border-slate-800 p-5 px-6">
                        <DialogTitle>
                            <div className="flex items-center gap-3 text-left">
                                <span className="flex items-center justify-center shrink-0 w-9 h-9 rounded-lg bg-[#eef5ff] text-[#2374f2] dark:bg-[#1f2c3e] dark:border dark:border-[#265680] dark:text-blue-400">
                                    <i className="fa-solid fa-bell" style={{ fontSize: 16 }}></i>
                                </span>
                                <div className="text-[16px] font-bold text-slate-800 dark:text-slate-100">
                                    {t("Campaign Notification Setting")}
                                </div>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 bg-white dark:bg-[#1e293b]">
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center justify-between">
                                <Label className="font-semibold text-slate-700 dark:text-slate-200" style={{ fontSize: "13.5px" }}>{t("Notify on ACOS lower than")}</Label>
                                <div className="relative w-32">
                                    <Input
                                        type="number"
                                        value={lowACOS}
                                        onChange={(e) => setLowACOS(Number(e.target.value))}
                                        className="pr-8"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">%</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="font-semibold text-slate-700 dark:text-slate-200" style={{ fontSize: "13.5px" }}>{t("Notify on ACOS higher than")}</Label>
                                <div className="relative w-32">
                                    <Input
                                        type="number"
                                        value={highACOS}
                                        onChange={(e) => setHighACOS(Number(e.target.value))}
                                        className="pr-8"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-white dark:bg-[#1e293b] border-t border-slate-100 dark:border-slate-800 p-4 px-6 gap-2 sm:gap-0 sm:justify-end sm:space-x-3">
                        <Button
                            variant="ghost"
                            disabled={loading}
                            className="text-slate-500 hover:text-slate-700 font-medium hover:bg-transparent"
                            style={{ fontSize: "13px" }}
                            onClick={() => setShowCampaignSetting(false)}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            onClick={handleSaveSetting}
                            disabled={loading}
                            className="btn-campaign-primary flex items-center gap-1.5"
                        >
                            {loading && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                            {loading ? t("Saving...") : t("Save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default CampaignNotificationSettingModal