import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { ShieldAlert, RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, Package } from "lucide-react";
import { ApiGetPerformanceDeclineAlerts } from "../../../../api-wrapper/dashboard/ApiDashboard";
import { formatFullRegionalCurrency, formatRegionalCurrency, formatRegionalNumber } from "../../../../utility/regionalNumberFormat";
import { campaignViewUrl } from "./OutOfStockAdsWidget";
import { SCENARIOS, CHIPS_BY_SCENARIO, METRIC_LABELS, causeText, deltaTone, signedPct } from "./performanceDeclineText";

const WINDOWS = [7, 14, 30];
const DEFAULT_WINDOW = 14;

const TONE = {
  rose: "bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40",
  amber: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
  slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/10",
};
const DELTA_TONE = {
  bad: "text-rose-600 dark:text-rose-400",
  good: "text-emerald-600 dark:text-emerald-400",
  flat: "text-slate-400",
};
const CALLOUT_BORDER = { CRITICAL: "border-l-rose-500", WARNING: "border-l-amber-500" };

/** Fetches alerts for one profile / ad type / window; ignores answers to superseded requests. */
export function usePerformanceDeclineData({ profileId, adType, currencyCode, marketplace }) {
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      if (!profileId) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(false);
      const res = await ApiGetPerformanceDeclineAlerts({ profileId, adType, windowDays, currencyCode, marketplace, ...(refresh ? { refresh: true } : {}) });
      if (seq !== requestSeq.current) return; // a newer request (profile / window change) is in flight
      if (res?.isSuccess) setData(res.data);
      else {
        setData(null);
        setError(true);
      }
      setLoading(false);
    },
    [profileId, adType, windowDays, currencyCode, marketplace],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return { windowDays, setWindowDays, data, loading, error, refetch: () => load(true) };
}

function MetricChip({ metric, m, t, money, number }) {
  if (!m) return null;
  const fmt = (v) => {
    if (v === null || v === undefined) return "—";
    if (metric === "spend" || metric === "sales" || metric === "cpc") return money(v);
    if (metric === "acos" || metric === "cvr" || metric === "ctr") return `${Number(v).toFixed(metric === "ctr" ? 2 : 1).replace(/\.0+$/, "")}%`;
    return number(v);
  };
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-[11.5px] whitespace-nowrap">
      <span className="font-semibold text-slate-500 dark:text-slate-400">{t(METRIC_LABELS[metric])}:</span>
      <span className="text-slate-700 dark:text-slate-200 tabular-nums">
        {fmt(m.prior)} → {fmt(m.current)}
      </span>
      <span className={`font-bold tabular-nums ${DELTA_TONE[deltaTone(metric, m.delta)]}`}>({signedPct(m.delta)})</span>
    </span>
  );
}

