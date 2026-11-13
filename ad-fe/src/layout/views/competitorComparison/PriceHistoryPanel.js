// Competitor Price History (Enterprise plans) — daily snapshots of price, Buy Box and rank.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ReactApexChart from "react-apexcharts";

import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import Toast from "../../../common/helper/toast/Toast";
import { ApiGetHistorySettings, ApiGetPriceHistory, ApiUpdateHistorySettings } from "../../../api-wrapper/productList/ApiProductList";

const P = {
  primary: "#1A9FD4",
  primaryDeep: "#2374F2",
  success: "#16A34A",
  danger: "#E74C3C",
  warning: "#F59E0B",
  violet: "#8B5CF6",
  neutral200: "#E2E8F0",
  neutral400: "#94A3B8",
  neutral600: "#475569",
  neutral800: "#1E293B",
};
const RIVAL_COLORS = ["#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B"];
const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

function Tile({ title, value, sub, icon, accent, isDark }) {
  return (
    <div
      style={{
        background: isDark ? "var(--glass-bg)" : "rgba(255,255,255,0.65)",
        border: isDark ? "1px solid var(--glass-border-color)" : "1px solid rgba(2,70,139,0.12)",
        borderRadius: 16,
        padding: "14px 16px",
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "var(--text-secondary)" : P.neutral600 }}>{title}</span>
        <span className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 9, background: `${accent}1A`, color: accent }}>
          <i className={`fa-solid ${icon}`} style={{ fontSize: 13 }} />
        </span>
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: isDark ? "var(--text-primary)" : P.neutral800, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, marginTop: 2, color: isDark ? "var(--text-secondary)" : P.neutral400 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function PriceHistoryPanel({ asin, profileId, isDark, isMobile, currency, rivalAsin, Section }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const canView = Boolean(PermissionCheck(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.VIEW_ONLY));
  const canEdit = Boolean(PermissionCheck(SYSTEM_PAGES.COMPETITOR_COMPARISON, PAGE_ACTIONS.UPDATE));

  const textPrimary = isDark ? "var(--text-primary)" : P.neutral800;
  const textSecondary = isDark ? "var(--text-secondary)" : P.neutral600;
  const textMuted = isDark ? "var(--text-secondary)" : P.neutral400;

  const [settings, setSettings] = useState(null);
  const [days, setDays] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingRetention, setPendingRetention] = useState(null);
  const [saving, setSaving] = useState(false);

  const fmt = (v) => (isNum(v) ? `${currency}${Number(v).toFixed(2)}` : "—");

  // Retention setting (also the max range that can be shown)
  useEffect(() => {
    if (!canView) return;
    ApiGetHistorySettings().then((res) => {
      if (res?.isSuccess) {
        setSettings(res.data);
        setDays((d) => d ?? res.data.retentionDays);
      } else setError(res?.message || t("Unable to load history settings"));
    });
  }, [canView, t]);

  const load = useCallback(async () => {
    if (!canView || !asin || !profileId || !days) return;
    setLoading(true);
    setError(null);
    const res = await ApiGetPriceHistory({ asin, profileId, days, rivalAsin });
    setLoading(false);
    if (res?.isSuccess) setData(res.data);
    else {
      setData(null);
      setError(res?.message || t("Unable to load price history"));
    }
  }, [canView, asin, profileId, days, rivalAsin, t]);

  useEffect(() => {
    load();
  }, [load]);

  const saveRetention = async () => {
    setSaving(true);
    const res = await ApiUpdateHistorySettings({ retentionDays: pendingRetention });
    setSaving(false);
    if (res?.isSuccess) {
      Toast.success(t("History retention updated"));
      setSettings((s) => ({ ...s, retentionDays: res.data.retentionDays }));
      setDays((d) => Math.min(d || res.data.retentionDays, res.data.retentionDays));
      setSettingsOpen(false);
      load();
    } else {
      Toast.error(res?.message || t("Unable to update history retention"));
    }
  };

  /* ── Chart building ── */

  const baseOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "Inter, sans-serif", foreColor: isDark ? "#94A3B8" : "#64748B", background: "transparent", animations: { enabled: false } },
      theme: { mode: isDark ? "dark" : "light" },
      grid: { borderColor: isDark ? "rgba(255,255,255,0.06)" : "#EEF2F7", strokeDashArray: 4 },
      stroke: { curve: "straight", width: 2.5 },
      markers: { size: 3, strokeWidth: 0 },
      legend: { position: "top", horizontalAlign: "left", fontSize: "12px", markers: { radius: 12 } },
      tooltip: { theme: isDark ? "dark" : "light", x: { show: true } },
      dataLabels: { enabled: false },
      xaxis: {
        type: "category",
        tickAmount: 8,
        labels: {
          rotate: 0,
          hideOverlappingLabels: true,
          style: { fontSize: "11px" },
          // "2026-10-14" → "14 Oct" in the user's language
          formatter: (v) => {
            if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
            const [y, m, d] = v.split("-").map(Number);
            return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(i18n.language || "en", { day: "numeric", month: "short", timeZone: "UTC" });
          },
        },
        tooltip: { enabled: false },
      },
    }),
    [isDark, i18n.language]
  );

  const own = data?.own || [];
  const dates = own.map((s) => s.date);

  const priceChart = useMemo(() => {
    const series = [
      { name: t("Our Price"), data: own.map((s) => s.ourPrice ?? null) },
      { name: t("Buy Box price"), data: own.map((s) => s.buyBoxPrice ?? null) },
      { name: t("Lowest FBA"), data: own.map((s) => s.lowestFbaPrice ?? null) },
      { name: t("Lowest FBM"), data: own.map((s) => s.lowestFbmPrice ?? null) },
    ];
    return {
      series,
      options: {
        ...baseOptions,
        colors: [P.primaryDeep, P.success, P.warning, P.violet],
        stroke: { ...baseOptions.stroke, width: [3, 2.5, 2, 2], dashArray: [0, 0, 5, 5] },
        xaxis: { ...baseOptions.xaxis, categories: dates },
        yaxis: { labels: { formatter: (v) => (isNum(v) ? `${currency}${Number(v).toFixed(0)}` : "") } },
        tooltip: { ...baseOptions.tooltip, y: { formatter: (v) => fmt(v) } },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, baseOptions, currency, t]);

  const rivalChart = useMemo(() => {
    const rivals = data?.rivals || [];
    const series = [
      { name: t("Our Price"), data: dates.map((d) => own.find((s) => s.date === d)?.ourPrice ?? null) },
      ...rivals.map((r) => ({ name: r.brand ? `${r.brand} · ${r.asin}` : r.asin, data: dates.map((d) => r.series.find((s) => s.date === d)?.price ?? null) })),
    ];
    return {
      series,
      options: {
        ...baseOptions,
        colors: [P.primaryDeep, ...RIVAL_COLORS],
        stroke: { ...baseOptions.stroke, width: [3, ...rivals.map(() => 2)] },
        xaxis: { ...baseOptions.xaxis, categories: dates },
        yaxis: { labels: { formatter: (v) => (isNum(v) ? `${currency}${Number(v).toFixed(0)}` : "") } },
        tooltip: { ...baseOptions.tooltip, y: { formatter: (v) => fmt(v) } },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, own, baseOptions, currency, t]);

  const rankChart = useMemo(() => {
    const rivals = data?.rivals || [];
    const series = [
      { name: t("Our Rank"), data: own.map((s) => s.ranks?.[0]?.rank ?? null) },
      ...rivals.slice(0, 3).map((r) => ({ name: r.brand ? `${r.brand} · ${r.asin}` : r.asin, data: dates.map((d) => r.series.find((s) => s.date === d)?.bsr ?? null) })),
    ];
    return {
      series,
      options: {
        ...baseOptions,
        colors: [P.primaryDeep, ...RIVAL_COLORS],
        xaxis: { ...baseOptions.xaxis, categories: dates },
        // Lower rank is better → reverse axis so "up" means improving
        yaxis: { reversed: true, labels: { formatter: (v) => (isNum(v) ? `#${Math.round(v).toLocaleString()}` : "") } },
        tooltip: { ...baseOptions.tooltip, y: { formatter: (v) => (isNum(v) ? `#${Math.round(v).toLocaleString()}` : "—") } },
      },
    };
  }, [data, own, dates, baseOptions, t]);

  /* ── Locked (not on plan) ── */

  if (!canView) {
    return (
      <div id="cc-history-locked" className="glass-card flex flex-col items-center justify-center text-center mt-4" style={{ padding: "48px 24px" }}>
        <span className="flex items-center justify-center mb-3" style={{ width: 56, height: 56, borderRadius: 16, background: `${P.warning}1A`, color: P.warning }}>
          <i className="fa-solid fa-lock" style={{ fontSize: 22 }} />
        </span>
        <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary }}>{t("Price & Buy Box history is available on the Enterprise plan")}</div>
        <div style={{ fontSize: 13, color: textSecondary, maxWidth: 560, marginTop: 6 }}>
          {t("Track your price, the Buy Box price and owner, Best Seller Rank and rival brand prices day by day, and see how often you hold the Buy Box.")}
        </div>
        <Button
          type="button"
          className="mt-4 h-[40px] px-5 font-semibold text-[13px] text-white border-0"
          style={{ background: `linear-gradient(135deg, ${P.primary}, ${P.primaryDeep})` }}
          onClick={() => navigate("/update-subscription")}
        >
          <i className="fa-solid fa-crown mr-2" style={{ fontSize: 12 }} />
          {t("View plans")}
        </Button>
      </div>
    );
  }

  const retention = settings?.retentionDays;
  const rangeOptions = (settings?.options || [7, 14, 30, 60]).filter((d) => !retention || d <= retention);
  const summary = data?.summary;
  const shareColor = !isNum(summary?.buyBoxShare) ? P.neutral400 : summary.buyBoxShare >= 70 ? P.success : summary.buyBoxShare >= 30 ? P.warning : P.danger;

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <div
        id="cc-history-range"
        className="inline-flex p-1 gap-1"
        style={{ borderRadius: 10, background: isDark ? "rgba(255,255,255,0.04)" : "#F1F5F9", border: `1px solid ${isDark ? "var(--glass-border-color)" : P.neutral200}` }}
      >
        {rangeOptions.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              color: days === d ? "#fff" : textSecondary,
              background: days === d ? `linear-gradient(135deg, ${P.primary}, ${P.primaryDeep})` : "transparent",
            }}
          >
            {t("{{num}} days", { num: d })}
          </button>
        ))}
      </div>
      {canEdit && (
        <button
          type="button"
          id="cc-history-settings"
          className="glass-dropdown-btn cc-btn-secondary"
          style={{ minWidth: 0, height: 36 }}
          onClick={() => {
            setPendingRetention(retention);
            setSettingsOpen(true);
          }}
          title={t("History settings")}
        >
          <i className="fa-solid fa-gear" style={{ fontSize: 13 }} />
          <span>{t("Keep {{num}} days", { num: retention ?? "…" })}</span>
        </button>
      )}
    </div>
  );

  const reducing = isNum(pendingRetention) && isNum(retention) && pendingRetention < retention;

  return (
    <>
      <Section id="cc-history" isDark={isDark} isMobile={isMobile} title={t("Price & Buy Box History")} right={header}>
        <div style={{ padding: isMobile ? "4px 12px 16px" : "4px 24px 24px" }}>
          {error && (
            <div className="flex items-center gap-2" style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${P.danger}40`, background: `${P.danger}14`, color: P.danger, fontSize: 13, fontWeight: 600 }}>
              <i className="fa-solid fa-triangle-exclamation" /> {error}
            </div>
          )}

          {loading && !data && (
            <div className="space-y-3">
              <Skeleton className="h-[96px] w-full rounded-2xl" />
              <Skeleton className="h-[300px] w-full rounded-2xl" />
            </div>
          )}

          {!loading && data && own.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center" style={{ padding: "36px 16px" }}>
              <i className="fa-solid fa-clock-rotate-left mb-3" style={{ fontSize: 26, color: P.primary }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>
                {data.historyStartDate ? t("No snapshots for this product in the selected range yet") : t("History is being collected")}
              </div>
              <div style={{ fontSize: 12.5, color: textSecondary, maxWidth: 520, marginTop: 4 }}>
                {data.historyStartDate
                  ? t("History for this profile starts on {{date}}. A snapshot is taken once a day.", { date: data.historyStartDate })
                  : t("The first daily snapshot is taken tomorrow morning. Charts appear after a few days of data.")}
              </div>
            </div>
          )}

          {data && own.length > 0 && (
            <>
              {/* Summary */}
              <div id="cc-history-summary" className="grid mb-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 150 : 190}px, 1fr))`, gap: isMobile ? 10 : 14 }}>
                <Tile
                  isDark={isDark}
                  title={t("Buy Box share")}
                  value={isNum(summary?.buyBoxShare) ? `${summary.buyBoxShare}%` : "—"}
                  sub={t("{{held}} of {{total}} days", { held: summary?.buyBoxDaysHeld ?? 0, total: summary?.buyBoxDaysKnown ?? 0 })}
                  icon="fa-crown"
                  accent={shareColor}
                />
                <Tile isDark={isDark} title={t("Average price")} value={fmt(summary?.ourPrice?.avg)} sub={`${t("Min")} ${fmt(summary?.ourPrice?.min)} · ${t("Max")} ${fmt(summary?.ourPrice?.max)}`} icon="fa-tag" accent={P.primary} />
                <Tile isDark={isDark} title={t("Average Buy Box price")} value={fmt(summary?.buyBoxPrice?.avg)} sub={`${t("Min")} ${fmt(summary?.buyBoxPrice?.min)} · ${t("Max")} ${fmt(summary?.buyBoxPrice?.max)}`} icon="fa-scale-balanced" accent={P.success} />
                <Tile
                  isDark={isDark}
                  title={t("Rank change")}
                  value={isNum(summary?.rank?.change) ? (summary.rank.change <= 0 ? `▲ ${Math.abs(summary.rank.change).toLocaleString()}` : `▼ ${summary.rank.change.toLocaleString()}`) : "—"}
                  sub={isNum(summary?.rank?.latest) ? `#${Number(summary.rank.latest).toLocaleString()}${summary.rank.category ? ` · ${summary.rank.category}` : ""}` : t("No rank data")}
                  icon="fa-ranking-star"
                  accent={isNum(summary?.rank?.change) ? (summary.rank.change <= 0 ? P.success : P.danger) : P.neutral400}
                />
              </div>

              {/* Buy Box ownership strip */}
              <div id="cc-history-buybox" className="mb-4">
                <div style={{ fontSize: 12, fontWeight: 700, color: textSecondary, marginBottom: 6 }}>{t("Buy Box owner by day")}</div>
                <div className="flex flex-wrap gap-[3px]">
                  {own.map((s) => {
                    const known = s.weHaveBuyBox !== null && s.weHaveBuyBox !== undefined && (s.buyBoxPrice !== null || s.weHaveBuyBox);
                    const color = !known ? (isDark ? "rgba(255,255,255,0.12)" : "#E2E8F0") : s.weHaveBuyBox ? P.success : P.danger;
                    const tip = !known ? `${s.date}: ${t("No Buy Box")}` : s.weHaveBuyBox ? `${s.date}: ${t("You")}` : `${s.date}: ${s.buyBoxSellerId || t("Other seller")} (${fmt(s.buyBoxPrice)})`;
                    return <span key={s.date} title={tip} style={{ width: 14, height: 22, borderRadius: 4, background: color, display: "inline-block" }} />;
                  })}
                </div>
                <div className="flex flex-wrap gap-4 mt-2" style={{ fontSize: 11, color: textMuted }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: P.success, marginRight: 4 }} />{t("You held the Buy Box")}</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: P.danger, marginRight: 4 }} />{t("Another seller")}</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: isDark ? "rgba(255,255,255,0.12)" : "#E2E8F0", marginRight: 4 }} />{t("No Buy Box")}</span>
                </div>
                {summary?.lostEvents?.length > 0 && (
                  <div className="mt-2" style={{ fontSize: 12, color: textSecondary }}>
                    {summary.lostEvents.slice(-3).reverse().map((e) => (
                      <div key={e.date}>
                        <i className="fa-solid fa-circle-xmark mr-1" style={{ color: P.danger, fontSize: 11 }} />
                        {t("Lost the Buy Box on {{date}} to {{seller}} at {{price}}", { date: e.date, seller: e.to || t("another seller"), price: fmt(e.buyBoxPrice) })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Price & Buy Box */}
              <div id="cc-history-price" className="mb-2">
                <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>{t("Price vs Buy Box")}</div>
                <ReactApexChart type="line" height={300} series={priceChart.series} options={priceChart.options} />
              </div>

              <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
                <div id="cc-history-rivals">
                  <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>{t("Rival brand prices")}</div>
                  {(data.rivals || []).length ? (
                    <ReactApexChart type="line" height={280} series={rivalChart.series} options={rivalChart.options} />
                  ) : (
                    <div style={{ fontSize: 12.5, color: textMuted, padding: "24px 0" }}>{t("No rival brand history yet for this product.")}</div>
                  )}
                </div>
                <div id="cc-history-rank">
                  <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>{t("Best Seller Rank trend")}</div>
                  <ReactApexChart type="line" height={280} series={rankChart.series} options={rankChart.options} />
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: textMuted, marginTop: 10 }}>
                {t("One snapshot per day, taken each morning in the profile's timezone. Data older than {{num}} days is deleted automatically.", { num: retention })}
              </div>
            </>
          )}
        </div>
      </Section>

      {/* Retention settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-[440px] bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle>{t("History settings")}</DialogTitle>
            <DialogDescription>{t("Choose how many days of daily price history to keep for your organization.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{t("Keep history for")}</label>
            <Select value={pendingRetention ? String(pendingRetention) : undefined} onValueChange={(v) => setPendingRetention(Number(v))}>
              <SelectTrigger id="cc-history-retention-select" className="h-[40px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(settings?.options || [7, 14, 30, 60]).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t("{{num}} days", { num: d })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reducing && (
              <div className="flex items-start gap-2" style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${P.warning}50`, background: `${P.warning}14`, color: P.warning, fontSize: 12.5, fontWeight: 600 }}>
                <i className="fa-solid fa-triangle-exclamation mt-[2px]" />
                <span>{t("History older than {{num}} days will be deleted and can't be recovered.", { num: pendingRetention })}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={saving}>
              {t("Cancel")}
            </Button>
            <Button
              className="text-white border-0"
              style={{ background: reducing ? P.danger : `linear-gradient(135deg, ${P.primary}, ${P.primaryDeep})` }}
              disabled={saving || !pendingRetention || pendingRetention === retention}
              onClick={saveRetention}
            >
              {saving ? t("Saving...") : reducing ? t("Delete older history and save") : t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
