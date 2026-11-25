import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Settings2, Calculator } from "lucide-react";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { Button } from "../../../../components/ui/button";
import { FEATURE_LABELS, formatCredits } from "../../../../helper/aiCredits/aiCredits";
import { Card, CardHeader } from "../aiCreditComponents";
import { labelCls } from "./AiCreditAdminModals";

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const nonNeg = (v) => Number.isFinite(num(v)) && num(v) >= 0;

/** Same rule as the server: longest matching model prefix, else the default rates. */
export function previewCost(form, model, inputTokens, outputTokens) {
  const m = String(model || "").toLowerCase();
  let rate = { input: num(form.inputCreditsPer1K) || 0, output: num(form.outputCreditsPer1K) || 0 };
  let best = "";
  for (const r of form.modelRates || []) {
    const key = String(r.model || "").trim().toLowerCase();
    if (key && m.startsWith(key) && key.length > best.length) {
      best = key;
      rate = { input: num(r.inputCreditsPer1K) || 0, output: num(r.outputCreditsPer1K) || 0 };
    }
  }
  const cost = (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  const min = num(form.minimumChargePerRequest) || 0;
  return Math.round(Math.max(cost, min) * 100) / 100;
}

export function validateSettings(form, t) {
  const errors = {};
  ["defaultMonthlyCredits", "inputCreditsPer1K", "outputCreditsPer1K", "minimumChargePerRequest"].forEach((k) => {
    if (!nonNeg(form[k])) errors[k] = t("Enter 0 or more");
  });
  Object.entries(form.featureReserves || {}).forEach(([k, v]) => {
    if (!nonNeg(v)) errors[`reserve.${k}`] = t("Enter 0 or more");
  });
  const seen = new Set();
  (form.modelRates || []).forEach((r, i) => {
    const key = String(r.model || "").trim().toLowerCase();
    if (!key) errors[`model.${i}`] = t("Model name is required");
    else if (seen.has(key)) errors[`model.${i}`] = t("This model is listed twice");
    seen.add(key);
    if (!nonNeg(r.inputCreditsPer1K) || !nonNeg(r.outputCreditsPer1K)) errors[`modelRate.${i}`] = t("Enter 0 or more");
  });
  return errors;
}

const Field = ({ id, label, hint, error, children }) => (
  <div>
    <label className={labelCls} htmlFor={id}>{label}</label>
    {children}
    {error ? <div className="text-red-500 text-[12px] mt-1">{error}</div> : hint ? <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{hint}</div> : null}
  </div>
);

export default function AiCreditSettingsForm({ settings, onSave, saving }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [sample, setSample] = useState({ model: "claude-haiku-5-5", input: 10000, output: 1000 });

  useEffect(() => {
    if (!settings) return;
    setForm({
      enforcementEnabled: settings.enforcementEnabled !== false,
      defaultMonthlyCredits: String(settings.defaultMonthlyCredits ?? ""),
      inputCreditsPer1K: String(settings.inputCreditsPer1K ?? ""),
      outputCreditsPer1K: String(settings.outputCreditsPer1K ?? ""),
      minimumChargePerRequest: String(settings.minimumChargePerRequest ?? 0),
      featureReserves: Object.fromEntries(Object.entries(settings.featureReserves || {}).map(([k, v]) => [k, String(v)])),
      modelRates: (settings.modelRates || []).map((r) => ({ model: r.model, inputCreditsPer1K: String(r.inputCreditsPer1K), outputCreditsPer1K: String(r.outputCreditsPer1K) })),
    });
    setErrors({});
  }, [settings]);

  const preview = useMemo(() => (form ? previewCost(form, sample.model, Number(sample.input) || 0, Number(sample.output) || 0) : 0), [form, sample]);
  if (!form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setRate = (i, k, v) => setForm((f) => ({ ...f, modelRates: f.modelRates.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  const submit = () => {
    const errs = validateSettings(form, t);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({
      enforcementEnabled: form.enforcementEnabled,
      defaultMonthlyCredits: Number(form.defaultMonthlyCredits),
      inputCreditsPer1K: Number(form.inputCreditsPer1K),
      outputCreditsPer1K: Number(form.outputCreditsPer1K),
      minimumChargePerRequest: Number(form.minimumChargePerRequest),
      featureReserves: Object.fromEntries(Object.entries(form.featureReserves).map(([k, v]) => [k, Number(v)])),
      modelRates: form.modelRates.map((r) => ({ model: r.model.trim(), inputCreditsPer1K: Number(r.inputCreditsPer1K), outputCreditsPer1K: Number(r.outputCreditsPer1K) })),
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" id="ai-credit-settings">
      <div className="xl:col-span-2 space-y-5">
        <Card>
          <CardHeader icon={<Settings2 className="w-3.5 h-3.5" />} title={t("Credits & limits")} subtitle={t("Changes apply to new AI requests within a minute.")} />
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] px-4 py-3 mb-5">
            <div>
              <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t("Enforce credit limits")}</div>
              <div className="text-[12px] text-slate-500 dark:text-slate-400">{t("When off, AI features never stop and no credits are taken; usage and tokens are still recorded.")}</div>
            </div>
            <Switch id="ai-credit-enforcement" checked={form.enforcementEnabled} onCheckedChange={(v) => set("enforcementEnabled", v)} aria-label={t("Enforce credit limits")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field id="ai-default-monthly" label={t("Standard monthly credits")} hint={t("For plans without their own AI credits. Set per plan on the Plans page.")} error={errors.defaultMonthlyCredits}>
              <Input id="ai-default-monthly" type="number" min="0" value={form.defaultMonthlyCredits} onChange={(e) => set("defaultMonthlyCredits", e.target.value)} />
            </Field>
            <Field id="ai-min-charge" label={t("Minimum charge per request")} hint={t("Credits charged at least, for any request that used AI.")} error={errors.minimumChargePerRequest}>
              <Input id="ai-min-charge" type="number" min="0" step="0.01" value={form.minimumChargePerRequest} onChange={(e) => set("minimumChargePerRequest", e.target.value)} />
            </Field>
            <Field id="ai-input-rate" label={t("Credits per 1,000 input tokens")} hint={t("Default for every model without its own rate.")} error={errors.inputCreditsPer1K}>
              <Input id="ai-input-rate" type="number" min="0" step="0.01" value={form.inputCreditsPer1K} onChange={(e) => set("inputCreditsPer1K", e.target.value)} />
            </Field>
            <Field id="ai-output-rate" label={t("Credits per 1,000 output tokens")} hint={t("Output usually costs more than input.")} error={errors.outputCreditsPer1K}>
              <Input id="ai-output-rate" type="number" min="0" step="0.01" value={form.outputCreditsPer1K} onChange={(e) => set("outputCreditsPer1K", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card id="ai-credit-model-rates">
          <CardHeader
            title={t("Rates per AI model")}
            subtitle={t("Optional. Matches the model name or its start, e.g. \"gpt-4o-mini\" or \"claude-\". The longest match wins.")}
            right={
              <Button type="button" variant="outline" className="btn-premium-secondary h-8 text-[12px]" onClick={() => set("modelRates", [...form.modelRates, { model: "", inputCreditsPer1K: form.inputCreditsPer1K, outputCreditsPer1K: form.outputCreditsPer1K }])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t("Add model")}
              </Button>
            }
          />
          {!form.modelRates.length ? (
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 m-0">{t("Every model uses the default rates.")}</p>
          ) : (
            <div className="space-y-2.5">
              <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{t("Model")}</span>
                <span>{t("Input / 1K")}</span>
                <span>{t("Output / 1K")}</span>
                <span />
              </div>
              {form.modelRates.map((r, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 items-start">
                  <div>
                    <Input aria-label={t("Model")} value={r.model} placeholder="gpt-4o-mini" onChange={(e) => setRate(i, "model", e.target.value)} />
                    {errors[`model.${i}`] && <div className="text-red-500 text-[12px] mt-1">{errors[`model.${i}`]}</div>}
                  </div>
                  <Input aria-label={t("Input / 1K")} type="number" min="0" step="0.01" value={r.inputCreditsPer1K} onChange={(e) => setRate(i, "inputCreditsPer1K", e.target.value)} />
                  <div>
                    <Input aria-label={t("Output / 1K")} type="number" min="0" step="0.01" value={r.outputCreditsPer1K} onChange={(e) => setRate(i, "outputCreditsPer1K", e.target.value)} />
                    {errors[`modelRate.${i}`] && <div className="text-red-500 text-[12px] mt-1">{errors[`modelRate.${i}`]}</div>}
                  </div>
                  <button type="button" title={t("Remove")} aria-label={t("Remove")} onClick={() => set("modelRates", form.modelRates.filter((_, j) => j !== i))} className="h-9 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="ai-credit-reserves">
          <CardHeader title={t("Credits held per request")} subtitle={t("Held while a request runs and returned after it is charged its real cost. A request needs at least this much to start.")} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(form.featureReserves).map(([k, v]) => (
              <Field key={k} id={`ai-reserve-${k}`} label={t(FEATURE_LABELS[k] || k)} error={errors[`reserve.${k}`]}>
                <Input id={`ai-reserve-${k}`} type="number" min="0" value={v} onChange={(e) => set("featureReserves", { ...form.featureReserves, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="button" id="ai-credit-settings-save" className="btn-premium-primary px-5 font-bold" disabled={saving} onClick={submit}>
            {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
            {t("Save settings")}
          </Button>
        </div>
      </div>

      <Card id="ai-credit-cost-preview" className="self-start xl:sticky xl:top-4">
        <CardHeader icon={<Calculator className="w-3.5 h-3.5" />} title={t("Cost preview")} subtitle={t("What one request costs with the settings above.")} />
        <div className="space-y-3">
          <Field id="ai-preview-model" label={t("Model")}>
            <Input id="ai-preview-model" value={sample.model} onChange={(e) => setSample((s) => ({ ...s, model: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ai-preview-in" label={t("Input tokens")}>
              <Input id="ai-preview-in" type="number" min="0" value={sample.input} onChange={(e) => setSample((s) => ({ ...s, input: e.target.value }))} />
            </Field>
            <Field id="ai-preview-out" label={t("Output tokens")}>
              <Input id="ai-preview-out" type="number" min="0" value={sample.output} onChange={(e) => setSample((s) => ({ ...s, output: e.target.value }))} />
            </Field>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("Cost")}</div>
            <div className="text-[24px] font-extrabold text-slate-900 dark:text-white tabular-nums" id="ai-preview-cost">{t("{{amount}} credits", { amount: formatCredits(preview, i18n.language) })}</div>
            {Number(form.defaultMonthlyCredits) > 0 && preview > 0 && (
              <div className="text-[12px] text-slate-500 dark:text-slate-400">{t("About {{n}} such requests fit in the standard monthly credits.", { n: Math.floor(Number(form.defaultMonthlyCredits) / preview).toLocaleString(i18n.language) })}</div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
