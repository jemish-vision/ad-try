import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { AlertTriangle } from "lucide-react";
import Toast from "../../../common/helper/toast/Toast";
import { ApiGetGlobalSettings, ApiUpdateMaintenanceMode } from "../../../api-wrapper/globalSettings/ApiGlobalSettings";
import "./PortalSetting.css";
import Filter from "../../../helper/filter/Filter";
import { Switch } from "../../../components/ui/switch";

const PortalSetting = () => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [pendingState, setPendingState] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const res = await ApiGetGlobalSettings();
            if (res && res.isSuccess && res.data) {
                setIsMaintenanceMode(res.data.isMaintenanceMode || false);
            } else if (res && typeof res.isMaintenanceMode === "boolean") {
                setIsMaintenanceMode(res.isMaintenanceMode);
            }
        } catch (error) {
            Toast.error(t("Failed to fetch maintenance mode settings."));
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleClick = (e) => {
        setPendingState(!isMaintenanceMode);
        setShowModal(true);
    };

    const handleConfirm = async () => {
        setIsUpdating(true);
        try {
            const res = await ApiUpdateMaintenanceMode({ isMaintenanceMode: pendingState });
            if (res && (res.isSuccess || res.message)) {
                setIsMaintenanceMode(pendingState);
                Toast.success(pendingState ? t("Maintenance mode has been enabled successfully.") : t("Platform access has been restored successfully."));
            } else {
                Toast.error(t("Unable to update maintenance mode. Please try again."));
            }
        } catch (error) {
            Toast.error(t("Unable to update maintenance mode. Please try again."));
        } finally {
            setIsUpdating(false);
            setShowModal(false);
        }
    };

    return (
        <>
            <div className='bg-white'>
                <Filter name={"Portal Settings"} dateShow={false} profileShow={true} />
            </div>
            <div className='middle_container addfilter_container acos_filter'>
                <div className="ps-container mt-3">
                    {/* Page Header */}
                    <div className="ps-header">
                        <h2 className="ps-page-title">{t("Portal settings")}</h2>
                        <p className="ps-page-desc">
                            {t("Manage platform availability during deployments, server maintenance, and infrastructure updates. Changes take effect immediately for all users.")}
                        </p>
                    </div>

                    {/* Maintenance Mode Control */}
                    <div className="ps-card">
                        <div className="ps-card-header">
                            <div>
                                <div className="ps-card-title-row">
                                    <h4 className="ps-card-title">{t("Maintenance mode")}</h4>
                                    <span className={`ps-badge ${isMaintenanceMode ? "maint" : "online"}`}>
                                        {isMaintenanceMode ? t("On") : t("Off")}
                                    </span>
                                </div>
                                <p className="ps-card-desc">
                                    {t("When enabled, users will be redirected to the maintenance screen and restricted from accessing platform features.")}
                                </p>
                            </div>
                        </div>

                        <div className="ps-toggle-row">
                            <div className="ps-toggle-info">
                                <span className="ps-toggle-name">
                                    {isMaintenanceMode ? t("Maintenance mode is on") : t("Maintenance mode is off")}
                                </span>
                                <span className="ps-toggle-note">
                                    {isMaintenanceMode
                                        ? t("Users are currently blocked from accessing the platform.")
                                        : t("All users can access the platform normally.")}
                                </span>
                            </div>
                            <Switch
                                checked={isMaintenanceMode}
                                onCheckedChange={handleToggleClick}
                                disabled={isLoading}
                                aria-label={t("Toggle maintenance mode")}
                            />
                        </div>
                    </div>

                    {/* Confirmation Modal */}
                    <Dialog open={showModal} onOpenChange={(isOpen) => { if (!isOpen && !isUpdating) setShowModal(false); }}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="flex items-center text-lg font-semibold">
                                    <AlertTriangle className="mr-2 text-red-500 h-5 w-5 shrink-0" />
                                    {pendingState ? t("Enable maintenance mode?") : t("Disable maintenance mode?")}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                {pendingState ? (
                                    <>
                                        <p className="font-semibold mb-2 text-slate-800 dark:text-slate-200">
                                            {t("This will immediately restrict all users from accessing the platform.")}
                                        </p>
                                        <p className="text-slate-500 dark:text-slate-400 mb-0">
                                            {t("Users will be redirected to the maintenance screen until you disable it. Are you sure you want to continue?")}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-semibold mb-2 text-slate-800 dark:text-slate-200">
                                            {t("This will immediately restore access for all users.")}
                                        </p>
                                        <p className="text-slate-500 dark:text-slate-400 mb-0">
                                            {t("The platform will be fully available again. Are you sure you want to continue?")}
                                        </p>
                                    </>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                                <Button variant="outline" onClick={() => setShowModal(false)} disabled={isUpdating} className="btn-premium-secondary">
                                    {t("Cancel")}
                                </Button>
                                <Button onClick={handleConfirm} disabled={isUpdating} className={pendingState ? "bg-red-500 hover:bg-red-600 text-white" : "bg-green-500 hover:bg-green-600 text-white"}>
                                    {isUpdating ? t("Processing...") : pendingState ? t("Enable maintenance mode") : t("Restore access")}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </>

    );
};

export default PortalSetting;