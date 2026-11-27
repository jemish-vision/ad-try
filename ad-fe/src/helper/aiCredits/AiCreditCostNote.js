import React from "react";
import { useTranslation } from "react-i18next";
import AiCreditBadge from "./AiCreditBadge";
import { formatCredits, useAiCredits } from "./aiCredits";

/**
 * How a feature is paid when the organization uses its own API keys:
 * "own" (every provider it uses has a saved key), "partial" (some do) or "credits" (none / own keys off).
 */
export function ownKeyCoverage(ownKeys, feature) {
  if (!ownKeys?.usePersonalKeys) return "credits";
  const providers = feature ? ownKeys.featureProviders?.[feature] : null;
  if (!providers?.length) return "credits";
  const saved = new Set(ownKeys.providers || []);
  const covered = providers.filter((p) => saved.has(p)).length;
  if (covered === providers.length) return "own";
  return covered > 0 ? "partial" : "credits";
}

/**
 * "This uses AI credits" note with the live credit badge, shown next to an AI action.
 * feature: the AI feature (e.g. "APLUS_CONTENT"), so the note knows if it runs on the organization's own keys.
 * images: number of AI images the action generates (priced per image).
 */
export default function AiCreditCostNote({ id = "ai-credit-cost-note", feature, images = 0, className = "" }) {
  const { t, i18n } = useTranslation();
  const { data } = useAiCredits();
  const perImage = data?.rates?.creditsPerImage;
  const coverage = ownKeyCoverage(data?.ownKeys, feature);
  // Every provider this feature uses has a saved key: no credits are used for this
  if (coverage === "own") {
    return (
      <div id={id} className={`flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 ${className}`.trim()}>
        <span>{t("Runs on your organization's own AI API keys: no AI credits are used.")}</span>
      </div>
    );
  }
  const text =
    coverage === "partial"
      ? t("Part of this runs on your organization's own AI API keys; the rest uses AI credits.")
      : images > 0 && perImage !== undefined
      ? t("Uses AI credits: {{amount}} for the {{n}} images, plus the text.", { amount: formatCredits(images * perImage, i18n.language), n: images })
      : t("Uses AI credits from your organization's monthly allowance.");
  return (
    <div id={id} className={`flex items-center justify-between gap-3 flex-wrap text-[12px] text-slate-500 dark:text-slate-400 ${className}`}>
      <span>{text}</span>
      <AiCreditBadge id={`${id}-badge`} />
    </div>
  );
}
