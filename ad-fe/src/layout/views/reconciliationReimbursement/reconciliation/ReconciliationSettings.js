import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/ui/button";
import { Switch } from "../../../../components/ui/switch";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "../../../../components/ui/sheet";
import { FiSettings, FiBell, FiBellOff } from "react-icons/fi";
import Toast from "../../../../common/helper/toast/Toast";
import {
    ApiGetNotificationStatus,
    ApiUpdateNotificationStatus,
} from "../../../../api-wrapper/reconciliation-reimbursement/ApiReconciliationReimbursement";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";

const ReconciliationSettings = ({ show, handleClose, profileId, isDark }) => {
  const { t } = useTranslation();
    const [notificationActive, setNotificationActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.RECONCILIATION_AND_REIMBURSEMENT, PAGE_ACTIONS.UPDATE);

    useEffect(() => {
        if (show && profileId) {
            fetchNotificationStatus();
        }
    }, [show, profileId]);

    const fetchNotificationStatus = async () => {
        setLoading(true);
        try {
            const res = await ApiGetNotificationStatus({ profileId });
            if (res?.isSuccess) {
                setNotificationActive(res?.data?.isReconsilationNotification ?? true);
            } else {
                Toast.error(res?.message || "Failed to load notification settings");
            }
        } catch (err) {
            Toast.error(err?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await ApiUpdateNotificationStatus({
                profileId,
                isReconsilationNotification: notificationActive,
            });
            if (res?.isSuccess) {
                Toast.success(t("Notification settings saved successfully"));
                handleClose();
            } else {
                Toast.error(res?.message || "Failed to update notification settings");
            }
        } catch (err) {
            Toast.error(err?.message || "Something went wrong");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={show} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <SheetContent 
                side="right" 
                className="flex flex-col p-0 border-l w-full sm:w-[400px]" 
                style={{ maxWidth: "100%", background: isDark ? "var(--glass-bg)" : "#fff", borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0" }}
                overlayStyle={{ backdropFilter: "none", WebkitBackdropFilter: "none", backgroundColor: "rgba(0, 0, 0, 0.65)" }}
            >
                <SheetHeader className="px-5 py-4 border-b text-left" style={{ borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0" }}>
                    <div className="flex items-center gap-2 pr-6">
                        <FiSettings size={18} color="#1A9FD4" />
                        <div>
                            <SheetTitle style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: isDark ? "rgba(255, 255, 255, 0.92)" : "inherit" }}>
                                {t("Reconciliation settings")}
                            </SheetTitle>
                            <p className="m-0" style={{ fontSize: 11, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                {t("Notifications & alerts")}
                            </p>
                        </div>
                    </div>
                </SheetHeader>

                <div id="recon-settings-drawer" className="flex flex-col flex-1 overflow-y-auto" style={{ gap: 20, padding: "20px" }}>
                {loading ? (
                    <div className="flex justify-center items-center flex-grow-1">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-500 border-t-transparent" />
                    </div>
                ) : (
                    <>
                        {/* Info box */}
                        <div
                            style={{
                                background: isDark ? "rgba(29, 78, 216, 0.15)" : "#eff6ff",
                                border: isDark ? "1px solid rgba(29, 78, 216, 0.3)" : "0.5px solid #bfdbfe",
                                borderRadius: 8,
                                padding: "11px 14px",
                                fontSize: 12,
                                color: isDark ? "#60a5fa" : "#1d4ed8",
                                display: "flex",
                                gap: 8,
                            }}
                        >
                            <i className="fa-solid fa-circle-info" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span>
                                {t("Enable notifications to get alerted when reimbursement items need attention or status changes.")}
                            </span>
                        </div>

                        {/* Toggle section */}
                        <div>
                            <p
                                style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: isDark ? "rgba(255, 255, 255, 0.4)" : "#64748b",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    marginBottom: 8,
                                }}
                            >
                                {t("NOTIFICATION PREFERENCE")}
                            </p>

                            <div
                                className="flex items-center justify-between"
                                style={{
                                    padding: 16,
                                    background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                                    borderRadius: 8,
                                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "0.5px solid #e2e8f0",
                                }}
                            >
                                <div className="flex flex-col" style={{ gap: 3 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>
                                        {t("Reimbursement notifications")}
                                    </span>
                                    <span style={{ fontSize: 11, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                        {t("Receive alerts for reimbursement activity")}
                                    </span>
                                </div>
                                <div className="mt-2 pt-[3px]">
                                    <Switch
                                        id="notifSwitch"
                                        checked={notificationActive}
                                        onCheckedChange={setNotificationActive}
                                        disabled={!hasUpdatePermission}
                                    />
                                </div>
                            </div>

                            {/* Status indicator */}
                            <div
                                className="flex items-center justify-between mt-2"
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: 8,
                                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "0.5px solid #e2e8f0",
                                }}
                            >
                                <span style={{ fontSize: 12, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>{t("Current status")}</span>
                                <span
                                    className="flex items-center gap-1"
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        padding: "3px 10px",
                                        borderRadius: 20,
                                        background: notificationActive ? (isDark ? "rgba(22, 163, 74, 0.15)" : "#dcfce7") : (isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9"),
                                        color: notificationActive ? (isDark ? "#34d399" : "#16a34a") : (isDark ? "rgba(255, 255, 255, 0.4)" : "#64748b"),
                                    }}
                                >
                                    {notificationActive ? (
                                        <><FiBell size={12} /> {t("Active")}</>
                                    ) : (
                                        <><FiBellOff size={12} /> {t("Inactive")}</>
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* Footer actions — pushed to bottom */}
                        <div className="flex gap-2 mt-auto pt-3" style={{ borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "0.5px solid #e2e8f0" }}>
                            <Button
                                variant="outline"
                                id="recon-settings-close"
                                className="flex-1"
                                style={{ 
                                    borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "#cbd5e1", 
                                    color: isDark ? "rgba(255, 255, 255, 0.8)" : "#475569", 
                                    fontSize: 13 
                                }}
                                onClick={handleClose}
                                disabled={saving}
                            >
                                {t("Cancel")}
                            </Button>
                            <Button
                                className="flex-1 bg-primary text-white hover:bg-primary/90"
                                style={{ fontSize: 13 }}
                                onClick={handleSave}
                                disabled={saving || !hasUpdatePermission}
                            >
                                {saving ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent inline-block mr-2" /> : null}
                                {saving ? t("Saving...") : t("Save settings")}
                            </Button>
                        </div>
                    </>
                )}
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default ReconciliationSettings;