function AlertCard({ alert, t, money, moneyShort, number }) {
  const scenario = SCENARIOS[alert.scenarioKey] || SCENARIOS.GENERAL_DECAY;
  const fmt = { money, number };
  const main = causeText(alert.rootCause, t, fmt);
  const supporting = (alert.rootCause?.supporting || []).map((s) => causeText(s, t, fmt).headline);
  const confirmed = alert.rootCause?.confidence === "CONFIRMED";
  const product = alert.productContext;
  const critical = alert.severity === "CRITICAL";

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-3.5" data-testid="perf-decline-alert">
      {/* Severity, pattern, loss */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 h-5 rounded-full border text-[10.5px] font-bold uppercase tracking-wide ${critical ? TONE.rose : TONE.amber}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${critical ? "bg-rose-500" : "bg-amber-500"}`} />
            {critical ? t("Critical") : t("Warning")}
          </span>
          <span className={`px-2 h-5 inline-flex items-center rounded-full border text-[11px] font-semibold ${TONE[scenario.tone]}`}>{t(scenario.label)}</span>
          <span className="px-1.5 h-5 inline-flex items-center rounded text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">{alert.adType}</span>
        </div>
        {alert.estimatedLoss > 0 && (
          <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
            {t("Est. loss")} <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums" title={money(alert.estimatedLoss)}>{moneyShort(alert.estimatedLoss)}</span>
          </span>
        )}
      </div>

      {/* Campaign + product */}
      <div className="flex items-center gap-3 mb-2.5 min-w-0">
        {product &&
          (product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-8 h-8 rounded-md object-contain bg-white border border-slate-200 dark:border-white/10 shrink-0" loading="lazy" />
          ) : (
            <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-slate-400" />
            </div>
          ))}
        <div className="min-w-0">
          <a
            href={campaignViewUrl(alert)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${alert.campaignName} — ${t("Open campaign in a new tab")}`}
            className="group inline-flex items-center gap-1 max-w-full text-[13.5px] font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
          >
            <span className="truncate">{alert.campaignName}</span>
            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-500 shrink-0" />
          </a>
          {product && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 min-w-0">
              <span className="px-1 rounded bg-slate-100 dark:bg-white/[0.06] font-mono text-slate-500 dark:text-slate-300 shrink-0">{product.asin}</span>
              {product.title && <span className="truncate" title={product.title}>{product.title}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Metric chips */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {alert.scenarioKey === "BUDGET_STARVATION" && alert.timeInBudget !== null && alert.timeInBudget !== undefined && (
          <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-[11.5px]">
            <span className="font-semibold text-slate-500 dark:text-slate-400">{t("Time in budget")}:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{alert.timeInBudget}%</span>
          </span>
        )}
        {(CHIPS_BY_SCENARIO[alert.scenarioKey] || CHIPS_BY_SCENARIO.GENERAL_DECAY).map((k) => (
          <MetricChip key={k} metric={k} m={alert.metrics?.[k]} t={t} money={money} number={number} />
        ))}
      </div>

      {/* Root cause */}
      <div className={`rounded-lg border-l-[3px] ${CALLOUT_BORDER[alert.severity] || CALLOUT_BORDER.WARNING} bg-slate-50 dark:bg-white/[0.03] px-3 py-2`}>
        <div className="flex items-start gap-1.5">
          <span
            className={`mt-[1px] shrink-0 px-1.5 rounded text-[10px] font-bold uppercase tracking-wide ${confirmed ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}
            title={confirmed ? t("Shown by the app's own records") : t("A probable cause; nothing on record confirms it")}
          >
            {confirmed ? t("Confirmed") : t("Likely")}
          </span>
          <span className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{main.headline}</span>
        </div>
        {main.explanation && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{main.explanation}</p>}
        {supporting.length > 0 && (
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">
            <span className="font-semibold">{t("Also found")}:</span> {supporting.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Dashboard: campaigns whose performance fell versus the period before, sorted by estimated
 * money lost, each with the most likely cause. Display only — no actions.
 */
export default function PerformanceDeclineWidget({ profileId, adType = "SP", currencyCode, marketplace = "IN" }) {
  const { t } = useTranslation();
  const { windowDays, setWindowDays, data, loading, error, refetch } = usePerformanceDeclineData({ profileId, adType, currencyCode, marketplace });
  // Exact amounts (2 decimals) in chips and explanations; compact for the loss totals.
  const money = (v) => formatFullRegionalCurrency(v, currencyCode, marketplace);
  const moneyShort = (v) => formatRegionalCurrency(v, currencyCode, marketplace);
  const number = (v) => formatRegionalNumber(v, marketplace);

  const alerts = data?.alerts || [];
  const summary = data?.summary || { totalDeclines: 0, criticalCount: 0, warningCount: 0, totalEstimatedLoss: 0 };
  const ew = data?.evaluationWindow;
  const range = (r) => (r ? `${moment(r.start).format("DD MMM")} – ${moment(r.end).format("DD MMM")}` : "");

  return (
    <div className="dg-root rounded-2xl overflow-hidden flex flex-col h-[420px] max-h-[420px] transition-all border border-slate-100 dark:border-white/5" id="dashboard-performance-decline">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 flex items-start justify-between flex-wrap gap-3 shrink-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-800/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">{t("Performance Decline & Root Cause Triage")}</h3>
              {summary.criticalCount > 0 && <span className={`px-2 py-0.5 rounded-full border text-[12px] font-semibold ${TONE.rose}`}>{t("{{count}} Critical", { count: summary.criticalCount })}</span>}
              {summary.warningCount > 0 && <span className={`px-2 py-0.5 rounded-full border text-[12px] font-semibold ${TONE.amber}`}>{t("{{count}} Warnings", { count: summary.warningCount })}</span>}
            </div>
            {ew && (
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                {t("Comparing {{current}} with {{prior}}. The last 2 days are left out while Amazon finishes counting sales.", { current: range(ew.current), prior: range(ew.prior) })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-slate-50 dark:bg-white/[0.03]" role="group" aria-label={t("Comparison window")}>
            {WINDOWS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                aria-pressed={windowDays === d}
                className={`h-6 px-2.5 rounded-md text-[12px] font-semibold transition-colors ${windowDays === d ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-sky-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"}`}
              >
                {t("{{days}}D", { days: d })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            title={t("Refresh")}
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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-200/80 dark:border-white/[0.08] p-3.5 space-y-2.5">
                <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-4 w-64 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-6 w-full bg-slate-100 dark:bg-slate-800/60 rounded" />
                <div className="h-10 w-full bg-slate-100 dark:bg-slate-800/60 rounded" />
              </div>
            ))}
          </div>
        ) : error && !data ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-8">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-[13px] text-slate-600 dark:text-slate-300">{t("Couldn't load performance declines.")}</p>
            <button type="button" onClick={refetch} className="h-7 px-3 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
              {t("Retry")}
            </button>
          </div>
        ) : alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 py-8">
            <CheckCircle2 className="w-9 h-9 text-emerald-500" />
            <p className="text-[13.5px] font-semibold text-slate-700 dark:text-slate-200">{t("All campaigns are within their normal range.")}</p>
            <p className="text-[12px] text-slate-400">{t("No unusual performance declines in the last {{days}} days.", { days: windowDays })}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-start">
            {alerts.map((a) => (
              <AlertCard key={`${a.adType}-${a.campaignId}`} alert={a} t={t} money={money} moneyShort={moneyShort} number={number} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {alerts.length > 0 && (
        <div className="px-5 py-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11.5px] text-slate-400 shrink-0">
          <span>{t("Showing the top {{shown}} of {{total}} declining campaigns", { shown: alerts.length, total: summary.totalDeclines })}</span>
          <span>
            {t("Total est. loss")} <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums" title={money(summary.totalEstimatedLoss)}>{moneyShort(summary.totalEstimatedLoss)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
