import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { ApiGetAiCreditSummary, ApiGetAiCreditUsage, ApiGetAiCreditTransactions, ApiGetAiCreditPayments } from "../../../api-wrapper/ApiAiCredits";
import { AI_CREDITS_CHANGED, notifyAiCreditsChanged } from "../../../helper/aiCredits/aiCredits";
import AiCreditDetail from "./AiCreditDetail";
import BuyCreditsSection from "./BuyCreditsSection";
import PurchaseResultBanner, { usePurchaseResult } from "./PurchaseResultBanner";

/** User panel: the organization's AI credit wallet, this month's usage and history. */
export default function AiCreditsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const res = await ApiGetAiCreditSummary();
    if (res?.isSuccess) setSummary(res.data);
    else setError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const onChange = () => {
      load();
      setReloadKey((k) => k + 1);
    };
    window.addEventListener(AI_CREDITS_CHANGED, onChange);
    return () => window.removeEventListener(AI_CREDITS_CHANGED, onChange);
  }, [load]);

  const refresh = () => {
    load();
    setReloadKey((k) => k + 1);
  };

  // Back from Stripe Checkout (?purchase=success|cancelled): confirm the payment, then clean the URL
  const purchaseResult = usePurchaseResult(location.search, {
    onDone: (result) => {
      if (result?.status === "PAID") notifyAiCreditsChanged();
      setReloadKey((k) => k + 1);
      navigate(location.pathname, { replace: true });
    },
  });

  return (
    <div className="p-4 sm:p-6 pb-16 sm:pb-16 space-y-5" id="ai-credits-page">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight m-0 flex items-center gap-2 flex-wrap">
              {t("AI Credits")}
              {summary?.isDemo && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40">{t("Demo data")}</span>}
            </h1>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5 mb-0">
              {t("All AI features (AI Assistant, Optimize with AI, A+ Content, AI listing generation and Campaign AI Analysis) use credits from one monthly allowance shared by your whole organization.")}
            </p>
          </div>
        </div>
        <button
          type="button"
          id="ai-credits-refresh"
          onClick={refresh}
          disabled={loading}
          title={t("Refresh")}
          className="h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-white dark:bg-slate-900"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#2374F2]" : ""}`} />
        </button>
      </div>

      {loading && !summary ? (
        <div role="status" aria-label={t("Loading...")} className="space-y-5">
          {[140, 260, 320].map((h) => (
            <div key={h} className="animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04]" style={{ height: h }} />
          ))}
        </div>
      ) : error && !summary ? (
        <div className="dg-root rounded-2xl border border-slate-100 dark:border-white/5 p-10 flex flex-col items-center gap-2 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-[13px] text-slate-600 dark:text-slate-300 m-0">{t("Couldn't load your AI credits.")}</p>
          <button type="button" onClick={refresh} className="h-8 px-3 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
            {t("Retry")}
          </button>
        </div>
      ) : !summary ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400">{t("Select an organization to see its AI credits.")}</p>
      ) : (
        <>
          <PurchaseResultBanner result={purchaseResult} />
          <AiCreditDetail
            summary={summary}
            loadUsage={ApiGetAiCreditUsage}
            loadTransactions={ApiGetAiCreditTransactions}
            loadPayments={summary.canViewPayments ? ApiGetAiCreditPayments : undefined}
            reloadKey={reloadKey}
            afterBalance={<BuyCreditsSection />}
          />
        </>
      )}
    </div>
  );
}
