import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { formatCredits } from "../../../helper/aiCredits/aiCredits";
import { formatMoney } from "./aiCreditComponents";

// Same rounding as the server (Stripe's smallest unit per currency)
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
const factorOf = (currency) => {
  const c = String(currency || "").toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
};

/** Total for `credits` at `pricePerCredit` (display only: the server works out the price it charges). */
export function customTotal(credits, pricePerCredit, currency) {
  const f = factorOf(currency);
  let minor = Math.round(Number(credits) * Number(pricePerCredit) * f);
  if (f === 1000) minor = Math.round(minor / 10) * 10;
  return minor / f;
}

/** null when the amount can be bought, else the message to show. */
export function customAmountError(value, offer, t, lang) {
  const n = Number(value);
  const range = { min: formatCredits(offer.minCredits, lang), max: formatCredits(offer.maxCredits, lang) };
  if (String(value).trim() === "" || !Number.isInteger(n)) return t("Enter a whole number of credits.");
  if (n < offer.minCredits) return t("Minimum {{min}} credits.", range);
  if (n > offer.maxCredits) return t("Maximum {{max}} credits.", range);
  return null;
}

/** A starting amount inside the limits: 1,000 credits when allowed, else the nearest limit. */
export function defaultCustomAmount(offer) {
  return Math.min(offer.maxCredits, Math.max(offer.minCredits, 1000));
}

/**
 * "Need a different amount?" — buy any whole number of credits between the limits Super Admin set,
 * at a price per credit for the buyer's region. Shown under the credit packages.
 */
export default function CustomCreditsRow({ offer, canPurchase, buying, onBuy }) {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const [value, setValue] = useState(() => String(defaultCustomAmount(offer)));
  const error = customAmountError(value, offer, t, L);
  const credits = Number(value);
  const total = error ? null : customTotal(credits, offer.pricePerCredit, offer.currency);
  const isBuying = buying === "custom";

  return (
    <div id="ai-credits-custom" role="group" aria-labelledby="ai-credits-custom-title" className="mt-4 rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/60 dark:bg-white/[0.02] px-4 py-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-start gap-2.5 lg:w-[34%] min-w-0">
          <SlidersHorizontal className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-sky-400" aria-hidden="true" />
          <div className="min-w-0">
            <div id="ai-credits-custom-title" className="text-[13px] font-bold text-slate-900 dark:text-white">{t("Need a different amount?")}</div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400">
              {t("Buy any amount from {{min}} to {{max}} credits.", { min: formatCredits(offer.minCredits, L), max: formatCredits(offer.maxCredits, L) })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              id="ai-credits-custom-amount"
              type="number"
              inputMode="numeric"
              min={offer.minCredits}
              max={offer.maxCredits}
              step={1}
              value={value}
              disabled={!canPurchase}
              aria-label={t("Number of credits")}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "ai-credits-custom-error" : undefined}
              onChange={(e) => setValue(e.target.value)}
              className={`h-9 w-full max-w-[200px] px-3 rounded-lg text-[14px] font-semibold tabular-nums bg-white dark:bg-slate-950 border text-slate-900 dark:text-white disabled:opacity-60 ${error ? "border-rose-400 dark:border-rose-500/70" : "border-slate-200 dark:border-white/10"}`}
            />
            <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{t("credits")}</span>
          </div>
          {error && (
            <div id="ai-credits-custom-error" role="alert" className="text-[11.5px] text-rose-600 dark:text-rose-400 mt-1">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 lg:justify-end">
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("Total")}</div>
            <div className="text-[18px] font-bold text-slate-900 dark:text-white tabular-nums" id="ai-credits-custom-total">
              {total === null ? "—" : formatMoney(total, offer.currency, L)}
            </div>
          </div>
          <button
            type="button"
            data-demo-block
            id="ai-credits-buy-custom"
            disabled={!canPurchase || Boolean(error) || Boolean(buying)}
            onClick={() => onBuy(credits)}
            className="h-9 px-4 rounded-lg text-[13px] font-semibold bg-[#2374F2] text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            {isBuying ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            {isBuying ? t("Opening secure checkout...") : error ? t("Buy credits") : t("Buy {{n}} credits", { n: formatCredits(credits, L) })}
          </button>
        </div>
      </div>
    </div>
  );
}
