import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ApiGetWarehousePlanning } from "../../../api-wrapper/inventoryManagement/ApiInventoryManagement";

const WarehousePlanningAccordion = ({ data, profileId, isDark, onUpdated, onOpenSettings }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lastSyncDate, setLastSyncDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const asin = data?.asin;
  const sku = data?.sku;

  // ── Fetch warehouse planning data for this product ──────────────────────────
  const fetchWarehouseData = useCallback(async () => {
    if (!profileId || (!asin && !sku)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await ApiGetWarehousePlanning({
        profileId,
        asin,
        sku,
      });

      if (res?.isSuccess && Array.isArray(res?.data)) {
        setWarehouses(res.data);
        setSummary(res?.summary || null);
        setLastSyncDate(res?.lastSyncDate || res?.reportDate || res.data[0]?.reportDate || null);
      } else {
        setWarehouses([]);
        setSummary(null);
        setLastSyncDate(null);
      }
    } catch (err) {
      console.error("Error fetching warehouse planning:", err);
      setErrorMsg(t("Failed to load warehouse data."));
      setWarehouses([]);
      setSummary(null);
      setLastSyncDate(null);
    } finally {
      setLoading(false);
    }
  }, [profileId, asin, sku, t]);

  useEffect(() => {
    fetchWarehouseData();
  }, [fetchWarehouseData]);



  // ── Status Badge Renderer ──────────────────────────────────────────────────
  const renderStatusBadge = (status) => {
    let bg = isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9";
    let text = isDark ? "rgba(255, 255, 255, 0.8)" : "#475569";
    let icon = "fa-circle-check";
    let label = status ? status.replace(/_/g, " ") : "N/A";

    if (status === "URGENT") {
      bg = isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2";
      text = isDark ? "#f87171" : "#ef4444";
      icon = "fa-circle-exclamation";
      label = t("Urgent");
    } else if (status === "PLAN_SHIPMENT") {
      bg = isDark ? "rgba(245, 158, 11, 0.2)" : "#fef3c7";
      text = isDark ? "#fbbf24" : "#d97706";
      icon = "fa-truck-fast";
      label = t("Plan Shipment");
    } else if (status === "OVERSTOCK") {
      bg = isDark ? "rgba(139, 92, 246, 0.2)" : "#e0f2fe";
      text = isDark ? "#a78bfa" : "#0ea5e9";
      icon = "fa-boxes-stacked";
      label = t("Overstock");
    } else if (status === "HEALTHY") {
      bg = isDark ? "rgba(16, 185, 129, 0.2)" : "#dcfce7";
      text = isDark ? "#34d399" : "#16a34a";
      icon = "fa-circle-check";
      label = t("Healthy");
    } else if (status === "NO_SALES") {
      bg = isDark ? "rgba(255, 255, 255, 0.04)" : "#f8fafc";
      text = isDark ? "rgba(255, 255, 255, 0.5)" : "#94a3b8";
      icon = "fa-circle-minus";
      label = t("No Sales");
    }

    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase whitespace-nowrap"
        style={{
          backgroundColor: bg,
          color: text,
          border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
        }}
      >
        <i className={`fa-solid ${icon} text-[9px]`} />
        {label}
      </span>
    );
  };

  // ── Filtered Warehouses ────────────────────────────────────────────────────
  const filteredWarehouses = useMemo(() => {
    if (!searchQuery.trim()) return warehouses;
    const query = searchQuery.toLowerCase().trim();
    return warehouses.filter(
      (w) =>
        (w.warehouseId && w.warehouseId.toLowerCase().includes(query)) ||
        (w.warehouseName && w.warehouseName.toLowerCase().includes(query)) ||
        (w.inventoryForecastStatus && w.inventoryForecastStatus.toLowerCase().includes(query))
    );
  }, [warehouses, searchQuery]);

  // ── Calculated or Fetched Summary ──────────────────────────────────────────
  const activeSummary = useMemo(() => {
    if (summary) return summary;
    return {
      totalWarehouses: warehouses.length,
      totalCurrentQty: warehouses.reduce((sum, r) => sum + (Number(r.currentQty) || 0), 0),
      totalInTransit: warehouses.reduce(
        (sum, r) => sum + (Number(r.inTransitBetweenWarehouses || r.inTransit) || 0),
        0
      ),
      totalRecommendedQty: warehouses.reduce((sum, r) => sum + (Number(r.recommendedShipmentQty) || 0), 0),
      urgentCount: warehouses.filter((r) => r.inventoryForecastStatus === "URGENT").length,
      planShipmentCount: warehouses.filter((r) => r.inventoryForecastStatus === "PLAN_SHIPMENT").length,
    };
  }, [summary, warehouses]);

  // ── Loading Skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="p-6 rounded-xl border flex items-center justify-center gap-3 my-2"
        style={{
          background: isDark ? "rgba(15, 23, 42, 0.6)" : "#f8fafc",
          borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0",
        }}
      >
        <i className="fa-solid fa-circle-notch fa-spin text-blue-500 text-lg" />
        <span className="text-xs font-medium text-slate-500">
          {t("Loading warehouse inventory and restock calculations...")}
        </span>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────────
  if (!loading && warehouses.length === 0) {
    return (
      <div
        className="p-6 rounded-xl border text-center my-2"
        style={{
          background: isDark ? "rgba(15, 23, 42, 0.6)" : "#f8fafc",
          borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0",
        }}
      >
        <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
          <i className="fa-solid fa-warehouse text-base" />
        </div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t("No warehouse records found for this product.")}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          {t("Warehouse inventory is populated when Amazon FC Inventory Ledger syncs.")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="warehouse-planning-accordion p-4 rounded-xl border shadow-sm my-2 animate-in fade-in duration-200"
      style={{
        background: isDark ? "rgba(15, 23, 42, 0.85)" : "#ffffff",
        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0",
      }}
    >
      {/* ── Subtitle / Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm shadow-xs">
            <i className="fa-solid fa-warehouse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t("Warehouse / FC Inventory & Restock Planning")}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                {warehouses.length} {t("Warehouses")}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t("Historical velocity (ADS) derived from Amazon FC shipments. Tailor buffer & transit lead times per fulfillment center.")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lastSyncDate && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <i className="fa-solid fa-clock-rotate-left text-blue-500 text-xs" />
              <span>
                <strong className="font-semibold text-slate-700 dark:text-slate-300">{t("Ledger Date:")}</strong>{" "}
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {lastSyncDate}
                </span>
              </span>
            </div>
          )}

          {onOpenSettings && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="h-7 px-3 text-xs font-semibold gap-1.5 rounded-lg border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-2xs"
            >
              <i className="fa-solid fa-sliders text-xs" />
              <span>{t("Configure FC Settings")}</span>
            </Button>
          )}

          {warehouses.length > 4 && (
            <div className="w-48">
              <Input
                placeholder={t("Filter FC / Status...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 mb-3.5">
        {/* Total Stock */}
        <div
          className="p-2.5 rounded-lg border flex flex-col justify-between"
          style={{
            background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
            borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9",
          }}
        >
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <i className="fa-solid fa-boxes-stacked text-blue-500" />
            <span>{t("Total FC Stock")}</span>
          </div>
          <div className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
            {(activeSummary.totalCurrentQty || 0).toLocaleString()}
            <span className="text-[10px] font-normal text-slate-400 ml-1">{t("units")}</span>
          </div>
        </div>

        {/* In-Transit Between FCs */}
        <div
          className="p-2.5 rounded-lg border flex flex-col justify-between"
          style={{
            background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
            borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9",
          }}
        >
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <i className="fa-solid fa-truck-fast text-sky-500" />
            <span>{t("In-Transit (FCs)")}</span>
          </div>
          <div className="text-base font-bold text-sky-600 dark:text-sky-400 mt-1">
            {(activeSummary.totalInTransit || 0).toLocaleString()}
            <span className="text-[10px] font-normal text-slate-400 ml-1">{t("units")}</span>
          </div>
        </div>

        {/* Recommended Restock */}
        <div
          className="p-2.5 rounded-lg border flex flex-col justify-between"
          style={{
            background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
            borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9",
          }}
        >
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <i className="fa-solid fa-arrow-up-right-from-square text-indigo-500" />
            <span>{t("Recommended Restock")}</span>
          </div>
          <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {(activeSummary.totalRecommendedQty || 0).toLocaleString()}
            <span className="text-[10px] font-normal text-slate-400 ml-1">{t("units")}</span>
          </div>
        </div>

        {/* Urgent FCs */}
        <div
          className="p-2.5 rounded-lg border flex flex-col justify-between"
          style={{
            background: isDark ? "rgba(239, 68, 68, 0.06)" : "#fef2f2",
            borderColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#fecaca",
          }}
        >
          <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <i className="fa-solid fa-circle-exclamation text-rose-500" />
            <span>{t("Urgent Action")}</span>
          </div>
          <div className="text-base font-bold text-rose-700 dark:text-rose-400 mt-1">
            {activeSummary.urgentCount || 0}
            <span className="text-[10px] font-normal text-rose-500/80 ml-1">{t("warehouses")}</span>
          </div>
        </div>

        {/* Plan Shipment FCs */}
        <div
          className="p-2.5 rounded-lg border flex flex-col justify-between"
          style={{
            background: isDark ? "rgba(245, 158, 11, 0.06)" : "#fffbeb",
            borderColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#fde68a",
          }}
        >
          <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <i className="fa-solid fa-truck-ramp-box text-amber-500" />
            <span>{t("Plan Restock")}</span>
          </div>
          <div className="text-base font-bold text-amber-700 dark:text-amber-400 mt-1">
            {activeSummary.planShipmentCount || 0}
            <span className="text-[10px] font-normal text-amber-500/80 ml-1">{t("warehouses")}</span>
          </div>
        </div>
      </div>

      {/* ── Warehouse Table ── */}
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 dark:border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr
              className="border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
              style={{ background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc" }}
            >
              <th className="py-2.5 px-3 min-w-[170px]">{t("Warehouse / FC")}</th>
              <th className="py-2.5 px-3 text-right min-w-[95px]">
                {t("Stock")}
                <span className="block text-[9px] font-normal lowercase tracking-normal text-slate-400">
                  ({t("ledger")})
                </span>
              </th>
              <th className="py-2.5 px-3 text-right min-w-[95px]">
                {t("In-Transit")}
                <span className="block text-[9px] font-normal lowercase tracking-normal text-slate-400">
                  ({t("between FCs")})
                </span>
              </th>
              <th className="py-2.5 px-3 text-right min-w-[85px]">
                <div className="flex items-center justify-end gap-1">
                  <span>{t("ADS")}</span>
                  <i
                    className="fa-solid fa-circle-info text-[10px] text-slate-400"
                    title={t("Average Daily Sales from past 30 days customer shipments for this FC")}
                  />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center min-w-[80px]">
                <div className="flex items-center justify-center gap-1">
                  <span>{t("DOI")}</span>
                  <i
                    className="fa-solid fa-circle-info text-[10px] text-slate-400"
                    title={t("Days of Inventory = (Stock + In-Transit) / ADS")}
                  />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center min-w-[125px]">
                {t("Status")}
              </th>
              <th className="py-2.5 px-3 text-right min-w-[90px]">
                <div className="flex items-center justify-end gap-1">
                  <span>{t("ROP")}</span>
                  <i
                    className="fa-solid fa-circle-info text-[10px] text-slate-400"
                    title={t("Reorder Point = (Transit Days + Buffer Days) * ADS")}
                  />
                </div>
              </th>
              <th className="py-2.5 px-3 text-right min-w-[110px]">
                <div className="flex items-center justify-end gap-1">
                  <span>{t("Recommended")}</span>
                  <i
                    className="fa-solid fa-circle-info text-[10px] text-slate-400"
                    title={t("Recommended Restock Units")}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredWarehouses.map((wh, idx) => {
              const originalIdx = warehouses.findIndex((item) => item.warehouseId === wh.warehouseId);
              const actualIdx = originalIdx >= 0 ? originalIdx : idx;

              const currentQty =
                wh.currentQty !== undefined && wh.currentQty !== null ? Number(wh.currentQty) : 0;
              const inTransitQty =
                wh.inTransitBetweenWarehouses !== undefined && wh.inTransitBetweenWarehouses !== null
                  ? Number(wh.inTransitBetweenWarehouses)
                  : (wh.inTransit !== undefined && wh.inTransit !== null ? Number(wh.inTransit) : 0);

              const ads = wh.salesPerDay !== undefined && wh.salesPerDay !== null ? Number(wh.salesPerDay) : 0;
              const doi = wh.doi !== undefined && wh.doi !== null ? wh.doi : "∞";
              const rop = wh.reorderPoint !== undefined && wh.reorderPoint !== null ? Number(wh.reorderPoint) : 0;
              const recQty =
                wh.recommendedShipmentQty !== undefined && wh.recommendedShipmentQty !== null
                  ? Number(wh.recommendedShipmentQty)
                  : 0;

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

              const isBelowAlert =
                alertThreshold !== "" && Number(alertThreshold) > 0
                  ? currentQty <= Number(alertThreshold)
                  : currentQty <= effectiveThreshold;

              const hasCustomFCConfig =
                alertThreshold !== "" || coverageDays !== "" || transitDays !== "" || bufferDays !== "";

              return (
                <tr
                  key={wh.warehouseId || idx}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  {/* Warehouse ID & Name & City/State */}
                  <td className="py-2.5 px-3">
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
                          className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                          title={t("Custom FC lead times configured")}
                        />
                      )}
                    </div>
                  </td>

                  {/* Current Qty (Read-Only) */}
                  <td className="py-2.5 px-3 text-right">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 font-semibold border border-slate-200/60 dark:border-slate-700/60">
                      <i className="fa-solid fa-lock text-[8px] text-slate-400" title={t("Read-only from Amazon report")} />
                      <span className={isBelowAlert ? "text-amber-600 dark:text-amber-400 font-bold" : ""}>
                        {currentQty.toLocaleString()}
                      </span>
                    </div>
                  </td>

                  {/* In-Transit Between Warehouses (Read-Only) */}
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-medium text-sky-700 dark:text-sky-300">
                      {inTransitQty > 0 ? inTransitQty.toLocaleString() : "0"}
                    </span>
                  </td>

                  {/* ADS (Sales Per Day) */}
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {ads}
                    </span>
                  </td>

                  {/* DOI (Days of Inventory) */}
                  <td className="py-2.5 px-3 text-center">
                    {doi === "∞" || doi === 999 ? (
                      <span className="text-slate-400">∞</span>
                    ) : (
                      <span
                        className={`font-semibold ${
                          Number(doi) < 15
                            ? "text-rose-600 dark:text-rose-400 font-bold"
                            : Number(doi) < 30
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {doi}
                        <span className="text-[10px] font-normal text-slate-400 ml-0.5">{t("d")}</span>
                      </span>
                    )}
                  </td>

                  {/* Forecast Status Badge */}
                  <td className="py-2.5 px-3 text-center">
                    {renderStatusBadge(wh.inventoryForecastStatus)}
                  </td>

                  {/* Reorder Point (ROP) */}
                  <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                    {rop.toLocaleString()}
                  </td>

                  {/* Recommended Qty */}
                  <td className="py-2.5 px-3 text-right">
                    {recQty > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
                        {recQty.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <i className="fa-solid fa-circle-info text-blue-500 text-xs" />
          <span>
            {t("Fulfillment center stock and velocity are derived automatically from Amazon FC Inventory Ledger reports.")}
          </span>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1.5 self-start sm:self-auto"
          >
            <i className="fa-solid fa-sliders text-xs" />
            <span>{t("Configure Lead Times & Thresholds")}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default WarehousePlanningAccordion;
