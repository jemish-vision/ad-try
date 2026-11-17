import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { MultiSelect } from "../../../components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { CURRENCY_CODES, countryOptions, currencySymbol } from "../../../common/constants/countries";

const YEARLY_MULTIPLIER = 10;
const labelCls = "text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block";

const defaultPrice = (plan) => {
  const monthly = Number(plan?.monthlyPrice > 0 ? plan.monthlyPrice : plan?.price || 0);
  const yearly = Number(plan?.yearlyPrice > 0 ? plan.yearlyPrice : monthly * YEARLY_MULTIPLIER);
  return { monthly, yearly, currency: plan?.currency || "USD" };
};

export default function RegionModal({ open, onClose, region, plans, onSave, saving }) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [countries, setCountries] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [prices, setPrices] = useState({});
  const [error, setError] = useState("");

  const options = useMemo(() => countryOptions(i18n.language), [i18n.language]);

  useEffect(() => {
    if (!open) return;
    setName(region?.name || "");
    setCurrency(region?.currency || "INR");
    setCountries(region?.countries || []);
    setIsActive(region ? region.isActive !== false : true);
    const map = {};
    for (const p of region?.prices || []) {
      map[String(p.packageId)] = { monthlyPrice: p.monthlyPrice || "", yearlyPrice: p.yearlyPrice || "" };
    }
    setPrices(map);
    setError("");
  }, [open, region]);

  const setPrice = (planId, field, value) =>
    setPrices((prev) => ({ ...prev, [planId]: { ...(prev[planId] || {}), [field]: value } }));

  const submit = () => {
    if (!name.trim()) return setError(t("Region name is required"));
    if (!countries.length) return setError(t("Select at least one country"));
    const rows = Object.entries(prices)
      .map(([packageId, p]) => ({ packageId, monthlyPrice: Number(p.monthlyPrice || 0), yearlyPrice: Number(p.yearlyPrice || 0) }))
      .filter((p) => p.monthlyPrice > 0);
    if (!rows.length) return setError(t("Enter a monthly price for at least one plan"));
    setError("");
    onSave({ regionId: region?._id, name: name.trim(), currency, countries, isActive, prices: rows });
  };

  const sym = currencySymbol(currency);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-[860px] w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        id="pricing-region-modal"
      >
        <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
          <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">
            {region?._id ? t("Edit Pricing Region") : t("Add Pricing Region")}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>{t("Region Name")}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. India")} />
            </div>
            <div>
              <label className={labelCls}>{t("Currency")}</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue>{currency}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {CURRENCY_CODES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("Countries")}</label>
            <MultiSelect
              options={options}
              value={countries}
              onChange={setCountries}
              placeholder={t("Select countries")}
              maxCount={6}
              showSelectAll={false}
              className="w-full bg-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              {t("Visitors from these countries see and pay the prices below. A country can be in only one active region.")}
            </p>
          </div>

          <div>
            <label className={labelCls}>{t("Plan Prices")} ({currency})</label>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">{t("Plan")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Default Price")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Monthly")} ({sym.trim()})</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Yearly")} ({sym.trim()})</th>
                  </tr>
                </thead>
                <tbody>
                  {(plans || []).map((plan) => {
                    const d = defaultPrice(plan);
                    const row = prices[plan._id] || {};
                    const monthly = Number(row.monthlyPrice || 0);
                    return (
                      <tr key={plan._id} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                          {plan.name}
                          {plan.isActive === false && <span className="ml-2 text-[10px] text-slate-400">{t("Inactive")}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {currencySymbol(d.currency)}{d.monthly} / {t("mo")} · {currencySymbol(d.currency)}{d.yearly} / {t("year")}
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" className="h-9 w-32" value={row.monthlyPrice ?? ""}
                            placeholder={t("Default")} onChange={(e) => setPrice(plan._id, "monthlyPrice", e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" className="h-9 w-32" value={row.yearlyPrice ?? ""}
                            placeholder={monthly > 0 ? String(monthly * YEARLY_MULTIPLIER) : t("Default")}
                            onChange={(e) => setPrice(plan._id, "yearlyPrice", e.target.value)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              {t("Leave a plan empty to charge its default price in this region. Empty yearly price = monthly × 10.")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-sm text-slate-700 dark:text-slate-200">{t("Active")}</span>
          </div>

          {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
        </div>

        <div className="p-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-800">
          <Button variant="outline" type="button" className="btn-premium-secondary" disabled={saving} onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="button" className="btn-premium-primary px-5 font-bold" disabled={saving} onClick={submit}>
            {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
            {region?._id ? t("Update Region") : t("Create Region")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
