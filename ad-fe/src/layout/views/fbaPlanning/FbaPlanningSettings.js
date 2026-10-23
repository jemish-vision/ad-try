import React, { useState, useEffect } from 'react';
import { FiSave, FiRotateCcw } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { ApiGetFbaPlanningConfig, ApiSaveFbaPlanningConfig, ApiGetAsinInventorySettings, ApiSaveAsinInventorySettings, ApiDeleteAsinInventorySettings } from '../../../api-wrapper/inventoryManagement/ApiInventoryManagement';
import Toast from '../../../common/helper/toast/Toast';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "../../../components/ui/sheet";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";

const FbaPlanningSettings = ({ open, onClose, profileId, asin, sku, productName, isCustomSetting, onSaveSuccess, isDark }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [resetting, setResetting] = useState(false);

    const isProductLevel = !!(asin && sku);

    const [settings, setSettings] = useState({
        bufferDays: 7,
        transitDays: 14,
        coverageDays: 30,
        alertThreshold: 51,
        isAlertActive: true,
    });

    const fetchConfig = async () => {
        if (!profileId) return;
        setFetching(true);
        try {
            const res = isProductLevel
                ? await ApiGetAsinInventorySettings({ profileId, asin, sku })
                : await ApiGetFbaPlanningConfig({ profileId });

            if (res?.isSuccess && res.data) {
                setSettings({
                    bufferDays: res?.data?.bufferDays || 0,
                    transitDays: res?.data?.transitDays || 0,
                    coverageDays: res?.data?.coverageDays || 0,
                    alertThreshold: res?.data?.alertThreshold ?? 0,
                    isAlertActive: res?.data?.isAlertActive ?? true,
                });
            } else {
                if (isProductLevel) {
                    setSettings({ bufferDays: 0, transitDays: 0, coverageDays: 0, alertThreshold: null, isAlertActive: true });
                }
            }
        } catch (error) {
            console.error("Fetch Config Error:", error);
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        if (open && profileId) {
            fetchConfig();
        }
    }, [open, profileId, asin, sku]);

    const handleSave = async () => {
        if (!profileId) return;
        setLoading(true);
        try {
            const payload = {
                profileId,
                bufferDays: Number(settings?.bufferDays || 0),
                transitDays: Number(settings?.transitDays || 0),
                coverageDays: Number(settings?.coverageDays || 0),
                alertThreshold: Number(settings?.alertThreshold ?? 0),
                isAlertActive: settings?.isAlertActive ?? true,
            };

            if (isProductLevel) {
                payload.asin = asin;
                payload.sku = sku;
            }

            const res = isProductLevel
                ? await ApiSaveAsinInventorySettings(payload)
                : await ApiSaveFbaPlanningConfig(payload);

            if (res?.isSuccess) {
                Toast.success(isProductLevel ? t("Product settings saved") : t("Global settings saved"));
                onSaveSuccess?.(isProductLevel ? 'grid' : 'all');
                onClose();
            } else {
                Toast.error(res?.message || t("Failed to save settings"));
            }
        } catch (error) {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (!profileId || !asin) return;
        setResetting(true);
        try {
            const res = await ApiDeleteAsinInventorySettings({ profileId, asin, sku });
            if (res?.isSuccess) {
                Toast.success(t("Product settings reset to global defaults"));
                onSaveSuccess?.('grid');
                onClose();
            } else {
                Toast.error(res?.message || t("Failed to reset settings"));
            }
        } catch (error) {
            Toast.error(t("Something went wrong"));
        } finally {
            setResetting(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <SheetContent hideCloseButton={true} side="right" className="flex flex-col p-0 border-l" style={{ width: 420, maxWidth: "100%", background: isDark ? "#151d30" : "#fff", borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0" }}>
                <SheetHeader className="px-5 py-4 border-b text-left flex flex-row items-start justify-between" style={{ borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0" }}>
                    <div className="flex flex-col pr-6">
                        <SheetTitle style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: "var(--accent-primary)" }}>
                            {isProductLevel ? t("Product Settings") : t("Global Planning Settings")}
                        </SheetTitle>
                        {isProductLevel && productName && (
                            <span style={{ color: "var(--accent-primary)", fontWeight: 700, fontSize: "0.8rem", marginTop: 4 }}>
                                {productName}
                            </span>
                        )}
                        <p className="m-0 mt-2" style={{ fontSize: "0.85rem", color: isDark ? "rgba(255, 255, 255, 0.6)" : "#64748b" }}>
                            {isProductLevel
                                ? t("Configure specific parameters for this product. These will override global settings.")
                                : t("Configure global parameters for inventory forecasting and reorder calculations.")}
                        </p>
                    </div>
                    <button
                        id="fba-settings-close"
                        onClick={onClose}
                        className="btn-close rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 hover:opacity-100 transition-all text-slate-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-800 mt-1"
                    >
                        <i className="fa-solid fa-xmark text-sm" />
                        <span className="sr-only">Close</span>
                    </button>
                </SheetHeader>

                <div id="fba-settings-drawer" className="flex flex-col flex-1 overflow-y-auto" style={{ gap: 24, padding: "24px" }}>
                    {fetching ? (
                        [1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <div className="animate-pulse rounded" style={{ height: 20, width: "40%", backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.11)" }} />
                                <div className="animate-pulse rounded" style={{ height: 40, width: "100%", backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.11)" }} />
                            </div>
                        ))
                    ) : (
                        <>
                            {/* Buffer Days */}
                            <div className="flex flex-col">
                                <label className="font-bold mb-1" style={{ fontSize: 14, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>
                                    {t("Buffer Days")}
                                </label>
                                <span className="mb-2" style={{ fontSize: 12, lineHeight: 1.4, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                    {t("Safety stock days to account for unexpected sales spikes or shipping delays.")}
                                </span>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={settings.bufferDays}
                                        onChange={(e) => setSettings({ ...settings, bufferDays: e.target.value })}
                                        className="pr-12"
                                        style={{ height: 40, borderRadius: 8 }}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase" style={{ color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8" }}>
                                        {t("Days")}
                                    </span>
                                </div>
                            </div>

                            {/* Transit Days */}
                            <div className="flex flex-col">
                                <label className="font-bold mb-1" style={{ fontSize: 14, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>
                                    {t("Transit Days")}
                                </label>
                                <span className="mb-2" style={{ fontSize: 12, lineHeight: 1.4, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                    {t("Lead time (in days) required for your stock to reach Amazon FBA centers.")}
                                </span>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={settings.transitDays}
                                        onChange={(e) => setSettings({ ...settings, transitDays: e.target.value })}
                                        className="pr-12"
                                        style={{ height: 40, borderRadius: 8 }}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase" style={{ color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8" }}>
                                        {t("Days")}
                                    </span>
                                </div>
                            </div>

                            {/* Coverage Days */}
                            <div className="flex flex-col">
                                <label className="font-bold mb-1" style={{ fontSize: 14, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>
                                    {t("Coverage Days")}
                                </label>
                                <span className="mb-2" style={{ fontSize: 12, lineHeight: 1.4, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                    {t("Target inventory window. How many days of sales you want the new shipment to cover.")}
                                </span>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={settings.coverageDays}
                                        onChange={(e) => setSettings({ ...settings, coverageDays: e.target.value })}
                                        className="pr-12"
                                        style={{ height: 40, borderRadius: 8 }}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase" style={{ color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8" }}>
                                        {t("Days")}
                                    </span>
                                </div>
                            </div>

                            {/* Alert Threshold */}
                            <div className="flex flex-col">
                                <label className="font-bold mb-1" style={{ fontSize: 14, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>
                                    {t("Alert Threshold")}
                                </label>
                                <span className="mb-2" style={{ fontSize: 12, lineHeight: 1.4, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                    {t("Trigger a low-stock alert when remaining inventory falls below this many days of coverage.")}
                                </span>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        placeholder={t("e.g. 10")}
                                        value={settings.alertThreshold ?? 0}
                                        onChange={(e) => setSettings({ ...settings, alertThreshold: Number(e.target.value ?? 0) })}
                                        className="pr-12"
                                        style={{ height: 40, borderRadius: 8 }}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase" style={{ color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8" }}>
                                        {t("Days")}
                                    </span>
                                </div>
                            </div>

                            {/* Is Alert Active */}
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{
                                background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0"
                            }}>
                                <div className="flex flex-col">
                                    <label className="font-bold" style={{ fontSize: 14, color: isDark ? "rgba(255, 255, 255, 0.9)" : "#1e293b" }}>
                                        {t("Alert Active")}
                                    </label>
                                    <span style={{ fontSize: 12, lineHeight: 1.4, color: isDark ? "rgba(255, 255, 255, 0.5)" : "#64748b" }}>
                                        {settings.isAlertActive ? t("Alerts are currently enabled.") : t("Alerts are currently disabled.")}
                                    </span>
                                </div>
                                <div className="mt-2 pt-[3px]">
                                    <Switch
                                        checked={settings.isAlertActive}
                                        onCheckedChange={(checked) => setSettings({ ...settings, isAlertActive: checked })}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col gap-4 p-5 mt-auto" style={{ borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9" }}>
                    {isProductLevel && isCustomSetting && (
                        <Button
                            variant="outline"
                            onClick={handleReset}
                            disabled={loading || fetching || resetting}
                            className="w-full flex items-center justify-center gap-2"
                            style={{
                                height: 42,
                                borderRadius: 8,
                                fontWeight: 700,
                                color: "#f59e0b",
                                borderColor: isDark ? "rgba(245, 158, 11, 0.4)" : "#fed7aa",
                                background: isDark ? "rgba(245, 158, 11, 0.05)" : "transparent"
                            }}
                        >
                            {!resetting && <FiRotateCcw />}
                            {resetting ? t("Resetting...") : t("Reset to Global Defaults")}
                        </Button>
                    )}

                    <div className="flex gap-3">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="flex-1"
                            style={{
                                height: 42,
                                borderRadius: 8,
                                fontWeight: 700,
                                color: isDark ? "rgba(255, 255, 255, 0.7)" : "#64748b"
                            }}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={loading || fetching || resetting}
                            className="flex-1 flex items-center justify-center gap-2"
                            style={{
                                height: 42,
                                borderRadius: 8,
                                fontWeight: 700,
                                backgroundColor: "var(--accent-primary)",
                                color: "#fff"
                            }}
                        >
                            {!loading && <FiSave />}
                            {loading ? t("Saving...") : t("Save Changes")}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default FbaPlanningSettings;
