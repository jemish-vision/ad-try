import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingCart, Loader2, Lock } from "lucide-react";
import { ApiGetAiCreditPackages, ApiPurchaseAiCredits } from "../../../api-wrapper/ApiAiCredits";
import Toast from "../../../common/helper/toast/Toast";
import { formatCredits } from "../../../helper/aiCredits/aiCredits";
import { Card, CardHeader, formatMoney } from "./aiCreditComponents";

/** Sends the browser to Stripe Checkout (kept separate so tests can replace it). */
export const goToCheckout = (url) => window.location.assign(url);

// Fill the row: 3 packages → 3 columns, 4+ → 4 (static class names so Tailwind keeps them).
const GRID_COLS = { 1: "max-w-md", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" };

/**
 * Credit packages the organization can buy. The organization owner pays on Stripe; everyone else
 * sees the packages and is asked to contact the owner. Demo accounts can't buy.
 */
export default function BuyCreditsSection({ redirect = goToCheckout }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    ApiGetAiCreditPackages().then((res) => setData(res?.isSuccess ? res.data : { packages: [], canPurchase: false }));
  }, []);

  if (!data) return <div role="status" className="animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04] h-[180px]" />;
  if (!data.packages?.length) return null; // nothing on sale

  const buy = async (pkg) => {
    setBuying(pkg._id);
    const res = await ApiPurchaseAiCredits({ packageId: pkg._id });
    if (res?.isSuccess && res.data?.url) {
      redirect(res.data.url);
      return; // leaving for Stripe
    }
    setBuying(null);
    Toast.error(t(res?.message || "Payment could not be started. Please try again."));
  };

  const cheapest = Math.min(...data.packages.map((p) => p.pricePerCredit ?? Infinity));

  return (
    <Card id="ai-credits-buy">
      <CardHeader
        icon={<ShoppingCart className="w-3.5 h-3.5" />}
        title={t("Buy more credits")}
        subtitle={t("Purchased credits are added right after payment, never expire, and are used after the monthly credits.")}
      />
      {!data.canPurchase && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-3.5 py-2.5 mb-4 text-[12.5px] text-slate-600 dark:text-slate-300" id="ai-credits-buy-locked">
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {data.isDemo ? t("Buying credits isn't available in demo mode.") : t("Only the organization owner can buy credits. Ask your owner if your team needs more.")}
        </div>
      )}
      <div className={`grid grid-cols-1 gap-3.5 ${GRID_COLS[Math.min(data.packages.length, 4)] || ""}`}>
        {data.packages.map((p) => (
          <div
            key={p._id}
            data-testid="ai-credit-package"
            className={`relative flex flex-col rounded-xl border px-4 py-4 bg-white dark:bg-white/[0.02] ${p.isPopular ? "border-[#2374F2] ring-1 ring-[#2374F2]/30" : "border-slate-200/80 dark:border-white/[0.08]"}`}
          >
            {p.isPopular && <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#2374F2] text-white">{t("Most popular")}</span>}
            <div className="text-[13px] font-bold text-slate-900 dark:text-white">{p.name}</div>
            <div className="mt-1 text-[24px] font-extrabold text-slate-900 dark:text-white tabular-nums">
              {formatCredits(p.credits, i18n.language)} <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{t("credits")}</span>
            </div>
            <div className="text-[18px] font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatMoney(p.price, p.currency, i18n.language)}</div>
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t("{{price}} per 1,000 credits", { price: formatMoney((p.price / p.credits) * 1000, p.currency, i18n.language) })}
              {p.pricePerCredit === cheapest && data.packages.length > 1 && <span className="ml-1.5 font-semibold text-emerald-600 dark:text-emerald-400">· {t("Best value")}</span>}
            </div>
            {p.description && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 mb-0">{p.description}</p>}
            <div className="flex-1" />
            <button
              type="button"
              data-demo-block
              id={`ai-credits-buy-${p._id}`}
              disabled={!data.canPurchase || Boolean(buying)}
              onClick={() => buy(p)}
              className="mt-3.5 h-9 rounded-lg text-[13px] font-semibold bg-[#2374F2] text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {buying === p._id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
              {buying === p._id ? t("Opening secure checkout...") : t("Buy for {{price}}", { price: formatMoney(p.price, p.currency, i18n.language) })}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-3.5 mb-0">{t("Payments are processed securely by Stripe. Prices include the currency for your country.")}</p>
    </Card>
  );
}
