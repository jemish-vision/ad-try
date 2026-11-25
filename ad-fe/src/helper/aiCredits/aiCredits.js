import { useCallback, useEffect, useState } from "react";
import i18n from "i18next";
import { ApiGetAiCreditSummary } from "../../api-wrapper/ApiAiCredits";

export const AI_CREDITS_CHANGED = "ai-credits:changed";
export const CREDITS_EXHAUSTED = "AI_CREDITS_EXHAUSTED";

export const FEATURE_LABELS = {
  AI_ASSISTANT: "AI Assistant",
  LISTING_OPTIMIZATION: "Optimize with AI",
  LISTING_GENERATION: "AI listing generation",
  APLUS_CONTENT: "A+ Content",
  CAMPAIGN_ANALYSIS: "Campaign AI Analysis",
};

/** A fresh id for one AI action; sent as X-AI-Request-Id so a repeated submit is never charged twice. */
export function newAiRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Tell every credit badge to refresh (call after an AI request finishes). */
export function notifyAiCreditsChanged() {
  invalidate();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_CREDITS_CHANGED));
}

/** True when an API response says the organization is out of AI credits. */
export const isCreditsExhausted = (res) => res?.code === CREDITS_EXHAUSTED || res?.error?.code === CREDITS_EXHAUSTED;

/** Credit amounts: whole numbers stay whole, otherwise up to 2 decimals. */
export function formatCredits(n, locale) {
  const v = Number(n) || 0;
  return v.toLocaleString(locale || undefined, { maximumFractionDigits: 2 });
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Chat reply (HTML) shown when the organization has no AI credits left, in the user's language. */
export function creditsExhaustedHtml() {
  const t = (k) => (typeof i18n?.t === "function" ? i18n.t(k) : k);
  return `<p><b>${esc(t("You've run out of AI credits for this month."))}</b></p><p>${esc(t("Your organization's credits refill on the next reset date. Ask your administrator if you need more credits sooner."))} <a href="/ai-credits">${esc(t("View AI credits"))}</a></p>`;
}

/**
 * For API calls that run an AI feature: refresh the credit badges and, when the organization is
 * out of credits, put a translated message in res.message (screens show res.message on failure).
 */
export function handleAiCreditResponse(res) {
  notifyAiCreditsChanged();
  if (!isCreditsExhausted(res)) return res;
  const t = (k) => (typeof i18n?.t === "function" ? i18n.t(k) : k);
  return { ...res, message: t("You've run out of AI credits for this month.") };
}

/** Headers for one AI action: a fresh X-AI-Request-Id so a repeated submit is never charged twice. */
export const aiRequestHeaders = () => ({ "X-AI-Request-Id": newAiRequestId() });

export const formatTokens = (n, locale) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString(locale || undefined, { maximumFractionDigits: 1 })}M`;
  if (v >= 1e4) return `${(v / 1e3).toLocaleString(locale || undefined, { maximumFractionDigits: 1 })}K`;
  return v.toLocaleString(locale || undefined);
};

/** "low" under 20% left, "empty" at 0, else "ok". */
export function creditLevel(wallet) {
  if (!wallet) return "ok";
  if (!(wallet.available > 0)) return "empty";
  if (wallet.allocated > 0 && wallet.available / wallet.allocated < 0.2) return "low";
  return "ok";
}

// One summary request shared by every badge on the page (30 s cache).
let cached = null;
let cachedAt = 0;
let inflight = null;
function invalidate() {
  cached = null;
  cachedAt = 0;
}
async function loadSummary(force) {
  if (!force && cached && Date.now() - cachedAt < 30000) return cached;
  if (!inflight) {
    inflight = ApiGetAiCreditSummary()
      .then((res) => {
        cached = res?.isSuccess ? res.data : null;
        cachedAt = Date.now();
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The organization's credit summary; refreshes whenever notifyAiCreditsChanged() is called. */
export function useAiCredits({ enabled = true } = {}) {
  const [data, setData] = useState(cached);
  const [loading, setLoading] = useState(!cached && enabled);

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) return null;
      setLoading(true);
      const d = await loadSummary(force);
      setData(d);
      setLoading(false);
      return d;
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    refresh(false);
    const onChange = () => refresh(true);
    window.addEventListener(AI_CREDITS_CHANGED, onChange);
    return () => window.removeEventListener(AI_CREDITS_CHANGED, onChange);
  }, [enabled, refresh]);

  return { data, wallet: data?.wallet || null, loading, refresh };
}

export const __resetAiCreditCache = invalidate;
