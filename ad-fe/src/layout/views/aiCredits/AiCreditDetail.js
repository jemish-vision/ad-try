import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { BarChart3, History, PieChart, Info } from "lucide-react";
import { formatCredits, formatTokens } from "../../../helper/aiCredits/aiCredits";
import {
  Card,
  CardHeader,
  StatTile,
  CreditMeter,
  DailyUsageChart,
  FeatureBreakdown,
  UsageTable,
  TransactionsTable,
  Pager,
  Select,
  FEATURE_OPTIONS,
  USAGE_STATUS_OPTIONS,
  TX_TYPE_OPTIONS,
  PaymentsTable,
  PAYMENT_STATUS_OPTIONS,
} from "./aiCreditComponents";

const PER_PAGE = 10;
const SOURCE_LABEL = { PLAN: "From your plan", OVERRIDE: "Custom allowance", DEFAULT: "Standard allowance" };

/** Paginated + filtered list loader. */
function usePagedList(load, deps) {
  const [filters, setFilters] = useState({});
  const [pageNo, setPageNo] = useState(1);
  const [res, setRes] = useState({ data: [], totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  const fetchList = useCallback(async () => {
    setLoading(true);
    const r = await load({ ...filters, pageNo, perPage: PER_PAGE });
    setRes(r?.isSuccess ? r : { data: [], totalRecords: 0 });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pageNo, ...deps]);
  useEffect(() => {
    fetchList();
  }, [fetchList]);
  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
    setPageNo(1);
  };
  return { ...res, loading, pageNo, setPageNo, filters, setFilter, reload: fetchList };
}

/**
 * Everything about one organization's AI credits: balance, this month's usage, and history.
 * Used on the user's AI Credits page and in Super Admin's organization view.
 */
const NO_PAYMENTS = async () => ({ isSuccess: true, data: [], totalRecords: 0 });

/**
 * loadPayments: pass to show the credit purchases tab (organization owner, Super Admin).
 */
export default function AiCreditDetail({ summary, loadUsage, loadTransactions, loadPayments, afterBalance = null, reloadKey = 0, compact = false }) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState("requests");
  const usage = usePagedList(loadUsage, [reloadKey]);
  const txs = usePagedList(loadTransactions, [reloadKey]);
  const pays = usePagedList(loadPayments || NO_PAYMENTS, [reloadKey, Boolean(loadPayments)]);

  if (!summary?.wallet) return null;
  const { wallet } = summary;
  const L = i18n.language;

  return (
    <div className="space-y-5">
      {summary.enforcementEnabled === false && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200/70 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 text-[12.5px] text-blue-800 dark:text-blue-200">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {t("Credit limits are paused right now: AI features work without using credits. Usage is still recorded below.")}
        </div>
      )}

      {/* Balance + KPIs */}
      <Card id="ai-credits-balance">
        <div className={`grid gap-5 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]"}`}>
          <CreditMeter wallet={wallet} enforcementEnabled={summary.enforcementEnabled !== false} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" id="ai-credits-kpis">
            <StatTile label={t("Used this month")} value={formatCredits(wallet.used, L)} sub={t("{{n}} AI requests", { n: summary.requestsThisPeriod || 0 })} />
            <StatTile label={t("Monthly allowance")} value={formatCredits(wallet.monthlyLimit, L)} sub={t(SOURCE_LABEL[wallet.limitSource] || "")} />
            <StatTile label={t("Next reset")} value={moment(wallet.nextResetAt).format("DD MMM")} sub={t("Unused monthly credits don't carry over; purchased credits do")} />
            <StatTile
              label={t("Tokens this month")}
              value={formatTokens(summary.tokensThisPeriod?.total, L)}
              sub={t("{{input}} in · {{output}} out", { input: formatTokens(summary.tokensThisPeriod?.input, L), output: formatTokens(summary.tokensThisPeriod?.output, L) })}
            />
          </div>
        </div>
        {summary.rates && (
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-4 mb-0">
            {t("How credits are counted: 1,000 input tokens = {{input}} credits, 1,000 output tokens = {{output}} credits (some AI models have their own rates). Failed requests and cached results are free.", {
              input: formatCredits(summary.rates.inputCreditsPer1K, L),
              output: formatCredits(summary.rates.outputCreditsPer1K, L),
            })}
            {summary.rates.creditsPerImage !== undefined && " " + t("Each AI-generated image (A+ Content) = {{n}} credits.", { n: formatCredits(summary.rates.creditsPerImage, L) })}
          </p>
        )}
      </Card>

      {afterBalance}

      {/* This month */}
      <div className={`grid gap-5 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
        <Card id="ai-credits-daily" className={compact ? "" : "lg:col-span-2"}>
          <CardHeader icon={<BarChart3 className="w-3.5 h-3.5" />} title={t("Credits used per day")} subtitle={t("{{from}} – today", { from: moment(wallet.periodStart).format("DD MMM YYYY") })} />
          <DailyUsageChart byDay={summary.byDay} periodStart={wallet.periodStart} periodEnd={wallet.nextResetAt} />
        </Card>
        <Card id="ai-credits-by-feature">
          <CardHeader icon={<PieChart className="w-3.5 h-3.5" />} title={t("By feature")} subtitle={t("Credits used this month")} />
          <FeatureBreakdown byFeature={summary.byFeature} />
        </Card>
      </div>

      {/* History */}
      <Card id="ai-credits-history">
        <CardHeader
          icon={<History className="w-3.5 h-3.5" />}
          title={t("History")}
          subtitle={tab === "requests" ? t("Every AI request, its tokens and what it cost.") : tab === "payments" ? t("Credit packages bought online, with their payment status.") : t("Monthly allowances, purchases, usage, month closes and adjustments.")}
          right={
            <>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-slate-50 dark:bg-white/[0.03]" role="tablist">
                {[
                  ["requests", t("AI requests")],
                  ["transactions", t("Credit history")],
                  ...(loadPayments ? [["payments", t("Payments")]] : []),
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    id={`ai-credits-tab-${k}`}
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`h-7 px-3 rounded-md text-[12px] font-semibold transition-colors ${tab === k ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-sky-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "requests" ? (
                <>
                  <Select id="ai-credits-feature-filter" label={t("Feature")} value={usage.filters.feature || ""} onChange={(v) => usage.setFilter("feature", v)} options={FEATURE_OPTIONS(t)} />
                  <Select id="ai-credits-status-filter" label={t("Status")} value={usage.filters.status || ""} onChange={(v) => usage.setFilter("status", v)} options={USAGE_STATUS_OPTIONS(t)} />
                </>
              ) : tab === "payments" ? (
                <Select id="ai-credits-payment-filter" label={t("Status")} value={pays.filters.status || ""} onChange={(v) => pays.setFilter("status", v)} options={PAYMENT_STATUS_OPTIONS(t)} />
              ) : (
                <Select id="ai-credits-type-filter" label={t("Type")} value={txs.filters.type || ""} onChange={(v) => txs.setFilter("type", v)} options={TX_TYPE_OPTIONS(t)} />
              )}
            </>
          }
        />
        {tab === "requests" ? (
          <>
            <UsageTable rows={usage.data} loading={usage.loading} />
            <Pager pageNo={usage.pageNo} perPage={PER_PAGE} total={usage.totalRecords} onPage={usage.setPageNo} />
          </>
        ) : tab === "payments" ? (
          <>
            <PaymentsTable rows={pays.data} loading={pays.loading} />
            <Pager pageNo={pays.pageNo} perPage={PER_PAGE} total={pays.totalRecords} onPage={pays.setPageNo} />
          </>
        ) : (
          <>
            <TransactionsTable rows={txs.data} loading={txs.loading} />
            <Pager pageNo={txs.pageNo} perPage={PER_PAGE} total={txs.totalRecords} onPage={txs.setPageNo} />
          </>
        )}
      </Card>
    </div>
  );
}
