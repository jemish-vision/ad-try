import React from "react";
import { useTranslation } from "react-i18next";
import AiCreditBadge from "./AiCreditBadge";
import { formatCredits, useAiCredits } from "./aiCredits";

/**
 * "This uses AI credits" note with the live credit badge, shown next to an AI action.
 * images: number of AI images the action generates (priced per image).
 */
export default function AiCreditCostNote({ id = "ai-credit-cost-note", images = 0, className = "" }) {
  const { t, i18n } = useTranslation();
  const { data } = useAiCredits();
  const perImage = data?.rates?.creditsPerImage;
  // The organization runs AI on its own API keys: no credits are used for this
  if (data?.ownKeys?.usePersonalKeys) {
    return (
      <div id={id} className={`flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 ${className}`.trim()}>
        <span>{t("Runs on your organization's own AI API keys: no AI credits are used.")}</span>
      </div>
    );
  }
  const text =
    images > 0 && perImage !== undefined
      ? t("Uses AI credits: {{amount}} for the {{n}} images, plus the text.", { amount: formatCredits(images * perImage, i18n.language), n: images })
      : t("Uses AI credits from your organization's monthly allowance.");
  return (
    <div id={id} className={`flex items-center justify-between gap-3 flex-wrap text-[12px] text-slate-500 dark:text-slate-400 ${className}`}>
      <span>{text}</span>
      <AiCreditBadge id={`${id}-badge`} />
    </div>
  );
}
