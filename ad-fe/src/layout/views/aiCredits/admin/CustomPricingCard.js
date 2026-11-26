import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal, AlertTriangle } from "lucide-react";
import Toast from "../../../../common/helper/toast/Toast";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { ApiAdminUpdateAiCreditCustomPricing } from "../../../../api-wrapper/ApiAiCredits";
import { formatCredits } from "../../../../helper/aiCredits/aiCredits";
import { Card, CardHeader, formatMoney } from "../aiCreditComponents";
import { customTotal } from "../CustomCreditsRow";
import { labelCls } from "./AiCreditAdminModals";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SAR", "CAD", "AUD", "JPY"];
const DEFAULTS = { enabled: false, ratePer1K: "", currency: "USD", minCredits: "100", maxCredits: "50000", step: "50", regionalRates: {} };

const toForm = (c) =>
  c
    ? {
        enabled: Boolean(c.enabled),
        ratePer1K: c.ratePer1K ? String(c.ratePer1K) : "",
        currency: c.currency || "USD",
        minCredits: String(c.minCredits ?? 100),
        maxCredits: String(c.maxCredits ?? 50000),
        step: String(c.step ?? 50),
        regionalRates: Object.fromEntries((c.regionalRates || []).map((r) => [String(r.regionId), String(r.ratePer1K)])),
      }
    : DEFAULTS;

const whole = (v) => String(v).trim() !== "" && Number.isInteger(Number(v));

/** Same rules as the server's validateCustomInput (the server also checks Stripe's minimum charge). */
export function validateCustomForm(form, t) {
  const errors = {};
  const rate = Number(form.ratePer1K || 0);
  if (!(rate >= 0)) errors.ratePer1K = t("Price must be 0 or more");
  else if (form.enabled && !(rate > 0)) errors.ratePer1K = t("Set a price per 1,000 credits before turning custom amounts on");
  const min = Number(form.minCredits);
  const max = Number(form.maxCredits);
  const step = Number(form.step);
  if (!whole(form.step) || step < 1) errors.step = t("Step must be a whole number of 1 or more");
  if (!whole(form.minCredits) || min < 1) errors.minCredits = t("Minimum must be a whole number of 1 or more");
  if (!whole(form.maxCredits) || max < min) errors.maxCredits = t("Maximum must be a whole number not below the minimum");
  else if (max > 1000000) errors.maxCredits = t("Maximum can't be more than 1,000,000 credits");
  if (!errors.step && !errors.minCredits && !errors.maxCredits && (min % step || max % step)) errors.step = t("Minimum and maximum must be multiples of the step");
  Object.entries(form.regionalRates || {}).forEach(([id, v]) => {
    if (v !== "" && v !== undefined && !(Number(v) > 0)) errors[`region.${id}`] = t("Price must be greater than 0");
  });
  return errors;
}

/**
 * Packages that are cheaper per credit than the custom amount would be.
 * Compared only where the currency is the same (default prices, and each region's prices).
 */
export function cheaperThanPackages(form, packages = [], regions = []) {
  const out = [];
  const rate = Number(form.ratePer1K || 0);
  for (const p of packages) {
    if (p.isActive === false || !(p.credits > 0)) continue;
    const pkgPer1K = (p.price / p.credits) * 1000;
    if (rate > 0 && String(p.currency).toUpperCase() === String(form.currency).toUpperCase() && rate < pkgPer1K) {
      out.push({ name: p.name, region: null, per1K: pkgPer1K, currency: p.currency });
    }
    for (const rp of p.regionalPrices || []) {
      const regionRate = Number(form.regionalRates?.[String(rp.regionId)] || 0);
      const region = regions.find((r) => String(r._id) === String(rp.regionId));
      const per1K = (rp.price / p.credits) * 1000;
      if (region && regionRate > 0 && regionRate < per1K) out.push({ name: p.name, region: region.name, per1K, currency: region.currency });
    }
  }
  return out;
}

