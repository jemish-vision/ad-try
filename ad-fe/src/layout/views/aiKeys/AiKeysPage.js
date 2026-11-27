import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { KeyRound, ShieldCheck, AlertTriangle, Eye, EyeOff, Lock, Plus, RefreshCw, Trash2, Info } from "lucide-react";
import Toast from "../../../common/helper/toast/Toast";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { ApiGetAiKeys, ApiSaveAiKey, ApiValidateAiKey, ApiRemoveAiKey, ApiUpdateAiKeySettings } from "../../../api-wrapper/ApiAiKeys";
import { AI_PROVIDER_LABELS, FEATURE_LABELS, notifyAiCreditsChanged } from "../../../helper/aiCredits/aiCredits";
import { Card, CardHeader } from "../aiCredits/aiCreditComponents";

/** Where to create a key, per provider. */
const KEY_SOURCES = {
  anthropic: "console.anthropic.com → API Keys",
  openai: "platform.openai.com → API keys",
  gemini: "aistudio.google.com → Get API key",
};

export const KEY_STATUS = {
  VALID: { label: "Working", cls: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40" },
  INVALID: { label: "Rejected", cls: "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40" },
  QUOTA_EXCEEDED: { label: "Out of quota", cls: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40" },
  RATE_LIMITED: { label: "Rate limited", cls: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40" },
  UNVERIFIED: { label: "Not checked", cls: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/[0.06]" },
};

/** Features that can't run fully on the saved keys (Campaign AI Analysis needs either provider). */
export function missingCoverage(data) {
  if (!data) return [];
  const saved = new Set((data.providers || []).filter((p) => p.key).map((p) => p.provider));
  return Object.entries(data.featureProviders || {})
    .map(([feature, providers]) => {
      const anyOne = feature === "CAMPAIGN_ANALYSIS";
      const missing = providers.filter((p) => !saved.has(p));
      const blocked = anyOne ? missing.length === providers.length : missing.length > 0;
      return blocked ? { feature, missing, anyOne } : null;
    })
    .filter(Boolean);
}

/** Turns a key/settings error from the server into a message in the user's language. */
function keyErrorText(res, t, providerLabel) {
  switch (res?.code) {
    case "KEY_FORMAT_INVALID":
      return t("This doesn't look like a valid {{provider}} key. Paste the whole key, without spaces.", { provider: providerLabel });
    case "KEY_REJECTED":
      return t("{{provider}} rejected this key. Check that it is correct and still active.", { provider: providerLabel });
    case "KEYS_REQUIRED":
      return t("Add at least one API key before turning on your own keys.");
    case "NOT_ALLOWED":
      return t("Only the organization owner can manage AI API keys.");
    default:
      return t(res?.message || "Something went wrong");
  }
}

function KeyModal({ target, onClose, onSaved }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const label = target ? t(AI_PROVIDER_LABELS[target.provider] || target.provider) : "";

  // The key never stays in memory after the dialog closes
  useEffect(() => {
    setValue("");
    setShow(false);
    setError(null);
    setDetail(null);
  }, [target]);

  const save = async () => {
    if (!value.trim()) {
      setError(t("Paste the API key."));
      return;
    }
    setSaving(true);
    setError(null);
    setDetail(null);
    const res = await ApiSaveAiKey({ provider: target.provider, apiKey: value.trim() });
    setSaving(false);
    if (res?.isSuccess) {
      setValue("");
      Toast.success(t(res.message || "API key saved"));
      onSaved();
      onClose();
    } else {
      setError(keyErrorText(res, t, label));
      if (res?.code === "KEY_REJECTED" && res?.message) setDetail(res.message);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0" onInteractOutside={(e) => e.preventDefault()} id="ai-key-modal">
        <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
          <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">
            {target?.replace ? t("Replace {{provider}} key", { provider: label }) : t("Add {{provider}} key", { provider: label })}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3">
          <label htmlFor="ai-key-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("API key")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="ai-key-input"
              name="ai-provider-api-key"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={target?.provider === "gemini" ? "AIza…" : target?.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
              style={show ? undefined : { WebkitTextSecurity: "disc" }}
              className="h-10 flex-1 min-w-0 px-3 rounded-lg font-mono text-[13px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t("Hide key") : t("Show key")} className="h-10 w-10 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <div role="alert" className="text-[12.5px] text-rose-600 dark:text-rose-400">
              {error}
              {detail && <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">{detail}</div>}
            </div>
          )}
          <p className="text-[12px] text-slate-500 dark:text-slate-400 m-0">
            {t("Create a key at {{where}}.", { where: KEY_SOURCES[target?.provider] || "" })}
          </p>
          <p className="flex items-start gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 m-0">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {t("We check the key with {{provider}} before saving it. It is stored encrypted and is never shown again; only its last 4 characters are displayed.", { provider: label })}
          </p>
        </div>
        <div className="p-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-800">
          <Button variant="outline" type="button" className="btn-premium-secondary" disabled={saving} onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="button" id="ai-key-save" className="btn-premium-primary px-5 font-bold" disabled={saving} onClick={save}>
            {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
            {saving ? t("Checking key...") : t("Check and save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderCard({ item, canManage, ownKeysOn, onAdd, onCheck, onRemove, busy }) {
  const { t, i18n } = useTranslation();
  const k = item.key;
  const status = KEY_STATUS[k?.status] || KEY_STATUS.UNVERIFIED;
  const label = t(AI_PROVIDER_LABELS[item.provider] || item.provider);
  const when = (d) => (d ? moment(d).locale(i18n.language || "en").fromNow() : null);
  const btn = "h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/25 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50";
  return (
    <section id={`ai-keys-provider-${item.provider}`} aria-labelledby={`ai-keys-provider-${item.provider}-name`} data-testid="ai-key-provider" className="flex flex-col rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <h3 id={`ai-keys-provider-${item.provider}-name`} className="m-0 text-[14px] font-bold text-slate-900 dark:text-white">{label}</h3>
        {k && <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${status.cls}`}>{t(status.label)}</span>}
      </div>
      <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">
        {t("Used by: {{features}}", { features: item.features.map((f) => t(FEATURE_LABELS[f] || f)).join(", ") || "—" })}
      </div>
      <div className="mt-3 flex-1">
        {k ? (
          <>
            <div className="font-mono text-[13px] text-slate-800 dark:text-slate-100" aria-label={t("Saved key")}>{k.keyHint}</div>
            {k.statusMessage && k.status !== "VALID" && <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{k.statusMessage}</div>}
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
              {k.lastValidatedAt && <div>{t("Checked {{when}}", { when: when(k.lastValidatedAt) })}</div>}
              <div>{k.lastUsedAt ? t("Last used {{when}}", { when: when(k.lastUsedAt) }) : t("Not used yet")}</div>
            </div>
          </>
        ) : (
          <div className="text-[12.5px] text-slate-500 dark:text-slate-400">
            {t("No key saved.")}
            {ownKeysOn && <div className="text-amber-700 dark:text-amber-300 mt-1">{t("Features that use {{provider}} can't run on your own keys.", { provider: label })}</div>}
          </div>
        )}
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2 mt-3.5">
          {k ? (
            <>
              <button type="button" data-demo-block className={btn} disabled={busy} onClick={() => onAdd(item, true)}>
                <KeyRound className="w-3.5 h-3.5" /> {t("Replace")}
              </button>
              <button type="button" data-demo-block className={btn} disabled={busy} onClick={() => onCheck(item)}>
                <RefreshCw className="w-3.5 h-3.5" /> {t("Check again")}
              </button>
              <button type="button" data-demo-block className={`${btn} hover:!text-rose-600 dark:hover:!text-rose-400 hover:!bg-rose-50 dark:hover:!bg-rose-950/40 hover:!border-rose-300 dark:hover:!border-rose-500/40`} disabled={busy} onClick={() => onRemove(item)} aria-label={t("Remove {{provider}} key", { provider: label })}>
                <Trash2 className="w-3.5 h-3.5" /> {t("Remove")}
              </button>
            </>
          ) : (
            <button type="button" data-demo-block id={`ai-keys-add-${item.provider}`} className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 bg-[#2374F2] text-white hover:bg-blue-700 disabled:opacity-50" disabled={busy} onClick={() => onAdd(item, false)}>
              <Plus className="w-3.5 h-3.5" /> {t("Add key")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * AI API Keys: the organization can run AI on its own provider keys instead of AI credits.
 * The owner manages the keys and the two switches; everyone else sees the masked status.
 */
export default function AiKeysPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [modal, setModal] = useState(null);
  const [toRemove, setToRemove] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await ApiGetAiKeys();
    if (res?.isSuccess) {
      setData(res.data);
      setFailed(false);
    } else setFailed(true);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const coverage = useMemo(() => missingCoverage(data), [data]);
  if (!data) {
    return (
      <div className="cq p-4 sm:p-6 space-y-4" id="ai-keys-page">
        {failed ? <p className="text-[13px] text-slate-500">{t("AI API keys could not be loaded.")}</p> : <div role="status" className="animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04] h-[220px]" />}
      </div>
    );
  }
  const { settings, canManage } = data;
  const ownOn = settings.usePersonalKeys;

  const changeSetting = async (patch) => {
    setBusy(true);
    const res = await ApiUpdateAiKeySettings(patch);
    setBusy(false);
    if (res?.isSuccess) {
      Toast.success(t(res.message || "Settings saved"));
      notifyAiCreditsChanged();
      load();
    } else Toast.error(keyErrorText(res, t));
  };
  const check = async (item) => {
    setBusy(true);
    const res = await ApiValidateAiKey({ provider: item.provider });
    setBusy(false);
    if (res?.isSuccess) {
      const st = KEY_STATUS[res.data?.status] || KEY_STATUS.UNVERIFIED;
      (res.data?.status === "VALID" ? Toast.success : Toast.error)(t("{{provider}} key: {{status}}", { provider: t(AI_PROVIDER_LABELS[item.provider]), status: t(st.label) }));
      load();
    } else Toast.error(keyErrorText(res, t, t(AI_PROVIDER_LABELS[item.provider])));
  };
  const remove = async () => {
    const item = toRemove;
    setToRemove(null);
    setBusy(true);
    const res = await ApiRemoveAiKey({ provider: item.provider });
    setBusy(false);
    if (res?.isSuccess) {
      Toast.success(t(res.message || "API key removed"));
      load();
    } else Toast.error(keyErrorText(res, t));
  };

  return (
    <div className="cq p-4 sm:p-6 pb-16 sm:pb-16 space-y-5" id="ai-keys-page">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
          <KeyRound className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight m-0 flex items-center gap-2 flex-wrap">
            {t("AI API Keys")}
            {data.isDemo && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40">{t("Demo data")}</span>}
          </h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5 mb-0">
            {t("Run AI features on your organization's own provider API keys. Requests on your keys don't use AI credits; your provider bills you directly.")}
          </p>
        </div>
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] text-slate-600 dark:text-slate-300" id="ai-keys-locked">
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {data.isDemo ? t("API keys can't be changed in demo mode.") : t("Only the organization owner can manage AI API keys.")}
        </div>
      )}

      <Card id="ai-keys-mode">
        <CardHeader icon={<ShieldCheck className="w-3.5 h-3.5" />} title={t("How AI requests are paid")} subtitle={ownOn ? t("AI requests run on your keys below and don't use AI credits.") : t("AI runs on the platform's keys and uses your organization's AI credits.")} />
        <div className="grid grid-cols-1 cq-md:grid-cols-2 gap-3">
          <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] px-4 py-3">
            <span>
              <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t("Use our own API keys")}</span>
              <span className="block text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{t("AI Assistant, Optimize with AI, A+ Content and the other AI features use the keys saved below.")}</span>
            </span>
            <Switch id="ai-keys-use-own" checked={ownOn} disabled={!canManage || busy} onCheckedChange={(v) => changeSetting({ usePersonalKeys: v })} aria-label={t("Use our own API keys")} data-demo-block />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] px-4 py-3">
            <span>
              <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t("Use AI credits when our key can't be used")}</span>
              <span className="block text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                {settings.allowWalletFallback
                  ? t("On: if a key is missing, rejected or out of quota, the request runs on the platform's key and uses AI credits.")
                  : t("Off: if a key is missing, rejected or out of quota, the request stops with a message and nothing is charged.")}
              </span>
            </span>
            <Switch id="ai-keys-wallet-fallback" checked={settings.allowWalletFallback} disabled={!canManage || busy || !ownOn} onCheckedChange={(v) => changeSetting({ allowWalletFallback: v })} aria-label={t("Use AI credits when our key can't be used")} data-demo-block />
          </label>
        </div>
        {ownOn && coverage.length > 0 && (
          <div role="status" id="ai-keys-coverage" aria-labelledby="ai-keys-coverage-title" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/80 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <div id="ai-keys-coverage-title" className="font-semibold">
                {settings.allowWalletFallback ? t("These features will use AI credits because a key is missing:") : t("These features will stop with a message because a key is missing:")}
              </div>
              <ul className="m-0 mt-1 pl-4 list-disc">
                {coverage.map((c) => (
                  <li key={c.feature}>
                    {t(c.anyOne ? "{{feature}}: needs a {{providers}} key" : "{{feature}}: needs {{providers}}", {
                      feature: t(FEATURE_LABELS[c.feature] || c.feature),
                      providers: c.missing.map((p) => t(AI_PROVIDER_LABELS[p])).join(c.anyOne ? ` ${t("or")} ` : ", "),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card id="ai-keys-providers">
        <CardHeader icon={<KeyRound className="w-3.5 h-3.5" />} title={t("Provider keys")} subtitle={t("One key per provider. Each feature keeps the AI model it uses today; only the key changes.")} />
        <div className="grid grid-cols-1 cq-md:grid-cols-3 gap-3.5">
          {data.providers.map((item) => (
            <ProviderCard key={item.provider} item={item} canManage={canManage} ownKeysOn={ownOn} busy={busy} onAdd={(it, replace) => setModal({ provider: it.provider, replace })} onCheck={check} onRemove={setToRemove} />
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400 mt-3.5 mb-0" id="ai-keys-security">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {t("Keys are stored encrypted and are only used for your organization's AI requests. They are never shown again; only the last 4 characters are displayed. Usage is still recorded in AI Credits (tokens and models), marked \"Your key\".")}
        </p>
      </Card>

      <KeyModal target={modal} onClose={() => setModal(null)} onSaved={load} />
      <CustomModal
        show={Boolean(toRemove)}
        onHide={() => setToRemove(null)}
        title={t("Remove API key")}
        subtitle={toRemove ? t(AI_PROVIDER_LABELS[toRemove.provider]) : ""}
        icon="delete"
        iconVariant="danger"
        message={
          ownOn
            ? settings.allowWalletFallback
              ? t("Features that use this provider will run on the platform's key and use AI credits.")
              : t("Features that use this provider will stop working until a new key is added or your own keys are turned off.")
            : t("The key will be deleted.")
        }
        actions={[
          { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setToRemove(null) },
          { label: t("Remove"), variant: "danger", icon: "delete", onClick: remove },
        ]}
      />
    </div>
  );
}
