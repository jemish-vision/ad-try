import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import Toast from "../../../common/helper/toast/Toast";
import {
  ApiGetWarehousePlanning,
  ApiSaveWarehousePlanning,
  ApiGetAsinInventorySettings,
  ApiSaveAsinInventorySettings,
  ApiDeleteAsinInventorySettings,
} from "../../../api-wrapper/inventoryManagement/ApiInventoryManagement";

const WarehousePlanningModal = ({
  open,
  onClose,
  profileId,
  product,
  isDark,
  onSaveSuccess,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("marketplace");

  // ── Warehouse Planning State ───────────────────────────────────────────────
  const [warehouses, setWarehouses] = useState([]);
  const [originalWarehouses, setOriginalWarehouses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lastSyncDate, setLastSyncDate] = useState(null);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [savingWarehouses, setSavingWarehouses] = useState(false);
  const [warehouseSearch, setWarehouseSearch] = useState("");

  // ── Product-Level General Settings State ───────────────────────────────────
  const [productSettings, setProductSettings] = useState({
    bufferDays: 0,
    transitDays: 0,
    coverageDays: 0,
    alertThreshold: null,
    isAlertActive: true,
  });
  const [loadingProductSettings, setLoadingProductSettings] = useState(false);
  const [savingProductSettings, setSavingProductSettings] = useState(false);
  const [resettingProductSettings, setResettingProductSettings] = useState(false);

  const asin = product?.asin;
  const sku = product?.sku;
  const productName = product?.productName;
  const isCustomSetting = product?.isCustomSetting;

  // ── Fetch Warehouse Planning Data ──────────────────────────────────────────
  const fetchWarehouseData = useCallback(async () => {
    if (!profileId || (!asin && !sku)) return;
    setLoadingWarehouses(true);
    try {
      const res = await ApiGetWarehousePlanning({
        profileId,
        asin,
        sku,
      });
      if (res?.isSuccess && Array.isArray(res?.data)) {
        setWarehouses(res.data);
        setOriginalWarehouses(JSON.parse(JSON.stringify(res.data)));
        setSummary(res?.summary || null);
        setLastSyncDate(res?.lastSyncDate || res?.reportDate || res.data[0]?.reportDate || null);
      } else {
        setWarehouses([]);
        setOriginalWarehouses([]);
        setSummary(null);
        setLastSyncDate(null);
      }
    } catch (err) {
      console.error("Error fetching warehouse planning:", err);
      setWarehouses([]);
      setOriginalWarehouses([]);
      setSummary(null);
      setLastSyncDate(null);
    } finally {
      setLoadingWarehouses(false);
    }
  }, [profileId, asin, sku]);

  // ── Fetch Product-Level Override Settings ──────────────────────────────────
  const fetchProductSettings = useCallback(async () => {
    if (!profileId || (!asin && !sku)) return;
    setLoadingProductSettings(true);
    try {
      const res = await ApiGetAsinInventorySettings({
        profileId,
        asin,
        sku,
      });
      if (res?.isSuccess && res.data) {
        setProductSettings({
          bufferDays: res.data.bufferDays || 0,
          transitDays: res.data.transitDays || 0,
          coverageDays: res.data.coverageDays || 0,
          alertThreshold: res.data.alertThreshold ?? null,
          isAlertActive: res.data.isAlertActive ?? true,
        });
      } else {
        setProductSettings({
          bufferDays: 0,
          transitDays: 0,
          coverageDays: 0,
          alertThreshold: null,
          isAlertActive: true,
        });
      }
    } catch (err) {
      console.error("Error fetching product settings:", err);
    } finally {
      setLoadingProductSettings(false);
    }
  }, [profileId, asin, sku]);

  useEffect(() => {
    if (open && profileId && (asin || sku)) {
      setActiveTab("marketplace");
      fetchWarehouseData();
      fetchProductSettings();
    }
  }, [open, profileId, asin, sku, fetchWarehouseData, fetchProductSettings]);

  // ── Warehouse Field Change Handler ─────────────────────────────────────────
  const handleWarehouseFieldChange = (index, field, value) => {
    let cleanVal = value;
    if (field !== "isAlertActive") {
      if (value !== "" && value !== null && value !== undefined) {
        const parsed = parseInt(value, 10);
        cleanVal = isNaN(parsed) ? "" : Math.max(0, parsed);
      } else {
        cleanVal = "";
      }
    }
    setWarehouses((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: cleanVal,
      };
      return updated;
    });
  };

  // ── Save Warehouse Settings ────────────────────────────────────────────────
  const handleSaveWarehouses = async () => {
    if (!profileId || !asin) return;

    for (const w of warehouses) {
      if (
        (w.alertThreshold !== "" && w.alertThreshold !== null && w.alertThreshold < 0) ||
        (w.coverageDays !== "" && w.coverageDays !== null && w.coverageDays < 0) ||
        (w.transitDays !== "" && w.transitDays !== null && w.transitDays < 0) ||
        (w.bufferDays !== "" && w.bufferDays !== null && w.bufferDays < 0)
      ) {
        Toast.error(t("Values cannot be negative."));
        return;
      }
    }

    const toNullableInt = (val) => {
      if (val === "" || val === null || val === undefined) return null;
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? null : Math.max(0, parsed);
    };

    setSavingWarehouses(true);
    try {
      const payload = {
        profileId,
        asin,
        sku,
        warehouses: warehouses.map((w) => ({
          warehouseId: w.warehouseId,
          warehouseName: w.warehouseName,
          isAlertActive: w.isAlertActive !== undefined ? Boolean(w.isAlertActive) : true,
          alertThreshold: toNullableInt(w.alertThreshold),
          coverageDays: toNullableInt(w.coverageDays),
          transitDays: toNullableInt(w.transitDays),
          bufferDays: toNullableInt(w.bufferDays),
        })),
      };

      const res = await ApiSaveWarehousePlanning(payload);
      if (res?.isSuccess) {
        Toast.success(res?.message || t("Warehouse planning settings saved successfully."));
        onSaveSuccess?.("grid");
        onClose();
      } else {
        Toast.error(res?.message || t("Failed to save warehouse settings."));
      }
    } catch (err) {
      console.error("Error saving warehouse planning:", err);
      Toast.error(t("Failed to save warehouse settings."));
    } finally {
      setSavingWarehouses(false);
    }
  };

  // ── Save Product-Level Override Settings ───────────────────────────────────
  const handleSaveProductSettings = async () => {
    if (!profileId || !asin || !sku) return;
    setSavingProductSettings(true);
    try {
      const payload = {
        profileId,
        asin,
        sku,
        bufferDays: Number(productSettings?.bufferDays || 0),
        transitDays: Number(productSettings?.transitDays || 0),
        coverageDays: Number(productSettings?.coverageDays || 0),
        alertThreshold: productSettings?.alertThreshold !== null ? Number(productSettings?.alertThreshold) : 0,
        isAlertActive: productSettings?.isAlertActive ?? true,
      };

      const res = await ApiSaveAsinInventorySettings(payload);
      if (res?.isSuccess) {
        Toast.success(t("Product settings saved"));
        onSaveSuccess?.("grid");
        onClose();
      } else {
        Toast.error(res?.message || t("Failed to save settings"));
      }
    } catch (error) {
      console.error("Error saving product settings:", error);
      Toast.error(t("Something went wrong"));
    } finally {
      setSavingProductSettings(false);
    }
  };

  // ── Reset Product Settings to Global Defaults ──────────────────────────────
  const handleResetProductSettings = async () => {
    if (!profileId || !asin || !sku) return;
    setResettingProductSettings(true);
    try {
      const res = await ApiDeleteAsinInventorySettings({ profileId, asin, sku });
      if (res?.isSuccess) {
        Toast.success(t("Product settings reset to global defaults"));
        onSaveSuccess?.("grid");
        onClose();
      } else {
        Toast.error(res?.message || t("Failed to reset settings"));
      }
    } catch (error) {
      console.error("Error resetting product settings:", error);
      Toast.error(t("Something went wrong"));
    } finally {
      setResettingProductSettings(false);
    }
  };

  // ── Filtered warehouses by search ──────────────────────────────────────────
  const filteredWarehouses = useMemo(() => {
    if (!warehouseSearch.trim()) return warehouses;
    const q = warehouseSearch.toLowerCase().trim();
    return warehouses.filter((w) => {
      return (
        w.warehouseId?.toLowerCase().includes(q) ||
        w.warehouseName?.toLowerCase().includes(q) ||
        w.inventoryForecastStatus?.toLowerCase().includes(q)
      );
    });
  }, [warehouses, warehouseSearch]);



  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        hideCloseButton={true}
        className="!p-0 !gap-0 w-[96vw] max-w-6xl xl:max-w-7xl h-[88vh] max-h-[88vh] flex flex-col overflow-hidden bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl"
        style={{ zIndex: 9999, maxHeight: "88vh", height: "88vh" }}
      >
        {/* ── Modal Header (Pinned at Top) ── */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between shrink-0 bg-white dark:bg-[#111827]">
          <div className="flex flex-col pr-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold shrink-0">
                <i className="fa-solid fa-gear" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t("Product Planning & Warehouse Settings")}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {productName && (
                    <span className="font-medium text-slate-700 dark:text-slate-300 max-w-[320px] truncate" title={productName}>
                      {productName}
                    </span>
                  )}
                  {sku && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">
                      SKU: <b>{sku}</b>
                    </span>
                  )}
                  {asin && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono">
                      ASIN: <b>{asin}</b>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <i className="fa-solid fa-xmark text-base" />
          </button>
        </DialogHeader>

        {/* ── Modal Body ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 pb-4 bg-white dark:bg-[#111827]">
          {/* Pinned Tab Switcher Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 mb-3 shrink-0">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab("marketplace")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "marketplace"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <i className="fa-solid fa-globe text-xs" />
                <span>{t("Marketplace / Region Planning")}</span>
                {isCustomSetting && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" title={t("Custom Settings Active")} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("warehouse")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "warehouse"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <i className="fa-solid fa-warehouse text-xs" />
                <span>{t("Warehouse Planning")}</span>
                {warehouses.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300">
                    {warehouses.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "warehouse" && warehouses.length > 5 && (
              <div className="w-full sm:w-64">
                <Input
                  placeholder={t("Filter FC...")}
                  value={warehouseSearch}
                  onChange={(e) => setWarehouseSearch(e.target.value)}
                  className="h-8 text-xs bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            )}
          </div>

          {/* ── BLOCK 1: Marketplace / Region Planning ── */}
          {activeTab === "marketplace" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ minHeight: 0 }}>
              {loadingProductSettings ? (
                <div className="flex-1 flex items-center justify-center p-8 rounded-xl border flex-col gap-3 my-2 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <i className="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl" />
                  <span className="text-xs font-medium text-slate-500">
                    {t("Loading marketplace / region settings...")}
                  </span>
                </div>
              ) : (
                <>
                  {/* Scrollable Form Body */}
                  <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-2 py-2" style={{ minHeight: 0 }}>
                    <div className="space-y-5 max-w-xl mx-auto">
                      <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                        <i className="fa-solid fa-globe text-blue-500 text-sm mt-0.5" />
                        <div>
                          <strong className="font-semibold block">{t("Marketplace / Region Planning Parameters")}</strong>
                          <span className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                            {t("Configure default replenishment lead times and alert thresholds for this marketplace/region. Individual fulfillment centers inherit these defaults unless specifically customized in Warehouse Planning.")}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Buffer Days */}
                        <div className="flex flex-col">
                          <label className="font-bold mb-1 text-xs text-slate-800 dark:text-slate-200">
                            {t("Buffer Days")}
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={productSettings.bufferDays}
                              onChange={(e) => setProductSettings({ ...productSettings, bufferDays: e.target.value })}
                              className="h-9 pr-12 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-400">
                              {t("Days")}
                            </span>
                          </div>
                        </div>

                        {/* Transit Days */}
                        <div className="flex flex-col">
                          <label className="font-bold mb-1 text-xs text-slate-800 dark:text-slate-200">
                            {t("Transit Days")}
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={productSettings.transitDays}
                              onChange={(e) => setProductSettings({ ...productSettings, transitDays: e.target.value })}
                              className="h-9 pr-12 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-400">
                              {t("Days")}
                            </span>
                          </div>
                        </div>

                        {/* Coverage Days */}
                        <div className="flex flex-col">
                          <label className="font-bold mb-1 text-xs text-slate-800 dark:text-slate-200">
                            {t("Coverage Days")}
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={productSettings.coverageDays}
                              onChange={(e) => setProductSettings({ ...productSettings, coverageDays: e.target.value })}
                              className="h-9 pr-12 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-400">
                              {t("Days")}
                            </span>
                          </div>
                        </div>

                        {/* Alert Threshold */}
                        <div className="flex flex-col">
                          <label className="font-bold mb-1 text-xs text-slate-800 dark:text-slate-200">
                            {t("Alert Threshold")}
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={productSettings.alertThreshold ?? 0}
                              onChange={(e) => setProductSettings({ ...productSettings, alertThreshold: Number(e.target.value ?? 0) })}
                              className="h-9 pr-12 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-400">
                              {t("Units")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Is Alert Active */}
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                            {t("Enable Low-Stock Alerts")}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {t("Show warning badges when marketplace stock falls below threshold")}
                          </span>
                        </div>
                        <Switch
                          checked={productSettings.isAlertActive}
                          onCheckedChange={(checked) => setProductSettings({ ...productSettings, isAlertActive: checked })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Marketplace Settings Footer (Pinned at Bottom) */}
                  <div className="shrink-0 flex items-center justify-between pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
                    {isCustomSetting ? (
                      <Button
                        variant="ghost"
                        onClick={handleResetProductSettings}
                        disabled={resettingProductSettings}
                        className="h-9 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-1.5"
                      >
                        <i className="fa-solid fa-rotate-left text-xs" />
                        <span>{t("Reset to Global Defaults")}</span>
                      </Button>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-9 px-4 text-xs font-semibold rounded-lg"
                      >
                        {t("Cancel")}
                      </Button>
                      <Button
                        onClick={handleSaveProductSettings}
                        disabled={savingProductSettings}
                        className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 shadow-sm"
                      >
                        {savingProductSettings ? (
                          <>
                            <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                            <span>{t("Saving...")}</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-floppy-disk text-xs" />
                            <span>{t("Save Marketplace Settings")}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── BLOCK 2: Warehouse Planning ── */}
          {activeTab === "warehouse" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ minHeight: 0 }}>
              {loadingWarehouses ? (
                <div className="flex-1 flex items-center justify-center p-8 rounded-xl border flex-col gap-3 my-2 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <i className="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl" />
                  <span className="text-xs font-medium text-slate-500">
                    {t("Loading warehouse planning settings...")}
                  </span>
                </div>
              ) : warehouses.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-xl border text-center my-2 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                    <i className="fa-solid fa-warehouse text-lg" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("No warehouse records found for this product.")}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t("Warehouse inventory is populated when Amazon FC Inventory Ledger syncs.")}
                  </p>
                </div>
              ) : (
                <>
                  {/* Informational Sub-header */}
                  <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs mb-2.5">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <i className="fa-solid fa-sliders text-blue-500" />
                      <span>{t("Configure FC-specific replenishment lead times and alert thresholds. Blank fields inherit marketplace defaults.")}</span>
                    </div>
                    {lastSyncDate && (
                      <span className="text-[11px] text-slate-400">
                        {t("Ledger Date:")} <span className="font-mono font-medium text-slate-600 dark:text-slate-300">{lastSyncDate}</span>
                      </span>
                    )}
                  </div>

                  {/* Warehouse Configuration Table */}
                  <div className="flex-1 min-h-0 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col bg-white dark:bg-slate-900/60">
                    <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ minHeight: 0 }}>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead
                          className="sticky top-0 z-20 shadow-xs"
                          style={{
                            background: isDark ? "#1e293b" : "#f1f5f9",
                            position: "sticky",
                            top: 0,
                          }}
                        >
                          <tr
                            className="border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
                            style={{ background: isDark ? "#1e293b" : "#f1f5f9" }}
                          >
                            <th className="py-2.5 px-3 min-w-[200px]">{t("Warehouse / FC")}</th>
                            <th className="py-2.5 px-3 text-right min-w-[95px]">{t("Stock")}</th>
                            <th className="py-2.5 px-3 text-center min-w-[110px]">{t("Low Stock Alert")}</th>
                            <th className="py-2.5 px-2 text-center min-w-[105px]">
                              <div className="flex items-center justify-center gap-1">
                                <span>{t("Threshold")}</span>
                                <i className="fa-solid fa-circle-info text-[10px] text-slate-400" title={t("Alert Threshold units")} />
                              </div>
                            </th>
                            <th className="py-2.5 px-2 text-center min-w-[105px]">
                              <div className="flex items-center justify-center gap-1">
                                <span>{t("Coverage")}</span>
                                <i className="fa-solid fa-circle-info text-[10px] text-slate-400" title={t("Coverage Days")} />
                              </div>
                            </th>
                            <th className="py-2.5 px-2 text-center min-w-[100px]">
                              <div className="flex items-center justify-center gap-1">
                                <span>{t("Transit")}</span>
                                <i className="fa-solid fa-circle-info text-[10px] text-slate-400" title={t("Transit Days")} />
                              </div>
                            </th>
                            <th className="py-2.5 px-2 text-center min-w-[100px]">
                              <div className="flex items-center justify-center gap-1">
                                <span>{t("Buffer")}</span>
                                <i className="fa-solid fa-circle-info text-[10px] text-slate-400" title={t("Buffer Safety Days")} />
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900/60">
                          {filteredWarehouses.map((wh, idx) => {
                            const originalIdx = warehouses.findIndex((item) => item.warehouseId === wh.warehouseId);
                            const actualIdx = originalIdx >= 0 ? originalIdx : idx;

                            const currentQty =
                              wh.currentQty !== undefined && wh.currentQty !== null ? Number(wh.currentQty) : 0;

                            const alertThreshold =
                              wh.alertThreshold !== undefined && wh.alertThreshold !== null ? wh.alertThreshold : "";
                            const coverageDays =
                              wh.coverageDays !== undefined && wh.coverageDays !== null ? wh.coverageDays : "";
                            const transitDays =
                              wh.transitDays !== undefined && wh.transitDays !== null ? wh.transitDays : "";
                            const bufferDays =
                              wh.bufferDays !== undefined && wh.bufferDays !== null ? wh.bufferDays : "";

                            const effectiveThreshold = wh.effectiveAlertThreshold ?? 51;
                            const effectiveCoverage = wh.effectiveCoverageDays ?? 30;
                            const effectiveTransit = wh.effectiveTransitDays ?? 14;
                            const effectiveBuffer = wh.effectiveBufferDays ?? 7;

                            const isAlertOn = wh.isAlertActive !== false;

                            const isBelowAlert =
                              alertThreshold !== "" && Number(alertThreshold) > 0
                                ? currentQty <= Number(alertThreshold)
                                : currentQty <= effectiveThreshold;

                            const hasCustomFCConfig =
                              alertThreshold !== "" || coverageDays !== "" || transitDays !== "" || bufferDays !== "" || wh.isAlertActive !== undefined;

                            return (
                              <tr
                                key={wh.warehouseId || idx}
                                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                {/* Warehouse ID & Name & City/State */}
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700">
                                      {wh.warehouseId}
                                    </span>
                                    <div className="flex flex-col min-w-0">
                                      <span
                                        className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate max-w-[200px]"
                                        title={wh.warehouseName}
                                      >
                                        {wh.warehouseName || wh.warehouseId}
                                      </span>
                                      {(wh.city || wh.state) && (
                                        <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                          {[wh.city, wh.state].filter(Boolean).join(", ")}
                                        </span>
                                      )}
                                    </div>
                                    {hasCustomFCConfig && (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                                        title={t("Custom FC settings configured")}
                                      />
                                    )}
                                  </div>
                                </td>

                                {/* Current Stock */}
                                <td className="py-2 px-3 text-right">
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 font-semibold border border-slate-200/60 dark:border-slate-700/60">
                                    <i className="fa-solid fa-lock text-[8px] text-slate-400" title={t("Read-only from Amazon report")} />
                                    <span className={isBelowAlert && isAlertOn ? "text-amber-600 dark:text-amber-400 font-bold" : ""}>
                                      {currentQty.toLocaleString()}
                                    </span>
                                  </div>
                                </td>

                                {/* Low Stock Alert Toggle Switch */}
                                <td className="py-2 px-3 text-center">
                                  <div className="flex items-center justify-center">
                                    <Switch
                                      checked={isAlertOn}
                                      onCheckedChange={(val) =>
                                        handleWarehouseFieldChange(actualIdx, "isAlertActive", val)
                                      }
                                    />
                                  </div>
                                </td>

                                {/* Alert Threshold */}
                                <td className="py-2 px-2 text-center">
                                  <div className="w-20 mx-auto">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={alertThreshold}
                                      onChange={(e) =>
                                        handleWarehouseFieldChange(actualIdx, "alertThreshold", e.target.value)
                                      }
                                      className="h-8 text-center text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xs focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal"
                                      placeholder="0"
                                      title={t("Alert Threshold (Default: {{val}})", { val: effectiveThreshold })}
                                    />
                                  </div>
                                </td>

                                {/* Coverage Days */}
                                <td className="py-2 px-2 text-center">
                                  <div className="w-20 mx-auto">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={coverageDays}
                                      onChange={(e) =>
                                        handleWarehouseFieldChange(actualIdx, "coverageDays", e.target.value)
                                      }
                                      className="h-8 text-center text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xs focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal"
                                      placeholder="0"
                                      title={t("Coverage Days (Default: {{val}})", { val: effectiveCoverage })}
                                    />
                                  </div>
                                </td>

                                {/* Transit Days */}
                                <td className="py-2 px-2 text-center">
                                  <div className="w-20 mx-auto">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={transitDays}
                                      onChange={(e) =>
                                        handleWarehouseFieldChange(actualIdx, "transitDays", e.target.value)
                                      }
                                      className="h-8 text-center text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xs focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal"
                                      placeholder="0"
                                      title={t("Transit Days (Default: {{val}})", { val: effectiveTransit })}
                                    />
                                  </div>
                                </td>

                                {/* Buffer Days */}
                                <td className="py-2 px-2 text-center">
                                  <div className="w-20 mx-auto">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={bufferDays}
                                      onChange={(e) =>
                                        handleWarehouseFieldChange(actualIdx, "bufferDays", e.target.value)
                                      }
                                      className="h-8 text-center text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xs focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal"
                                      placeholder="0"
                                      title={t("Buffer Days (Default: {{val}})", { val: effectiveBuffer })}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Warehouse Footer (Pinned at Bottom) */}
              <div className="shrink-0 flex items-center justify-between pt-3 mt-3 border-t border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {t("Blank fields inherit marketplace defaults.")}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="h-9 px-4 text-xs font-semibold rounded-lg"
                  >
                    {t("Cancel")}
                  </Button>
                  <Button
                    onClick={handleSaveWarehouses}
                    disabled={savingWarehouses || loadingWarehouses || warehouses.length === 0}
                    className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 shadow-sm"
                  >
                    {savingWarehouses ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                        <span>{t("Saving Settings...")}</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-floppy-disk text-xs" />
                        <span>{t("Save Warehouse Settings")}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WarehousePlanningModal;