/** Super Admin: let buyers choose their own number of credits at a flat price per 1,000 credits. */
export default function CustomPricingCard({ custom, packages = [], regions = [], onSaved }) {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const [form, setForm] = useState(() => toForm(custom));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Reset only when the saved settings change (reloading the packages must not wipe unsaved edits)
  const savedKey = JSON.stringify(custom || null);
  useEffect(() => {
    setForm(toForm(custom));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const warnings = useMemo(() => cheaperThanPackages(form, packages, regions), [form, packages, regions]);
  const exampleCredits = Math.min(Number(form.maxCredits) || 1000, Math.max(Number(form.minCredits) || 0, 1000));

  const save = async () => {
    const errs = validateCustomForm(form, t);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const res = await ApiAdminUpdateAiCreditCustomPricing({
      enabled: form.enabled,
      ratePer1K: Number(form.ratePer1K || 0),
      currency: form.currency,
      minCredits: Number(form.minCredits),
      maxCredits: Number(form.maxCredits),
      step: Number(form.step),
      regionalRates: Object.entries(form.regionalRates)
        .filter(([, v]) => v !== "" && v !== undefined)
        .map(([regionId, v]) => ({ regionId, ratePer1K: Number(v) })),
    });
    setSaving(false);
    if (res?.isSuccess) {
      Toast.success(t(res.message || "Saved"));
      onSaved?.();
    } else Toast.error(res?.message || t("Something went wrong"));
  };

  const field = (id, label, input, error, hint) => (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      {input}
      {error ? <div className="text-red-500 text-[12px] mt-1">{error}</div> : hint ? <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{hint}</div> : null}
    </div>
  );

  return (
    <Card id="ai-custom-pricing">
      <CardHeader
        icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
        title={t("Custom amount")}
        subtitle={t("Let buyers choose their own number of credits at a flat price per 1,000 credits. Shown under the packages as \"Need a different amount?\".")}
        right={
          <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            {t("Allow custom amounts")}
            <Switch id="ai-custom-enabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label={t("Allow custom amounts")} />
          </label>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {field(
          "ai-custom-rate",
          t("Price per 1,000 credits"),
          <Input id="ai-custom-rate" type="number" min="0" step="0.01" value={form.ratePer1K} onChange={(e) => set("ratePer1K", e.target.value)} />,
          errors.ratePer1K,
          t("Charged to everyone outside the pricing regions below."),
        )}
        {field(
          "ai-custom-currency",
          t("Currency"),
          <select id="ai-custom-currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} className="h-9 w-full px-2.5 rounded-md text-[13px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>,
        )}
        {field("ai-custom-min", t("Minimum credits"), <Input id="ai-custom-min" type="number" min="1" value={form.minCredits} onChange={(e) => set("minCredits", e.target.value)} />, errors.minCredits)}
        {field("ai-custom-max", t("Maximum credits"), <Input id="ai-custom-max" type="number" min="1" value={form.maxCredits} onChange={(e) => set("maxCredits", e.target.value)} />, errors.maxCredits)}
        {field("ai-custom-step", t("Step"), <Input id="ai-custom-step" type="number" min="1" value={form.step} onChange={(e) => set("step", e.target.value)} />, errors.step, t("Amounts must be a multiple of this."))}
      </div>

      {Number(form.ratePer1K) > 0 && exampleCredits > 0 && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-3 mb-0" id="ai-custom-example">
          {t("Example: {{n}} credits = {{price}}", { n: formatCredits(exampleCredits, L), price: formatMoney(customTotal(exampleCredits, form.ratePer1K, form.currency), form.currency, L) })}
        </p>
      )}

      <div className="mt-4">
        <div className={labelCls}>{t("Price per 1,000 credits per pricing region (optional)")}</div>
        {regions.length === 0 ? (
          <div className="text-[11.5px] text-slate-500 dark:text-slate-400">{t("No pricing regions yet. Add regions on the Plans page (Pricing Regions); credit packages use the same regions.")}</div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] divide-y divide-slate-100 dark:divide-white/5">
              {regions.map((r) => {
                const id = String(r._id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {r.name} {r.isActive === false && <span className="text-[11px] font-normal text-slate-400">({t("inactive")})</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{(r.countries || []).join(", ")}</div>
                    </div>
                    <div className="w-[160px]">
                      <Input
                        aria-label={t("Price per 1,000 credits in {{currency}} for {{region}}", { currency: r.currency, region: r.name })}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t("Default rate")}
                        value={form.regionalRates[id] ?? ""}
                        onChange={(e) => set("regionalRates", { ...form.regionalRates, [id]: e.target.value })}
                      />
                      {errors[`region.${id}`] && <div className="text-red-500 text-[11px] mt-0.5">{errors[`region.${id}`]}</div>}
                    </div>
                    <span className="w-10 text-[12px] font-semibold text-slate-500 dark:text-slate-400">{r.currency}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{t("Leave blank to charge the default rate in that region.")}</div>
          </>
        )}
      </div>

      {warnings.length > 0 && (
        <div role="status" id="ai-custom-cheaper-warning" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200/80 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-semibold">{t("Custom amounts would cost less per credit than some packages, so buyers may skip them:")}</div>
            <ul className="m-0 mt-1 pl-4 list-disc">
              {warnings.map((w) => (
                <li key={`${w.name}-${w.region || "default"}`}>
                  {w.region
                    ? t("{{package}} in {{region}}: {{price}} per 1,000 credits", { package: w.name, region: w.region, price: formatMoney(w.per1K, w.currency, L) })
                    : t("{{package}}: {{price}} per 1,000 credits", { package: w.name, price: formatMoney(w.per1K, w.currency, L) })}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button type="button" id="ai-custom-save" className="btn-premium-primary px-5 font-bold" disabled={saving} onClick={save}>
          {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
          {t("Save custom amount")}
        </Button>
      </div>
    </Card>
  );
}
