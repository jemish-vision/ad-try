import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import { Radio, RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, X, ChevronLeft, ChevronRight, Clock, Layers } from "lucide-react";
import { ApiGetAdBlackoutAlerts, ApiDismissAdBlackoutAlert } from "../../../../api-wrapper/dashboard/ApiDashboard";
import { formatRegionalNumber } from "../../../../utility/regionalNumberFormat";
import { campaignViewUrl } from "./OutOfStockAdsWidget";
import { blackoutReasonText, formatBlackoutHour } from "./adBlackoutText";

const TONE_BADGE = {
  rose: "bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40",
  amber: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
  slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/10",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
};

const CALLOUT_BORDER = {
  rose: "border-l-rose-500",
  amber: "border-l-amber-500",
  slate: "border-l-slate-400",
};

export function useAdBlackoutData({ profileId, adType }) {
  const [statusFilter, setStatusFilter] = useState("ACTIVE"); // "ACTIVE" | "RESOLVED"
  const [page, setPage] = useState(1);
  const [limit] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [dismissingId, setDismissingId] = useState(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      if (!profileId) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(false);
      const res = await ApiGetAdBlackoutAlerts({
        profileId,
        adType,
        status: statusFilter,
        page,
        limit,
        ...(refresh ? { refresh: true } : {}),
      });
      if (seq !== requestSeq.current) return;
      if (res?.isSuccess) setData(res.data);
      else {
        setData(null);
        setError(true);
      }
      setLoading(false);
    },
    [profileId, adType, statusFilter, page, limit]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [profileId, adType, statusFilter]);

  const dismiss = async (alertId) => {
    if (!profileId || !alertId) return;
    setDismissingId(alertId);
    const res = await ApiDismissAdBlackoutAlert({ profileId, alertId });
    setDismissingId(null);
    if (res?.isSuccess) {
      load(false);
    }
  };

  return {
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    limit,
    data,
    loading,
    error,
    dismissingId,
    dismiss,
    refetch: () => load(true),
  };
}

function BlackoutCard({ alert, marketplace, timezone, onDismiss, dismissing, t }) {
  const info = blackoutReasonText(alert, t);
  const number = (v) => formatRegionalNumber(v, marketplace);
  const isResolved = alert.status === "RESOLVED";
  const borderTone = isResolved ? "border-l-emerald-500" : CALLOUT_BORDER[info.tone] || "border-l-amber-500";
  const targetUrl =
    alert.reasonCode === "RULE_PAUSED_ALL_TARGETS"
      ? "/targeting-rule"
      : campaignViewUrl({
          campaignId: alert.campaignId,
          campaignName: alert.campaignName,
          adType: alert.adType,
          campaignStatus: "ENABLED",
        });

  return (
    <div
      data-testid="ad-blackout-alert"
      className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.02] p-3.5 flex flex-col gap-2.5 transition-colors hover:border-slate-300 dark:hover:border-white/20"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {isResolved ? (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase ${TONE_BADGE.emerald}`}>
                ● {t("Resolved")}
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase ${TONE_BADGE[info.tone] || TONE_BADGE.amber}`}>
                ● {t("0 Impr Blackout")}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${TONE_BADGE[info.tone] || TONE_BADGE.amber}`}>
              {info.badge}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[10.5px] font-bold uppercase">
              {alert.adType}
            </span>
          </div>

          <a
            href={targetUrl}
            target={alert.reasonCode === "RULE_PAUSED_ALL_TARGETS" ? undefined : "_blank"}
            rel={alert.reasonCode === "RULE_PAUSED_ALL_TARGETS" ? undefined : "noopener noreferrer"}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-slate-900 dark:text-white hover:text-[#2374F2] truncate max-w-full"
          >
            <span className="truncate">{alert.campaignName || `#${alert.campaignId}`}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </a>

          {alert.entityLevel === "AD_GROUP" && alert.adGroupName && (
            <div className="flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              <Layers className="w-3 h-3 shrink-0" />
              <span className="truncate">{t("Ad Group: {{name}}", { name: alert.adGroupName })}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(alert._id)}
          disabled={dismissing}
          title={t("Dismiss alert")}
          aria-label={t("Dismiss alert")}
          className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11.5px]">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] text-slate-600 dark:text-slate-300">
          <Clock className="w-3 h-3 text-slate-400" />
          {isResolved
            ? t("Recovered {{time}}", {
                time: alert.resolvedAt
                  ? (timezone ? moment(alert.resolvedAt).tz(timezone) : moment(alert.resolvedAt)).format("hh:mm A")
                  : "",
              })
            : t("0 impr since {{hour}}", { hour: formatBlackoutHour(alert.firstBlackoutHour) })}
        </span>
        {alert.avgHourlyImpressions > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] text-slate-500 dark:text-slate-400">
            {t("Normally ~{{count}} impr/hr", { count: number(alert.avgHourlyImpressions) })}
          </span>
        )}
        {alert.affectedAsins?.slice(0, 2).map((asin) => (
          <span key={asin} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 font-mono text-[10.5px]">
            {asin}
          </span>
        ))}
      </div>

      <div className={`border-l-2 ${borderTone} rounded-r-lg bg-slate-50/90 dark:bg-white/[0.03] px-3 py-2 text-[12px]`}>
        <p className="font-semibold text-slate-800 dark:text-slate-100">{info.headline}</p>
        <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">{info.explanation}</p>
      </div>
    </div>
  );
}

