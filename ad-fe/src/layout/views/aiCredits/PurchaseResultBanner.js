import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, XCircle, Loader2, X } from "lucide-react";
import { ApiVerifyAiCreditPurchase, ApiCancelAiCreditPurchase } from "../../../api-wrapper/ApiAiCredits";
import { formatCredits } from "../../../helper/aiCredits/aiCredits";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Handles the return from Stripe Checkout:
 *   ?purchase=success&session_id=…  → confirm the payment (re-checks a few times while it's processing)
 *   ?purchase=cancelled&payment_id=… → close the checkout so it can't be paid later
 * Credits are added by the server (webhook or this confirmation, whichever comes first, only once).
 */
export function usePurchaseResult(search, { onDone, pollMs = 2000, maxPolls = 4 } = {}) {
  const [result, setResult] = useState(null);
  const handled = useRef("");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const params = new URLSearchParams(search || "");
    const kind = params.get("purchase");
    if (!kind || handled.current === search) return undefined;
    handled.current = search;
    let cancelled = false;
    (async () => {
      let final;
      if (kind === "success" && params.get("session_id")) {
        setResult({ status: "CHECKING" });
        for (let i = 0; i <= maxPolls; i += 1) {
          const res = await ApiVerifyAiCreditPurchase({ sessionId: params.get("session_id") });
          final = res?.isSuccess ? { status: res.data.status, credits: res.data.payment?.credits ?? res.data.credits } : { status: "ERROR" };
          if (final.status !== "PENDING" || i === maxPolls || cancelled) break;
          await wait(pollMs);
        }
      } else if (kind === "cancelled" && params.get("payment_id")) {
        const res = await ApiCancelAiCreditPurchase({ paymentId: params.get("payment_id") });
        final = res?.isSuccess ? { status: res.data?.status || "CANCELLED", credits: res.data?.credits } : { status: "CANCELLED" };
      } else {
        return;
      }
      if (cancelled) return;
      setResult(final);
      onDoneRef.current?.(final);
    })();
    return () => {
      cancelled = true;
    };
  }, [search, pollMs, maxPolls]);

  return [result, () => setResult(null)];
}

const STYLES = {
  CHECKING: { icon: Loader2, spin: true, cls: "border-blue-200/70 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200" },
  PAID: { icon: CheckCircle2, cls: "border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200" },
  PENDING: { icon: Clock, cls: "border-blue-200/70 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200" },
  CANCELLED: { icon: XCircle, cls: "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-slate-200" },
  FAILED: { icon: XCircle, cls: "border-rose-200/70 dark:border-rose-800/40 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200" },
};

export default function PurchaseResultBanner({ result: [result, dismiss] = [] }) {
  const { t, i18n } = useTranslation();
  if (!result) return null;
  const status = result.status === "ERROR" || result.status === "UNKNOWN" ? "FAILED" : result.status;
  const style = STYLES[status] || STYLES.PENDING;
  const Icon = style.icon;
  const message = {
    CHECKING: t("Confirming your payment..."),
    PAID: result.credits ? t("Payment received: {{n}} credits were added to your wallet.", { n: formatCredits(result.credits, i18n.language) }) : t("Payment received: the credits were added to your wallet."),
    PENDING: t("Your payment is being processed. The credits will be added automatically as soon as it clears."),
    CANCELLED: t("Payment cancelled. You weren't charged."),
    FAILED: t("We couldn't confirm this payment. If you were charged, the credits will be added automatically; otherwise please try again."),
  }[status];
  return (
    <div role="status" id="ai-credits-purchase-result" className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] ${style.cls}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.spin ? "animate-spin" : ""}`} aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {status !== "CHECKING" && (
        <button type="button" onClick={dismiss} aria-label={t("Close")} className="opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
