import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { Sparkles } from "lucide-react";
import { AppTooltip } from "../../components/ui/AppTooltip";
import { creditLevel, formatCredits, useAiCredits } from "./aiCredits";

const TONES = {
  ok: "bg-blue-50 text-blue-700 border-blue-200/70 hover:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
  low: "bg-amber-50 text-amber-700 border-amber-200/70 hover:border-amber-400 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
  empty: "bg-rose-50 text-rose-700 border-rose-200/70 hover:border-rose-400 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
};

/**
 * Compact "N AI credits left" pill. Click opens the AI Credits page.
 * Hidden when the wallet can't be loaded (e.g. Super Admin without an organization).
 */
export default function AiCreditBadge({ id = "ai-credit-badge", className = "" }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { wallet, data } = useAiCredits();
  if (!wallet) return null;

  const level = data?.enforcementEnabled === false ? "ok" : creditLevel(wallet);
  const tip = (
    <div className="text-left text-[12px] leading-relaxed">
      <div className="font-semibold">{t("AI credits this month")}</div>
      <div>{t("{{used}} of {{total}} used", { used: formatCredits(wallet.used, i18n.language), total: formatCredits(wallet.allocated, i18n.language) })}</div>
      <div>{t("Refills on {{date}}", { date: moment(wallet.nextResetAt).format("DD MMM YYYY") })}</div>
    </div>
  );

  return (
    <AppTooltip text={tip} side="bottom">
      <button
        type="button"
        id={id}
        onClick={() => navigate("/ai-credits")}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-semibold whitespace-nowrap transition-colors ${TONES[level]} ${className}`}
        aria-label={t("AI credits: {{amount}} left", { amount: formatCredits(wallet.available, i18n.language) })}
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        {level === "empty" ? t("No AI credits left") : t("{{amount}} credits left", { amount: formatCredits(wallet.available, i18n.language) })}
      </button>
    </AppTooltip>
  );
}