/**
 * Executive Dashboard: real-time hourly zero-impression blackout alerts detected via Amazon Marketing Stream.
 */
export default function AdBlackoutWidget({ profileId, adType = "All", marketplace = "IN" }) {
  const { t } = useTranslation();
  const { statusFilter, setStatusFilter, page, setPage, limit, data, loading, error, dismissingId, dismiss, refetch } = useAdBlackoutData({
    profileId,
    adType,
  });

  const alerts = data?.alerts || [];
  const summary = data?.summary || { activeCount: 0, resolvedTodayCount: 0 };
  const pagination = data?.pagination || { page, limit, totalRecords: alerts.length, totalPages: 1, hasNextPage: false, hasPrevPage: false };

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col max-h-[420px] transition-all border border-slate-100 dark:border-white/5" id="dashboard-ad-blackout">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-start justify-between flex-wrap gap-3 shrink-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">{t("Hourly Ad Blackouts")}</h3>
              {summary.activeCount > 0 && (
                <span className={`px-2.5 py-0.5 rounded-full border text-[12px] font-semibold ${TONE_BADGE.rose}`}>
                  {t("{{count}} Active", { count: summary.activeCount })}
                </span>
              )}
              {summary.resolvedTodayCount > 0 && (
                <span className={`px-2.5 py-0.5 rounded-full border text-[12px] font-semibold ${TONE_BADGE.emerald}`}>
                  {t("{{count}} Resolved Today", { count: summary.resolvedTodayCount })}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-slate-400 mt-0.5">
              {t("Checked hourly from live Marketing Stream data. Flags active ads that suddenly drop to 0 impressions.")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-slate-50 dark:bg-white/[0.03]" role="group" aria-label={t("Blackout status filter")}>
            {[
              { key: "ACTIVE", label: t("Active") },
              { key: "RESOLVED", label: t("Resolved Today") },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                aria-pressed={statusFilter === tab.key}
                className={`h-6 px-2.5 rounded-md text-[12px] font-semibold transition-colors ${
                  statusFilter === tab.key
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-sky-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title={t("Check now")}
            aria-label={t("Check now")}
            className="h-7 w-7 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-white dark:bg-slate-900"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 dash-custom-scrollbar">
        {loading && !data ? (
          <div role="status" aria-label={t("Loading...")} className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-200/80 dark:border-white/[0.08] p-3.5 space-y-2">
                <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-4 w-56 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-10 w-full bg-slate-100 dark:bg-slate-800/60 rounded" />
              </div>
            ))}
          </div>
        ) : error && !data ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 py-6">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
            <p className="text-[13px] text-slate-600 dark:text-slate-300">{t("Couldn't load hourly ad blackout alerts.")}</p>
            <button type="button" onClick={refetch} className="h-7 px-3 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
              {t("Retry")}
            </button>
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center justify-center gap-2.5 py-5 text-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
              {statusFilter === "RESOLVED"
                ? t("No blackout alerts resolved today.")
                : t("All monitored active ads are receiving impressions normally.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
            {alerts.map((alert) => (
              <BlackoutCard
                key={alert._id}
                alert={alert}
                marketplace={marketplace}
                timezone={data?.timezone}
                onDismiss={dismiss}
                dismissing={dismissingId === alert._id}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {pagination.totalRecords > 0 && (
        <div className="px-5 py-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between flex-wrap gap-2 text-[12px] shrink-0">
          <span className="text-slate-400">
            {t("Showing {{start}}–{{end}} of {{total}} alerts", {
              start: (pagination.page - 1) * pagination.limit + 1,
              end: Math.min(pagination.page * pagination.limit, pagination.totalRecords),
              total: pagination.totalRecords,
            })}
          </span>
          {pagination.totalPages > 1 && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrevPage || loading}
                aria-label={t("Previous page")}
                className="h-7 w-7 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-medium text-slate-600 dark:text-slate-300">
                {t("Page {{page}} of {{totalPages}}", { page: pagination.page, totalPages: pagination.totalPages })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNextPage || loading}
                aria-label={t("Next page")}
                className="h-7 w-7 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
