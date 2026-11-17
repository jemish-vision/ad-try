import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import Toast from "../../../common/helper/toast/Toast";
import { currencySymbol, regionalYearlyPrice } from "../../../common/constants/countries";
import { ApiPlanRegionPrices, ApiUpdatePlanRegionPrices } from "../../../api-wrapper/ApiPricingRegions";

const YEARLY_MULTIPLIER = 10;

/** One plan's price in every pricing region (opened from the Plans grid). */
export default function PlanRegionPricesModal({ plan, onClose, onSaved, onAddRegion }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!plan?._id) return;
    setLoading(true);
    ApiPlanRegionPrices({ packageId: plan._id }).then((res) => {
      if (res?.isSuccess) {
        setRows((res.data || []).map((r) => ({ ...r, monthlyPrice: r.monthlyPrice || "", yearlyPrice: r.yearlyPrice || "" })));
      } else Toast.error(res?.message || t("Something went wrong"));
      setLoading(false);
    });
  }, [plan, t]);

  const setValue = (regionId, field, value) =>
    setRows((prev) => prev.map((r) => (String(r.regionId) === String(regionId) ? { ...r, [field]: value } : r)));

  const save = async () => {
    setSaving(true);
    const res = await ApiUpdatePlanRegionPrices({
      packageId: plan._id,
      prices: rows.map((r) => ({ regionId: r.regionId, monthlyPrice: Number(r.monthlyPrice || 0), yearlyPrice: Number(r.yearlyPrice || 0) })),
    });
    setSaving(false);
    if (res?.isSuccess) {
      Toast.success(t(res.message));
      onSaved?.();
      onClose();
    } else Toast.error(res?.message || t("Something went wrong"));
  };

  const defMonthly = Number(plan?.monthlyPrice > 0 ? plan.monthlyPrice : plan?.price || 0);
  const defYearly = Number(plan?.yearlyPrice > 0 ? plan.yearlyPrice : defMonthly * YEARLY_MULTIPLIER);

  return (
    <Dialog open={Boolean(plan)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[820px] w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        id="plan-region-prices-modal"
      >
        <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
          <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">
            {t("Regional Prices")}
            <span className="font-normal ml-2 text-sm text-gray-500 dark:text-gray-400">— {plan?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 flex flex-col gap-3 max-h-[65vh] overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t("Default price")}: <b>{currencySymbol(plan?.currency)}{defMonthly}</b> / {t("mo")} · <b>{currencySymbol(plan?.currency)}{defYearly}</b> / {t("year")}.{" "}
            {t("Leave a region empty to charge the default price there. Empty yearly price = 12 months with 20% off.")}
          </div>

          {loading ? (
            <div className="py-10 text-center text-slate-500"><i className="fa-solid fa-spinner fa-spin mr-2" />{t("Loading...")}</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
              {t("No pricing regions yet. Add a region first.")}
              {onAddRegion && (
                <Button type="button" className="btn-premium-primary" onClick={() => { onClose(); onAddRegion(); }}>
                  <i className="fa fa-plus mr-1.5" />{t("Add Region")}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">{t("Region")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Countries")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Monthly")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Yearly")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sym = currencySymbol(r.currency).trim();
                    const monthly = Number(r.monthlyPrice || 0);
                    return (
                      <tr key={r.regionId} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          {r.name} <span className="text-xs font-medium text-slate-500">({r.currency})</span>
                          {!r.isActive && <span className="ml-2 text-[10px] text-slate-400">{t("Inactive")}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 max-w-[220px] truncate" title={(r.countries || []).join(", ")}>
                          {(r.countries || []).join(", ")}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 w-8 text-right shrink-0">{sym}</span>
                            <Input type="number" min="0" className="h-9 w-32" value={r.monthlyPrice}
                              placeholder={t("Default")} onChange={(e) => setValue(r.regionId, "monthlyPrice", e.target.value)} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 w-8 text-right shrink-0">{sym}</span>
                            <Input type="number" min="0" className="h-9 w-32" value={r.yearlyPrice}
                              placeholder={monthly > 0 ? String(regionalYearlyPrice(monthly)) : t("Default")}
                              onChange={(e) => setValue(r.regionId, "yearlyPrice", e.target.value)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-800">
          <Button variant="outline" type="button" className="btn-premium-secondary" disabled={saving} onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="button" className="btn-premium-primary px-5 font-bold" disabled={saving || loading || !rows.length} onClick={save}>
            {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
            {t("Save Prices")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
